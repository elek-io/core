import { execFileSync } from 'node:child_process';
import Os from 'node:os';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import z from 'zod';

/**
 * Guards that a consumer reaches `docs/` through the package name.
 *
 * The pages ship because `files` lists `docs`, and they resolve because
 * `exports` maps `./docs/*`. Drop either and an installed package hides its
 * documentation while every path inside this repository keeps working. So
 * these tests install what the package manager would publish into a throwaway
 * consumer and resolve from there, outside the package.
 */
const packageRoot = Path.resolve(
  Path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

/** What `pnpm pack --json` answers, reduced to the paths a tarball would hold. */
const packedManifestSchema = z.object({
  files: z.array(z.object({ path: z.string() })),
});

/** What the script below writes, either a resolved file or the refusal. */
const answerSchema = z.object({
  url: z.string().optional(),
  content: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

/**
 * Resolves its argument with Node's own resolver and reads what came back.
 * It runs from the consumer directory, so `exports` is the only thing that
 * can answer and `files` is the only thing that can have put the file there.
 */
const resolveScript = `
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let answer;
try {
  const url = import.meta.resolve(process.argv[2]);
  answer = { url, content: readFileSync(fileURLToPath(url), 'utf8') };
} catch (error) {
  answer = { errorCode: error.code, errorMessage: error.message };
}
process.stdout.write(JSON.stringify(answer));
`;

/** The paths a publish puts into the tarball. `npm pack` answers the same list. */
function publishedPaths(): string[] {
  const manifest = execFileSync('pnpm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    // pnpm is a .cmd on Windows, which Node refuses to spawn without a shell
    shell: process.platform === 'win32',
  });
  return packedManifestSchema
    .parse(JSON.parse(manifest))
    .files.map((file) => file.path);
}

/** Every file below `docs/`, as the published paths spell it. */
function documentationPaths(): string[] {
  return Fs.readdirSync(Path.join(packageRoot, 'docs'), {
    withFileTypes: true,
    recursive: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      Path.relative(packageRoot, Path.join(entry.parentPath, entry.name))
    )
    .map((path) => path.replaceAll('\\', '/'))
    .toSorted();
}

describe('published documentation', function () {
  let published: string[];
  let installDir: string;
  let consumerDir: string;
  let scriptPath: string;

  // Starting pnpm and copying every published file can outlast vitest's own
  // hook timeout on the slow runners, see contributing/testing.md
  beforeAll(async function () {
    published = publishedPaths();
    // Node answers with the real path of the script it spawns, so without this
    // the assertions compare one canonical path against one raw one. macOS
    // points its temp directory through /var, a symlink to private/var.
    consumerDir = await Fs.realpath(
      await Fs.mkdtemp(Path.join(Os.tmpdir(), 'elek-io-core-consumer-'))
    );
    installDir = Path.join(consumerDir, 'node_modules', '@elek-io', 'core');
    for (const path of published) {
      await Fs.copy(Path.join(packageRoot, path), Path.join(installDir, path));
    }
    scriptPath = Path.join(consumerDir, 'resolve.mjs');
    await Fs.outputFile(scriptPath, resolveScript);
  }, 60000);

  afterAll(async function () {
    await Fs.remove(consumerDir);
  });

  function resolveFromConsumer(specifier: string) {
    // The NODE_PATH vitest gives its workers ends in pnpm's hidden store and
    // resolves packages a consumer never sees, see index.cli.test.ts
    const env = { ...process.env };
    delete env['NODE_PATH'];

    return answerSchema.parse(
      JSON.parse(
        execFileSync(process.execPath, [scriptPath, specifier], {
          cwd: consumerDir,
          env,
          encoding: 'utf8',
        })
      )
    );
  }

  it('resolves through the package name from outside the package', async function () {
    const answer = resolveFromConsumer('@elek-io/core/docs/index.md');

    expect(answer.errorCode, answer.errorMessage).toBeUndefined();
    expect(
      answer.url === undefined ? undefined : fileURLToPath(answer.url)
    ).toEqual(Path.join(installDir, 'docs', 'index.md'));
    expect(answer.content).toEqual(
      await Fs.readFile(Path.join(packageRoot, 'docs', 'index.md'), 'utf8')
    );
  });

  it('refuses a subpath the exports map does not list', function () {
    const answer = resolveFromConsumer(
      '@elek-io/core/contributing/documentation.md'
    );

    expect(answer.errorCode).toEqual('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });

  it('publishes every page of docs/', function () {
    expect(
      published.filter((path) => path.startsWith('docs/')).toSorted()
    ).toEqual(documentationPaths());
  });
});
