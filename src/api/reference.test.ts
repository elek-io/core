import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fs from 'fs-extra';
import { beforeAll, describe, expect, it } from 'vitest';
import z from 'zod';
import {
  readScalarBundle,
  scalarBundleCandidates,
  scalarBundleRoute,
} from './lib/reference.js';

/**
 * Guards that the reference page's bundle reaches a reader from Core.
 *
 * The page loads it from Core's own path, so the file has to be where the
 * route looks for it and inside what a publish ships, together with the
 * notice of the license it carries. See ../../contributing/api-reference.md.
 */
const packageRoot = Path.resolve(
  Path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** Where the build copies the bundle from, and where it puts it */
const pinnedBundle = Path.join(
  packageRoot,
  'node_modules/@scalar/api-reference/dist/browser/standalone.js'
);
const builtBundle = Path.join(packageRoot, 'dist/node/reference/scalar.js');

/** What `pnpm pack --json` answers, reduced to the paths a tarball would hold */
const packedManifestSchema = z.object({
  files: z.array(z.object({ path: z.string() })),
});

/** The manifest, reduced to where `@scalar/api-reference` is declared */
const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
});

/** Cheap to compare and cheap to print, which a 5 MB bundle is not */
function sha256Of(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Every directory under `dist/` whose built entry carries the code that
 * serves the bundle, found by the route it registers. The node, astro and
 * cli entries each bundle Core's node code, so each has to reach the one
 * copy the build makes.
 */
async function entriesServingTheBundle(): Promise<string[]> {
  const dist = Path.join(packageRoot, 'dist');
  const found: string[] = [];

  for (const entry of await Fs.readdir(dist, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = Path.join(dist, entry.name);
    for (const file of await Fs.readdir(directory)) {
      if (!/\.m?js$/.test(file)) {
        continue;
      }
      const content = await Fs.readFile(Path.join(directory, file), 'utf8');
      if (content.includes(scalarBundleRoute)) {
        found.push(directory);
        break;
      }
    }
  }

  return found;
}

describe('the reference bundle', function () {
  let published: string[];
  let pinned: string;

  beforeAll(async function () {
    const manifest = execFileSync('pnpm', ['pack', '--dry-run', '--json'], {
      cwd: packageRoot,
      encoding: 'utf8',
      // pnpm is a .cmd on Windows, which Node refuses to spawn without a shell
      shell: process.platform === 'win32',
    });
    published = packedManifestSchema
      .parse(JSON.parse(manifest))
      .files.map((file) => file.path);
    pinned = await Fs.readFile(pinnedBundle, 'utf8');
  });

  it('comes from an exactly pinned devDependency', async function () {
    const manifest = manifestSchema.parse(
      await Fs.readJson(Path.join(packageRoot, 'package.json'))
    );

    // A runtime dependency would put Vue and every @scalar package it brings
    // into each install of Core, which only needs the one browser bundle
    expect(manifest.dependencies['@scalar/api-reference']).toBeUndefined();
    // An exact version, so the file a build copies in is the file the suite
    // measured rather than whatever Scalar published since
    expect(manifest.devDependencies['@scalar/api-reference']).toMatch(
      /^\d+\.\d+\.\d+$/
    );
  });

  it('is found and read from a run of the source', async function () {
    const bundle = await readScalarBundle();

    // The build the reference page's second script calls
    expect(bundle).toContain('window.Scalar');
    expect(sha256Of(bundle)).toEqual(sha256Of(pinned));
  });

  it('is found from every built entry that serves it', async function () {
    // `elek api:start` runs dist/cli and an Astro build runs dist/astro, and
    // both bundle this code, so neither may look inside dist/node's own
    // directory for the copy
    const entries = await entriesServingTheBundle();

    expect(entries.length).toBeGreaterThan(1);
    for (const entry of entries) {
      const [shipped] = scalarBundleCandidates(entry);
      expect(shipped).toBeDefined();
      expect([entry, await Fs.pathExists(String(shipped))]).toEqual([
        entry,
        true,
      ]);
    }
  });

  it('is copied into the build unchanged', async function () {
    // A stale `dist` serves a bundle nothing here measured, and a build that
    // dropped the copy serves none at all
    expect(await Fs.pathExists(builtBundle)).toEqual(true);
    expect(sha256Of(await Fs.readFile(builtBundle, 'utf8'))).toEqual(
      sha256Of(pinned)
    );
  });

  it('is published together with the notice of its license', function () {
    expect(published).toContain('dist/node/reference/scalar.js');
    expect(published).toContain('dist/node/reference/scalar-license.txt');
  });

  it('is covered by the notice beside it', async function () {
    const notice = await Fs.readFile(
      Path.join(packageRoot, 'src/api/lib/scalar-license.txt'),
      'utf8'
    );

    expect(notice).toContain('scalar.js');
    expect(notice).toContain('@scalar/api-reference');
    expect(notice).toContain('MIT License');
    expect(notice).toContain('The above copyright notice and this permission');
  });
});
