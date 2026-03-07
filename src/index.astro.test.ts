import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Path from 'node:path';
import Os from 'node:os';
import Fs from 'fs-extra';
import {
  createProject,
  createAsset,
  createCollection,
  createEntry,
} from './test/util.js';
import type { Asset, Collection, Project } from './index.node.js';

describe('Astro Loaders', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject('Astro Loader Test');
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('should sync Assets and Entries using astro sync', async function () {
    const tmpDir = Path.join(Os.tmpdir(), `elek-astro-test-${Date.now()}`);
    const srcDir = Path.join(tmpDir, 'src');
    await Fs.ensureDir(srcDir);

    // Symlink node_modules so all dependencies resolve
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(tmpDir, 'node_modules')
    );

    const loaderPath = Path.resolve('src/index.astro.ts');
    const assetOutDir = Path.join(srcDir, 'content', 'assets');

    // Write the Astro content config that uses our real loaders
    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { elekAssets, elekEntries } from '${loaderPath}';

export const collections = {
  assets: defineCollection({
    loader: elekAssets({
      projectId: '${project.id}',
      outDir: '${assetOutDir}',
    }),
  }),
  entries: defineCollection({
    loader: elekEntries({
      projectId: '${project.id}',
      collectionId: '${collection.id}',
    }),
  }),
};
`
    );

    // Run astro sync with the real Astro content layer
    await sync({
      root: tmpDir,
      configFile: false,
      logLevel: 'info',
    });

    // If sync completed without throwing, Astro successfully:
    // 1. Loaded our content config
    // 2. Called our loader schema() functions and validated them
    // 3. Called our loader load() functions with the real LoaderContext
    // 4. Validated all data via parseData() against the schemas
    // 5. Stored everything in its data store

    // Verify the Asset file was actually saved to disk
    const savedAssetPath = Path.join(
      assetOutDir,
      `${asset.id}.${asset.extension}`
    );
    expect(await Fs.pathExists(savedAssetPath)).toBe(true);

    // Verify the Astro types were generated
    const typesPath = Path.join(tmpDir, '.astro', 'content.d.ts');
    expect(await Fs.pathExists(typesPath)).toBe(true);
  });
});
