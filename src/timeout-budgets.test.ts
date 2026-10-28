import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fs from 'fs-extra';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.js';
import {
  budgetMultiple,
  cleanupTimeoutMs,
  hookTimeoutMs,
  hungTeardownMs,
  jobTimeoutMinutes,
  slowestCleanupMs,
  slowestHookMs,
  slowestJobSeconds,
  slowestTestMs,
  testTimeoutMs,
} from './test/budgets.js';
import { TEARDOWN_BOUND_MS } from './util/teardown.js';

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

/** Every job that runs the suite, so every one of them carries the job budget. */
const suiteJobs = [
  { workflow: '.github/workflows/ci.yml', job: 'test' },
  { workflow: '.github/workflows/cd.yml', job: 'release' },
];

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

/** A budget a call gives itself, `ms` unset when it is not a plain number. */
interface PerCallBudget {
  file: string;
  line: number;
  call: string;
  kind: 'test' | 'hook';
  ms: number | undefined;
  source: string;
}

/** A budget read off one argument, or that the argument cannot be read. */
type ReadBudget = { readable: true; ms: number } | { readable: false };

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

/**
 * Whether a call only narrows the one applied to its result, the way
 * `it.each(rows)` and `it.skipIf(flag)` do. Its arguments are the modifier's
 * table or condition, never a budget.
 */
