import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fs from 'fs-extra';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  budgetMultiple,
  hookTimeoutMs,
  jobTimeoutMinutes,
  slowestHookMs,
  slowestJobSeconds,
  slowestTestMs,
  testTimeoutMs,
} from './test/budgets.js';

/**
 * Guards the suite's time budgets.
 *
 * A per-call budget below the global default for its kind caps the heaviest
 * work in a file tighter than the suite caps everything around it, which is
 * what took out single tests and hooks on the slow CI runners. The globals are
 * measured, so a per-call budget below one is a number nobody chose.
 *
 * @see ../contributing/testing.md
 */
const sourceRoot = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)));

/** Where the measured budgets have to read the same as the module holding them. */
const rulesDoc = Path.join(sourceRoot, '../contributing/testing.md');

/** The workflow whose test job the job budget caps. */
const ciWorkflow = Path.join(sourceRoot, '../.github/workflows/ci.yml');

/** The calls vitest gives a budget of its own, by the kind it is read from. */
const budgetedCalls = new Map<string, 'test' | 'hook'>([
  ['it', 'test'],
  ['test', 'test'],
  ['describe', 'test'],
  ['suite', 'test'],
  ['bench', 'test'],
  ['beforeAll', 'hook'],
  ['beforeEach', 'hook'],
  ['afterAll', 'hook'],
  ['afterEach', 'hook'],
]);

interface PerCallBudget {
  file: string;
  line: number;
  call: string;
  kind: 'test' | 'hook';
  ms: number;
}

/**
 * The identifier a call expression starts from, so `it.skipIf(x)(...)` and
 * `it.each(rows)(...)` are read as `it` while `vi.waitFor(...)` is read as
 * `vi` and left alone.
 */
function calleeRoot(expression: ts.Expression): string | undefined {
  let current: ts.Expression = expression;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isCallExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

/** The milliseconds an argument gives a call, both forms vitest accepts. */
function budgetOf(argument: ts.Expression): ts.NumericLiteral | undefined {
  if (ts.isNumericLiteral(argument)) return argument;
  if (!ts.isObjectLiteralExpression(argument)) return undefined;
  for (const property of argument.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      property.name.getText() === 'timeout' &&
      ts.isNumericLiteral(property.initializer)
    ) {
      return property.initializer;
    }
  }
  return undefined;
}

/** Every per-call budget a test file hands a test or a hook. */
function perCallBudgets(file: string, source: string): PerCallBudget[] {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ESNext,
    true
  );
  const budgets: PerCallBudget[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const call = calleeRoot(node.expression);
      const kind = call === undefined ? undefined : budgetedCalls.get(call);
      if (call !== undefined && kind !== undefined) {
        for (const argument of node.arguments) {
          const literal = budgetOf(argument);
          if (literal === undefined) continue;
          budgets.push({
            file,
            line:
              parsed.getLineAndCharacterOfPosition(literal.getStart(parsed))
                .line + 1,
            call,
            kind,
            ms: Number(literal.text.replaceAll('_', '')),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return budgets;
}

async function testFilesIn(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await Fs.readdir(directory, { withFileTypes: true })) {
    const path = Path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await testFilesIn(path)));
    else if (entry.name.endsWith('.test.ts')) files.push(path);
  }
  return files.toSorted();
}

describe('timeout budgets', () => {
  it('gives no test and no hook in src/ less time than the global default', async () => {
    const files = await testFilesIn(sourceRoot);

    // Sanity check that the sweep still finds the suite's test files at all.
    expect(files.length).toBeGreaterThan(50);

    const tooTight: PerCallBudget[] = [];
    for (const file of files) {
      const source = await Fs.readFile(file, 'utf8');
      for (const budget of perCallBudgets(file, source)) {
        const global = budget.kind === 'hook' ? hookTimeoutMs : testTimeoutMs;
        if (budget.ms < global) tooTight.push(budget);
      }
    }

    expect(
      tooTight.map(
        (budget) =>
          `${Path.relative(sourceRoot, budget.file)}:${budget.line} ${budget.call} gets ${budget.ms}ms, under the measured ${budget.kind} budget of ${budget.kind === 'hook' ? hookTimeoutMs : testTimeoutMs}ms`
      ),
      'A per-call budget under the global default caps the heaviest work in a file tighter than the suite caps everything else. Drop it, or measure it and raise the global, see contributing/testing.md.'
    ).toEqual([]);
  });

  it('reads both forms vitest accepts, on a test and on a hook', () => {
    const source = [
      "it('a trailing argument', fn, 1);",
      "it('an options object', { timeout: 2 }, fn);",
      "it.skipIf(skip)('a filtered test', fn, 3);",
      'beforeAll(fn, 4);',
      'afterEach(fn, 5);',
      'vi.waitFor(fn, { timeout: 6 });',
      'request(url, { timeout: 7 });',
    ].join('\n');

    expect(
      perCallBudgets('fixture.test.ts', source).map(
        (budget) => `${budget.line} ${budget.call} ${budget.kind} ${budget.ms}`
      )
    ).toEqual([
      '1 it test 1',
      '2 it test 2',
      '3 it test 3',
      '4 beforeAll hook 4',
      '5 afterEach hook 5',
    ]);
  });

  it('caps the CI test job at the same multiple', async () => {
    const workflow = await Fs.readFile(ciWorkflow, 'utf8');
    const capped = workflow.match(/^\s*timeout-minutes: (\d+)$/m);

    expect(
      capped?.[1],
      `The test job has to allow ${jobTimeoutMinutes} minutes, the slowest job measured times ${budgetMultiple}, so a slow runner fails on a named test rather than as a killed job. See contributing/testing.md.`
    ).toBe(String(jobTimeoutMinutes));
  });

  it('states every measured budget in contributing/testing.md', async () => {
    const doc = await Fs.readFile(rulesDoc, 'utf8');
    const stated = [
      ...[slowestTestMs, testTimeoutMs, slowestHookMs, hookTimeoutMs].map(
        (ms) => `${ms.toLocaleString('en-US')}ms`
      ),
      `${slowestJobSeconds}s`,
      `${jobTimeoutMinutes} minutes`,
      `multiple is ${budgetMultiple}`,
    ];

    expect(
      stated.filter((number) => !doc.includes(number)),
      'A budget the doc does not state is a number the next maintainer cannot check. See contributing/testing.md.'
    ).toEqual([]);
  });
});
