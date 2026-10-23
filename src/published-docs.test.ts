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

/** The manifest this test copies, reduced to what a publish would rewrite. */
const sourceManifestSchema = z.object({
  publishConfig: z.record(z.string(), z.unknown()).optional(),
});

/** What the script below writes per specifier, a resolved file or the refusal. */
const answerSchema = z.array(
  z.object({
    specifier: z.string(),
    url: z.string().optional(),
    content: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  })
);

/**
 * Resolves each of its arguments with Node's own resolver and reads what came
 * back. It runs from the consumer directory, so `exports` is the only thing
 * that can answer and `files` is the only thing that can have put the file
 * there. One process answers for every specifier, so the whole documentation
 * costs a single spawn.
 */
const resolveScript = `
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const answers = process.argv.slice(2).map((specifier) => {
  try {
    const url = import.meta.resolve(specifier);
    return {
      specifier,
      url,
      content: readFileSync(fileURLToPath(url), 'utf8'),
    };
  } catch (error) {
    return { specifier, errorCode: error.code, errorMessage: error.message };
  }
});
process.stdout.write(JSON.stringify(answers));
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
  let pages: string[];
  let installDir: string;
  let consumerDir: string;
  let scriptPath: string;

  beforeAll(async function () {
    published = publishedPaths();
    pages = documentationPaths();

    // Node answers with the real path of the script it spawns, so without this
    // the assertions compare one canonical path against one raw one. macOS
    // points its temp directory through /var, a symlink to private/var.
    //
    // It has to be this realpath rather than realpath.native. Node resolves a
    // main through the JavaScript walk, which follows symlinks per component
    // and leaves an 8.3 short name alone, while the native one expands the
    // RUNNER~1 in the Windows runner's TEMP. Swapping it would trade the macOS
    // mismatch for a Windows one. Fs.promises.realpath is the native one too,
    // so it has the same effect.
    consumerDir = await Fs.realpath(
      await Fs.mkdtemp(Path.join(Os.tmpdir(), 'elek-io-core-consumer-'))
    );
    installDir = Path.join(consumerDir, 'node_modules', '@elek-io', 'core');

    // The loop below copies the manifest from disk, while a publish folds
    // publishConfig into the one npm receives. An exports map there would
    // decide what resolves and the copy would never show it.
    const manifest = sourceManifestSchema.parse(
      await Fs.readJson(Path.join(packageRoot, 'package.json'))
    );
    expect(manifest.publishConfig?.['exports']).toBeUndefined();

    for (const path of published) {
      await Fs.copy(Path.join(packageRoot, path), Path.join(installDir, path));
    }
    scriptPath = Path.join(consumerDir, 'resolve.mjs');
    await Fs.outputFile(scriptPath, resolveScript);
  });

  afterAll(async function () {
    // The hook above can die before it assigns this, and removing undefined
    // would bury that failure under a second, unrelated error
    if (consumerDir) {
      await Fs.remove(consumerDir);
    }
  });

  function resolveFromConsumer(...specifiers: string[]) {
    // The NODE_PATH vitest gives its workers ends in pnpm's hidden store and
    // resolves packages a consumer never sees, see index.cli.test.ts
    const env = { ...process.env };
    delete env['NODE_PATH'];

    return answerSchema.parse(
      JSON.parse(
        execFileSync(process.execPath, [scriptPath, ...specifiers], {
          cwd: consumerDir,
          env,
          encoding: 'utf8',
          // The child writes every page back, so this output grows with
          // docs/. The pages weigh a quarter of the 1 MB default today and
          // passing it fails as ENOBUFS naming the spawn, not the pages.
          // 32 MB is over a hundred times that and still a ceiling
          maxBuffer: 32 * 1024 * 1024,
        })
      )
    );
  }

  it('resolves every page through the package name from outside the package', async function () {
    const answers = resolveFromConsumer(
      ...pages.map((path) => `@elek-io/core/${path}`)
    );

    expect(
      answers.map((answer) => ({
        specifier: answer.specifier,
        path:
          answer.url === undefined
            ? answer.errorMessage
            : fileURLToPath(answer.url),
      }))
    ).toEqual(
      pages.map((path) => ({
        specifier: `@elek-io/core/${path}`,
        path: Path.join(installDir, path),
      }))
    );
    expect(answers.map((answer) => answer.content)).toEqual(
      await Promise.all(
        pages.map((path) => Fs.readFile(Path.join(packageRoot, path), 'utf8'))
      )
    );
  });

  it('refuses a subpath the exports map does not list', function () {
    const [answer] = resolveFromConsumer(
      '@elek-io/core/contributing/documentation.md'
    );

    expect(answer?.errorCode).toEqual('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });

  it('publishes every page of docs/', function () {
    expect(
      published.filter((path) => path.startsWith('docs/')).toSorted()
    ).toEqual(pages);
  });
});