function isModifier(node: ts.CallExpression): boolean {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

/**
 * The arguments vitest reads a budget from. A test names itself, then takes
 * its callback or its options, then its budget. A hook has no name, so
 * everything shifts by one. An options object carries the budget as a
 * property instead, and then there is no trailing argument.
 */
function budgetArguments(
  node: ts.CallExpression,
  kind: 'test' | 'hook'
): ts.Expression[] {
  const options = node.arguments.filter(ts.isObjectLiteralExpression);
  if (options.length > 0) return options;
  const trailing = node.arguments[kind === 'test' ? 2 : 1];
  return trailing === undefined ? [] : [trailing];
}

/** Reads the milliseconds off an argument, both forms vitest accepts. */
function budgetOf(argument: ts.Expression): ReadBudget | undefined {
  const milliseconds = (literal: ts.NumericLiteral): ReadBudget => ({
    readable: true,
    ms: Number(literal.text.replaceAll('_', '')),
  });
  if (ts.isNumericLiteral(argument)) return milliseconds(argument);
  if (!ts.isObjectLiteralExpression(argument)) return { readable: false };
  const timeout = argument.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText() === 'timeout'
  );
  if (timeout === undefined) return undefined;
  return ts.isNumericLiteral(timeout.initializer)
    ? milliseconds(timeout.initializer)
    : { readable: false };
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
    if (ts.isCallExpression(node) && !isModifier(node)) {
      const call = calleeRoot(node.expression);
      const kind = call === undefined ? undefined : budgetedCalls.get(call);
      if (call !== undefined && kind !== undefined) {
        for (const argument of budgetArguments(node, kind)) {
          const read = budgetOf(argument);
          if (read === undefined) continue;
          budgets.push({
            file,
            line:
              parsed.getLineAndCharacterOfPosition(argument.getStart(parsed))
                .line + 1,
            call,
            kind,
            ms: read.readable ? read.ms : undefined,
            source: argument.getText(parsed),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return budgets;
}

/** What a named job of a workflow gives itself, read from its own block. */
function jobCap(workflow: string, job: string): string | undefined {
  const lines = workflow.split('\n');
  const opens = lines.indexOf(`  ${job}:`);
  if (opens === -1) return undefined;
  for (const line of lines.slice(opens + 1)) {
    if (/^ {2}\S/.test(line)) return undefined;
    const capped = line.match(/^ {4}timeout-minutes: (\d+)$/);
    if (capped) return capped[1];
  }
  return undefined;
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

    const offenders: string[] = [];
    for (const file of files) {
      const source = await Fs.readFile(file, 'utf8');
      for (const budget of perCallBudgets(file, source)) {
        const global = budget.kind === 'hook' ? hookTimeoutMs : testTimeoutMs;
        const where = `${Path.relative(sourceRoot, budget.file)}:${budget.line} ${budget.call}`;
        if (budget.ms === undefined) {
          offenders.push(
            `${where} gets "${budget.source}", which no check can compare against the global`
          );
        } else if (budget.ms < global) {
          offenders.push(
            `${where} gets ${budget.ms}ms, under the measured ${budget.kind} budget of ${global}ms`
          );
        }
      }
    }

    expect(
      offenders,
      'A per-call budget under the global default caps the heaviest work in a file tighter than the suite caps everything else. Drop it, or measure it and raise the global, see contributing/testing.md.'
    ).toEqual([]);
  });

  it('reads every budget form, and nothing a modifier or another call takes', () => {
    const source = [
      "it('a trailing argument', () => {}, 1);",
      "it('an options object', { timeout: 2 }, () => {});",
      "it.skipIf(skip)('a filtered test', () => {}, 3);",
      'beforeAll(() => {}, 4);',
      'afterEach(() => {}, 5);',
      "it('a computed budget', () => {}, 30 * 1000);",
      "it('a named budget', () => {}, slow);",
      "it.each(rows)('a table case %s', () => {});",
      "describe.each(rows)('a table suite %s', () => {});",
      "it('options without a budget', { retry: 2 }, () => {});",
      "it('a plain test', () => {});",
      'beforeAll(() => {});',
      "it('a helper as its body', body);",
      'vi.waitFor(() => {}, { timeout: 6 });',
      'request(url, { timeout: 7 });',
    ].join('\n');

    expect(
      perCallBudgets('fixture.test.ts', source).map(
        (budget) =>
          `${budget.line} ${budget.call} ${budget.kind} ${budget.ms ?? budget.source}`
      )
    ).toEqual([
      '1 it test 1',
      '2 it test 2',
      '3 it test 3',
      '4 beforeAll hook 4',
      '5 afterEach hook 5',
      '6 it test 30 * 1000',
      '7 it test slow',
    ]);
  });

  it('is the budget the vitest config runs with', () => {
    expect(
      {
        testTimeout: vitestConfig.test?.testTimeout,
        hookTimeout: vitestConfig.test?.hookTimeout,
      },
      'The config has to run on the measured budgets, or this guard compares per-call budgets against a default the suite does not use. See contributing/testing.md.'
    ).toEqual({ testTimeout: testTimeoutMs, hookTimeout: hookTimeoutMs });
  });

  it('caps every job that runs the suite at the same multiple', async () => {
    const capped: Record<string, string | undefined> = {};
    const wanted: Record<string, string> = {};
    for (const { workflow, job } of suiteJobs) {
      const source = await Fs.readFile(
        Path.join(sourceRoot, '..', workflow),
        'utf8'
      );
      capped[`${workflow} ${job}`] = jobCap(source, job);
      wanted[`${workflow} ${job}`] = String(jobTimeoutMinutes);
    }

    expect(
      capped,
      `Every job running the suite has to allow ${jobTimeoutMinutes} minutes, the slowest job measured times ${budgetMultiple}, so a slow runner fails on a named test rather than as a killed job. See contributing/testing.md.`
    ).toEqual(wanted);
  });

  it('reads the cap of the named job rather than the first in a workflow', () => {
    const workflow = [
      'jobs:',
      '  lint:',
      '    timeout-minutes: 5',
      '    runs-on: ubuntu-24.04',
      '  test:',
      '    name: Testing',
      '    timeout-minutes: 15',
      '  release:',
      '    runs-on: ubuntu-latest',
    ].join('\n');

    expect(jobCap(workflow, 'test')).toBe('15');
    expect(jobCap(workflow, 'lint')).toBe('5');
    expect(jobCap(workflow, 'release')).toBeUndefined();
    expect(jobCap(workflow, 'absent')).toBeUndefined();
  });

  it('bounds a cleanup well inside the hook it runs in', () => {
    // dispose() bounds each of its three steps, then the suite bounds the
    // one step left to it, so this is the whole of what a cleanup can cost
    const slowestCleanup = 3 * TEARDOWN_BOUND_MS + cleanupTimeoutMs;

    expect(
      {
        isCleanupInsideTheHook: slowestCleanup < hookTimeoutMs,
        isHangLongerThanABoundedStep: hungTeardownMs > TEARDOWN_BOUND_MS,
      },
      'A cleanup has to give up long before the hook budget does, or a stalled step is a hook timeout again with nothing named. A test reading a teardown as hung has to wait longer than Core waits itself, or it reports a bound that worked as a hang. See contributing/testing.md.'
    ).toEqual({
      isCleanupInsideTheHook: true,
      isHangLongerThanABoundedStep: true,
    });
  });

  it('states every measured budget in contributing/testing.md', async () => {
    const doc = await Fs.readFile(rulesDoc, 'utf8');
    const stated = [
      ...[
        slowestTestMs,
        testTimeoutMs,
        slowestHookMs,
        hookTimeoutMs,
        slowestCleanupMs,
        cleanupTimeoutMs,
        TEARDOWN_BOUND_MS,
        hungTeardownMs,
      ].map((ms) => `${ms.toLocaleString('en-US')}ms`),
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
