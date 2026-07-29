import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import { sync } from 'astro';
import Path from 'node:path';
import Fs from 'fs-extra';
import core from './test/setup.js';
import {
  createProject,
  createAsset,
  createCollection,
  createEntry,
  tmpDirPath,
} from './test/util.js';
import type { Asset, Collection, Project } from './index.node.js';
import { CoreError } from './index.node.js';
import {
  defineElekConfig,
  elekAssetsLoader,
  elekEntriesLoader,
  type ElekConfig,
} from './index.astro.js';

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
    const tmpDir = tmpDirPath();
    const srcDir = Path.join(tmpDir, 'src');
    await Fs.ensureDir(srcDir);

    // Symlink node_modules so all dependencies resolve
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(tmpDir, 'node_modules')
    );

    // On Windows CI/CD Path.resolve would be "D:\a\core\core\src\index.astro.ts",
    // but when interpolated into the template string, the backslashes act as escape characters.
    const loaderPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');
    const assetOutDir = Path.join(srcDir, 'content', 'assets').replaceAll(
      '\\',
      '/'
    );

    // Write the Astro content config that uses our real loaders
    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { defineElekConfig, elekAssetsLoader, elekEntriesLoader } from '${loaderPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${project.id}' },
  },
});

export const collections = {
  assets: defineCollection({
    loader: elekAssetsLoader({
      config,
      project: 'website',
      imageDir: '${assetOutDir}',
    }),
  }),
  entries: defineCollection({
    loader: elekEntriesLoader({
      config,
      project: 'website',
      collectionIdOrSlug: '${collection.id}',
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

    // Verify schemas produced real types, not 'any'
    const typesContent = await Fs.readFile(typesPath, 'utf-8');
    expect(typesContent).toContain('assets');
    expect(typesContent).toContain('entries');

    // Verify the assets JSON Schema was generated with actual properties
    const assetsSchemaPath = Path.join(
      tmpDir,
      '.astro',
      'collections',
      'assets.schema.json'
    );
    if (await Fs.pathExists(assetsSchemaPath)) {
      const assetsJsonSchema = (await Fs.readJson(assetsSchemaPath)) as {
        properties: Record<string, unknown>;
      };
      expect(assetsJsonSchema.properties).toHaveProperty('id');
      expect(assetsJsonSchema.properties).toHaveProperty('extension');
    }
  });

  it('should forget an Entry that was deleted from the Collection', async function () {
    // A deleted Entry that stays in the store keeps its page in the
    // built site, and nothing about the next build says why. Two syncs
    // into the same root, so the second one restores a store that
    // still holds the Entry.
    const doomed = await createEntry(project.id, collection.id, asset.id);

    const root = tmpDirPath();
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );

    const loaderPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');
    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { defineElekConfig, elekEntriesLoader } from '${loaderPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${project.id}' },
  },
});

export const collections = {
  entries: defineCollection({
    loader: elekEntriesLoader({
      config,
      project: 'website',
      collectionIdOrSlug: '${collection.id}',
    }),
  }),
};
`
    );

    // Astro's content store would otherwise land in node_modules,
    // which every test root shares through its symlink
    const cacheDir = Path.join(root, '.cache');
    const storePath = Path.join(cacheDir, 'data-store.json');

    await sync({ root, configFile: false, logLevel: 'info', cacheDir });
    expect(await Fs.readFile(storePath, 'utf-8')).toContain(doomed.id);

    await core.entries.delete({
      projectId: project.id,
      collectionId: collection.id,
      id: doomed.id,
    });

    await sync({ root, configFile: false, logLevel: 'info', cacheDir });
    expect(await Fs.readFile(storePath, 'utf-8')).not.toContain(doomed.id);
  }, 120000);

  it('should throw NotFound listing the declared aliases for an unknown one', function () {
    // The generic makes this a compile error for a config built with
    // defineElekConfig, so this covers a hand-built one
    const config: ElekConfig = { projects: { website: { id: project.id } } };

    let error: unknown = null;
    try {
      elekEntriesLoader({
        config,
        project: 'shop',
        collectionIdOrSlug: 'posts',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('NotFound');
    expect(error instanceof CoreError && error.message).toContain('website');
  });

  it('should reject an invalid config the loaders receive', function () {
    const config: ElekConfig = { projects: { website: { id: 'not-a-uuid' } } };

    expect(() =>
      elekAssetsLoader({ config, project: 'website', imageDir: '.' })
    ).toThrow(/invalid/i);
  });

  it('should accept only the declared aliases as project', function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: project.id } },
    });

    expect(Object.keys(config.projects)).toEqual(['website', 'shop']);

    type EntriesAlias = Parameters<
      typeof elekEntriesLoader<typeof config>
    >[0]['project'];
    type AssetsAlias = Parameters<
      typeof elekAssetsLoader<typeof config>
    >[0]['project'];

    expectTypeOf<EntriesAlias>().toEqualTypeOf<'website' | 'shop'>();
    expectTypeOf<AssetsAlias>().toEqualTypeOf<'website' | 'shop'>();
  });
});
