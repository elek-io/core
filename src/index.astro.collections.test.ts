import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Path from 'node:path';
import Fs from 'fs-extra';
import {
  createProject,
  createAsset,
  createCollection,
  createEntry,
  createSingleEntryCollection,
  singleEntryValues,
  tmpDirPath,
} from './test/util.js';
import core from './test/setup.js';
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
  });

  afterAll(async function () {
    await project.destroy();
  });

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
          'elek',
          'website',
          'images',
          `${asset.id}.${asset.extension}`
        )
      )
    ).toBe(true);
  });

  it('should give a Single Entry as one item under a fixed id, empty or not', async function () {
    const contactDetails = await createSingleEntryCollection(project.id);
    const root = await writeAstroProject('');
    // Astro's content store would otherwise land in node_modules,
    // which every test root shares through its symlink
    const cacheDir = Path.join(root, '.cache');
    const storePath = Path.join(cacheDir, 'data-store.json');

    // A Single Entry nobody has filled in yet, which is what every one of
    // them looks like until an editor opens it
    await sync({ root, configFile: false, logLevel: 'info', cacheDir });

    const types = await Fs.readFile(
      Path.join(root, '.astro', 'content.d.ts'),
      'utf-8'
    );
    expect(types).toContain('websiteContactDetails');
    // Nothing to read, so getEntry() answers undefined rather than the
    // site failing to build
    expect(await Fs.readFile(storePath, 'utf-8')).not.toContain('"single"');

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: contactDetails.id,
      values: singleEntryValues('+493012345678'),
    });
    await sync({ root, configFile: false, logLevel: 'info', cacheDir });

    // What getEntry('websiteContactDetails', 'single') reads. The Entry's
    // own id is in no store key, so no page can depend on it
    const store = await Fs.readFile(storePath, 'utf-8');
    expect(store).toContain('"single"');
    expect(store).not.toContain(entry.id);
  });

  it('should save Assets where a per Project imageDir points instead', async function () {
    const root = await writeAstroProject(
      ", { assets: { website: { imageDir: 'content/binaries' } } }"
    );

    await sync({ root, configFile: false, logLevel: 'info' });

    // Relative imageDir resolves against the Astro project root
    expect(
      await Fs.pathExists(
        Path.join(root, 'content', 'binaries', `${asset.id}.${asset.extension}`)
      )
    ).toBe(true);
    expect(await Fs.pathExists(Path.join(root, 'src', 'elek'))).toBe(false);
  });
});
