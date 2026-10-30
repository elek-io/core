import Fs from 'fs-extra';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guards the paths the suite writes under the OS temp directory.
 *
 * A fixed one is shared by every run of the suite on the machine, so two runs
 * in one checkout take each other's files away mid-test, see
 * contributing/testing.md.
 */
const sourceRoot = Path.resolve(
  Path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

/** The calls that build a path out of segments. */
const joiningCalls = new Set(['join', 'resolve']);

/** The calls that add a unique last segment to the path they are given. */
const generatingCalls = new Set(['mkdtemp', 'mkdtempSync']);

/** A segment that differs between two calls, so the path is not fixed. */
const varyingKinds = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.CallExpression,
]);

/** Where a fixed temp path was built. */
interface FixedPath {
  line: number;
  source: string;
}

/** The name a call expression calls, `Os.tmpdir()` reading as `tmpdir`. */
function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

/** Whether a call hands the path it builds to one that makes it unique. */
function isGenerated(join: ts.CallExpression): boolean {
  const { parent } = join;
  if (!ts.isCallExpression(parent)) return false;
  const name = calleeName(parent.expression);
  return name !== undefined && generatingCalls.has(name);
}

/** Every fixed path a file builds under the OS temp directory. */
export function fixedTmpPaths(file: string, source: string): FixedPath[] {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ESNext,
    true
  );
  const found: FixedPath[] = [];

  const report = (node: ts.Node) => {
    found.push({
      line:
        parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
      source: node.getText(parsed),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calleeName(node.expression) === 'tmpdir') {
      const join = node.parent;
      const isJoin =
        ts.isCallExpression(join) &&
        joiningCalls.has(calleeName(join.expression) ?? '') &&
        join.arguments.includes(node);
      if (!isJoin) {
        // A shape this rule cannot read, such as the directory kept in a
        // variable and joined somewhere else
        report(node);
      } else if (
        !join.arguments.some(
          (argument) => argument !== node && varyingKinds.has(argument.kind)
        ) &&
        !isGenerated(join)
      ) {
        report(join);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return found;
}

/** Every file the suite is made of, the harness included. */
async function testSourcesIn(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await Fs.readdir(directory, { withFileTypes: true })) {
    const path = Path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await testSourcesIn(path)));
    else if (
      entry.name.endsWith('.test.ts') ||
      (entry.name.endsWith('.ts') &&
        Path.relative(sourceRoot, path).startsWith(`test${Path.sep}`))
    ) {
      files.push(path);
    }
  }
  return files.toSorted();
}

describe('paths under the OS temp directory', () => {
  it('builds none of them from fixed segments only', async () => {
    const files = await testSourcesIn(sourceRoot);

    // Sanity check that the sweep still finds the suite's files at all.
    expect(files.length).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await Fs.readFile(file, 'utf8');
      for (const fixed of fixedTmpPaths(file, source)) {
        offenders.push(
          `${Path.relative(sourceRoot, file)}:${fixed.line} ${fixed.source}`
        );
      }
    }

    expect(
      offenders,
      'A fixed path under the OS temp directory is shared by every run of the suite on this machine. Put a uuid() or another call in the name, or let mkdtemp make the last segment, see contributing/testing.md.'
    ).toEqual([]);
  });

  it('reads the shapes the suite uses, and only flags the fixed ones', () => {
    const source = [
      "const a = Path.join(Os.tmpdir(), 'fixed-name');",
      'const b = Path.join(Os.tmpdir(), `named-${uuid()}`);',
      'const c = Path.join(Os.tmpdir(), `${uuid()}.png`);',
      "const d = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'prefix-'));",
      "const e = await Fs.mkdtemp(Path.join(Os.tmpdir(), 'prefix-'));",
      "const f = Path.resolve(Os.tmpdir(), 'fixed', 'deeper');",
      'const g = Path.join(Os.tmpdir(), uuid());',
      'const h = Os.tmpdir();',
      'const i = Path.join(Os.homedir(), `elek.io-test`);',
      "vi.spyOn(Os, 'tmpdir').mockReturnValue(root);",
    ].join('\n');

    expect(
      fixedTmpPaths('fixture.test.ts', source).map(
        (fixed) => `${fixed.line} ${fixed.source}`
      )
    ).toEqual([
      "1 Path.join(Os.tmpdir(), 'fixed-name')",
      "6 Path.resolve(Os.tmpdir(), 'fixed', 'deeper')",
      '8 Os.tmpdir()',
    ]);
  });
});
