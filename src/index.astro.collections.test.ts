import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Path from 'node:path';
import Fs from 'fs-extra';
import {
  createProject,
  createAsset,
  createCollection,
  createEntry,
  tmpDirPath,
} from './test/util.js';
import type { Asset, Collection, Project } from './index.node.js';

/**
 * Own test file on purpose, every sync() spins up a full Astro
 * pipeline in the worker process
 */
describe('elekCollections through astro sync', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject('Derived Collections Sync Test');
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    await createEntry(project.id, collection.id, asset.id);
  }, 60000);

  afterAll(async function () {
    await project.destroy();
  }, 60000);

  /**
   * An Astro project whose content config spreads elekCollections()
   */
  async function writeAstroProject(assetsOption: string): Promise<string> {
    const root = tmpDirPath();
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );

    const entryPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineElekConfig, elekCollections } from '${entryPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${project.id}' },
  },
});

export const collections = {
  ...(await elekCollections(config${assetsOption})),
};
`
    );

    return root;
  }

  it('should derive the collections and save Assets under src by default', async function () {
    const root = await writeAstroProject('');

    await sync({ root, configFile: false, logLevel: 'info' });

    // Astro generated types for the derived, alias-prefixed keys
    const types = await Fs.readFile(
      Path.join(root, '.astro', 'content.d.ts'),
      'utf-8'
    );
    expect(types).toContain('websiteProducts');
    expect(types).toContain('websiteAssets');

    // The Assets landed in the default location, below src so that
    // astro:assets can reach them
    expect(
      await Fs.pathExists(
        Path.join(
          root,
          'src',
          'content',
          'elek',
          'website',
          'assets',
          `${asset.id}.${asset.extension}`
        )
      )
    ).toBe(true);
  }, 120000);

  it('should save Assets where a per Project outDir points instead', async function () {
    const root = await writeAstroProject(
      ", { assets: { website: { outDir: 'content/binaries' } } }"
    );

    await sync({ root, configFile: false, logLevel: 'info' });

    // Relative outDir resolves against the Astro project root
    expect(
      await Fs.pathExists(
        Path.join(root, 'content', 'binaries', `${asset.id}.${asset.extension}`)
      )
    ).toBe(true);
    expect(await Fs.pathExists(Path.join(root, 'src', 'content', 'elek'))).toBe(
      false
    );
  }, 120000);
});
