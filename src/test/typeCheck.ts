import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import ts from 'typescript';

/**
 * Type-checks a string of TypeScript as a program of its own, returning one
 * message per diagnostic and an empty array when it compiles.
 *
 * `expectTranspiles` in `util.ts` parses only, so it catches malformed
 * generated source and nothing a type says. This runs a real program, which
 * is what proves a dispatch over a generated union fails where the
 * documentation says it does.
 *
 * The source has to stand alone: the temporary directory it is written to
 * resolves no package, `@elek-io/core` included.
 */
export function typeCheckMessages(source: string): string[] {
  const directory = Fs.mkdtempSync(
    Path.join(Os.tmpdir(), 'elek-io-core-typecheck-')
  );
  const fileName = Path.join(directory, 'generated.ts');
  try {
    Fs.writeFileSync(fileName, source);
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    const program = ts.createProgram([fileName], options);
    return ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      );
  } finally {
    Fs.removeSync(directory);
  }
}
