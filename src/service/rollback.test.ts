import Fs from 'fs-extra';
import Path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CoreError } from '../util/shared.js';
import core, {
  type Asset,
  type Collection,
  type Component,
  type Entry,
  type Project,
  uuid,
} from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createComponent,
  createEntry,
  createProject,
  ensureCleanGitStatus,
  getFileHash,
} from '../test/util.js';

describe('Error handling and rollback', function () {
  describe('AssetService', function () {
    let project: Project & { destroy: () => Promise<void> };
    let asset: Asset;

    beforeAll(async function () {
      project = await createProject('AssetService Rollback Test');
      asset = await createAsset(project.id);
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      vi.restoreAllMocks();
      await ensureCleanGitStatus(task, project.id);
    });

    it('should roll back a failed create', async function () {
      const countBefore = await core.assets.count({
        projectId: project.id,
      });

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.assets.create({
          projectId: project.id,
          filePath: Path.resolve('src/test/data/150x150.png'),
          name: 'rollback-test',
          description: 'Should not persist',
        })
      ).rejects.toThrow();

      // Count unchanged - the new asset was cleaned up
      const countAfter = await core.assets.count({
        projectId: project.id,
      });
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve the original file', async function () {
      const oldAssetPath = core.util.pathTo.asset(
        project.id,
        asset.id,
        asset.extension
      );
      const oldHash = await getFileHash(oldAssetPath);

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.assets.update({
          projectId: project.id,
          id: asset.id,
          name: 'updated-name',
          description: asset.description,
          newFilePath: Path.resolve('src/test/data/150x150.jpeg'),
        })
      ).rejects.toThrow();

      // Original file still exists and is unchanged
      expect(await Fs.pathExists(oldAssetPath)).toBe(true);
      expect(await getFileHash(oldAssetPath)).toEqual(oldHash);

      // Asset is still readable with original data
      const readAsset = await core.assets.read({
        projectId: project.id,
        id: asset.id,
      });
      expect(readAsset.name).toEqual(asset.name);
    });

    it('should roll back a failed delete and restore the file', async function () {
      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.assets.delete({
          projectId: project.id,
          id: asset.id,
          extension: asset.extension,
        })
      ).rejects.toThrow();

      // Asset file and metadata still exist
      expect(
        await Fs.pathExists(
          core.util.pathTo.asset(project.id, asset.id, asset.extension)
        )
      ).toBe(true);
      expect(
        await Fs.pathExists(core.util.pathTo.assetFile(project.id, asset.id))
      ).toBe(true);

      // Asset is still readable
      const readAsset = await core.assets.read({
        projectId: project.id,
        id: asset.id,
      });
      expect(readAsset.id).toEqual(asset.id);
    });
  });

  describe('CollectionService', function () {
    let project: Project & { destroy: () => Promise<void> };
    let collection: Collection;

    beforeAll(async function () {
      project = await createProject('CollectionService Rollback Test');
      collection = await createCollection(project.id);
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      vi.restoreAllMocks();
      await ensureCleanGitStatus(task, project.id);
    });

    it('should roll back a failed create', async function () {
      const countBefore = await core.collections.count({
        projectId: project.id,
      });

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.collections.create({
          projectId: project.id,
          icon: 'home',
          name: {
            singular: { en: 'Rollback Item', de: 'Rollback Item' },
            plural: { en: 'Rollback Items', de: 'Rollback Items' },
          },
          slug: { singular: 'rollback-item', plural: 'rollback-items' },
          description: { en: 'Should not persist', de: 'Should not persist' },
          fieldDefinitions: [],
        })
      ).rejects.toThrow();

      // Count unchanged - the new collection was cleaned up
      const countAfter = await core.collections.count({
        projectId: project.id,
      });
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve original data', async function () {
      const originalName = collection.name;

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.collections.update({
          ...collection,
          projectId: project.id,
          name: {
            singular: { en: 'Updated Name', de: 'Updated Name' },
            plural: { en: 'Updated Names', de: 'Updated Names' },
          },
        })
      ).rejects.toThrow();

      // Collection file exists and contains original data
      expect(
        await Fs.pathExists(
          core.util.pathTo.collectionFile(project.id, collection.id)
        )
      ).toBe(true);

      const readCollection = await core.collections.read({
        projectId: project.id,
        id: collection.id,
      });
      expect(readCollection.name.singular.en).toEqual(originalName.singular.en);
    });

    it('should roll back a failed delete and restore the collection', async function () {
      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.collections.delete({
          projectId: project.id,
          id: collection.id,
        })
      ).rejects.toThrow();

      // Collection folder and file still exist
      expect(
        await Fs.pathExists(
          core.util.pathTo.collection(project.id, collection.id)
        )
      ).toBe(true);

      // Collection is still readable
      const readCollection = await core.collections.read({
        projectId: project.id,
        id: collection.id,
      });
      expect(readCollection.id).toEqual(collection.id);
    });

    it('should keep the slug index out of the Project folder', async function () {
      // The index is a per Core instance cache with nothing on disk behind
      // it, so there is no write left to fail and none to be swallowed
      const newCollection = await core.collections.create({
        projectId: project.id,
        icon: 'plus',
        name: {
          singular: { en: 'Index Test', de: 'Index Test' },
          plural: { en: 'Index Tests', de: 'Index Tests' },
        },
        slug: { singular: 'index-test', plural: 'index-tests' },
        description: { en: 'Testing the index', de: 'Testing the index' },
        fieldDefinitions: [],
      });

      expect(
        await Fs.pathExists(
          Path.join(core.util.pathTo.collections(project.id), 'slug.index.json')
        )
      ).toBe(false);

      const readBySlug = await core.collections.readBySlug({
        projectId: project.id,
        slug: newCollection.slug.plural,
      });
      expect(readBySlug.id).toEqual(newCollection.id);
    });
  });

  describe('ComponentService', function () {
    let project: Project & { destroy: () => Promise<void> };
    let component: Component;

    beforeAll(async function () {
      project = await createProject('ComponentService Rollback Test');
      component = await createComponent(project.id);
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      vi.restoreAllMocks();
      await ensureCleanGitStatus(task, project.id);
    });

    it('should roll back a failed create', async function () {
      const countBefore = await core.components.count({
        projectId: project.id,
      });

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.components.create({
          projectId: project.id,
          name: { en: 'Rollback Component', de: 'Rollback Component' },
          slug: 'rollback-component',
          description: { en: 'Should not persist', de: 'Should not persist' },
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'test-field',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Test', de: 'Test' },
              description: null,
              defaultValue: null,
              isRequired: false,
              isDisabled: false,
              isUnique: false,
              inputWidth: '12',
              min: null,
              max: null,
            },
          ],
        })
      ).rejects.toThrow();

      // Count unchanged
      const countAfter = await core.components.count({
        projectId: project.id,
      });
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve original data', async function () {
      const originalName = component.name;

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.components.update({
          ...component,
          projectId: project.id,
          name: { en: 'Updated Component', de: 'Updated Component' },
        })
      ).rejects.toThrow();

      // Component file exists and contains original data
      expect(
        await Fs.pathExists(
          core.util.pathTo.componentFile(project.id, component.id)
        )
      ).toBe(true);

      const readComponent = await core.components.read({
        projectId: project.id,
        id: component.id,
      });
      expect(readComponent.name.en).toEqual(originalName.en);
    });

    it('should roll back a failed delete and restore the component', async function () {
      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.components.delete({
          projectId: project.id,
          id: component.id,
        })
      ).rejects.toThrow();

      // Component folder and file still exist
      expect(
        await Fs.pathExists(
          core.util.pathTo.component(project.id, component.id)
        )
      ).toBe(true);

      // Component is still readable
      const readComponent = await core.components.read({
        projectId: project.id,
        id: component.id,
      });
      expect(readComponent.id).toEqual(component.id);
    });
  });

  describe('ProjectService', function () {
    let project: Project & { destroy: () => Promise<void> };

    beforeAll(async function () {
      project = await createProject('ProjectService Rollback Test');
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      vi.restoreAllMocks();
      await ensureCleanGitStatus(task, project.id);
    });

    it('should roll back a failed update and keep the Project file', async function () {
      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.projects.update({
          id: project.id,
          name: 'Renamed by a failing update',
          description: project.description,
          settings: project.settings,
        })
      ).rejects.toThrow('Simulated commit failure');

      const read = await core.projects.read({ id: project.id });
      expect(read.name).toEqual(project.name);
    });

    it('should roll back a failed delete and keep the Project', async function () {
      vi.spyOn(Fs, 'remove').mockRejectedValueOnce(
        new Error('Simulated removal failure')
      );

      await expect(
        core.projects.delete({ id: project.id, force: true })
      ).rejects.toThrow('Simulated removal failure');

      expect(
        await Fs.pathExists(core.util.pathTo.projectFile(project.id))
      ).toBe(true);
      await expect(
        core.projects.read({ id: project.id })
      ).resolves.toMatchObject({ id: project.id });
    });

    it('should remove the folder when create fails before git init', async function () {
      // Nothing is a repository yet at that point, so a rollback that goes
      // through delete() asks git about a folder git knows nothing about and
      // its failure replaces the one the caller has to see
      const countBefore = await core.projects.count();
      vi.spyOn(core.git, 'init').mockRejectedValueOnce(
        CoreError.internal('Simulated init failure')
      );

      await expect(
        core.projects.create({
          name: 'Never created',
          description: 'Should not survive',
          settings: { language: { default: 'en', supported: ['en'] } },
        })
      ).rejects.toThrow('Simulated init failure');

      expect(await core.projects.count()).toEqual(countBefore);
    });

    it('should remove the folder when create fails after the first commit', async function () {
      const countBefore = await core.projects.count();
      vi.spyOn(core.git.branches, 'switch').mockRejectedValueOnce(
        CoreError.internal('Simulated switch failure')
      );

      await expect(
        core.projects.create({
          name: 'Never created either',
          description: 'Should not survive',
          settings: { language: { default: 'en', supported: ['en'] } },
        })
      ).rejects.toThrow('Simulated switch failure');

      expect(await core.projects.count()).toEqual(countBefore);
    });
  });

  describe('EntryService', function () {
    let project: Project & { destroy: () => Promise<void> };
    let collection: Collection;
    let asset: Asset;
    let entry: Entry;

    beforeAll(async function () {
      project = await createProject('EntryService Rollback Test');
      collection = await createCollection(project.id);
      asset = await createAsset(project.id);
      entry = await createEntry(project.id, collection.id, asset.id);
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      vi.restoreAllMocks();
      await ensureCleanGitStatus(task, project.id);
    });

    it('should roll back a failed create', async function () {
      const countBefore = await core.entries.count({
        projectId: project.id,
        collectionId: collection.id,
      });

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.entries.create({
          projectId: project.id,
          collectionId: collection.id,
          values: {
            'product-name': {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'rollback test', de: 'rollback test' },
            },
            'header-image': {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [{ objectType: 'asset', id: asset.id }] },
            },
            'related-products': {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [] },
            },
          },
        })
      ).rejects.toThrow();

      // Count unchanged
      const countAfter = await core.entries.count({
        projectId: project.id,
        collectionId: collection.id,
      });
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve original data', async function () {
      const originalValues = entry.values;

      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.entries.update({
          projectId: project.id,
          collectionId: collection.id,
          id: entry.id,
          values: {
            ...entry.values,
            'product-name': {
              objectType: 'value',
              valueType: 'string',
              content: {
                en: 'UPDATED SHOULD NOT PERSIST',
                de: 'UPDATED SHOULD NOT PERSIST',
              },
            },
          },
        })
      ).rejects.toThrow();

      // Entry file exists and contains original data
      const entryFilePath = core.util.pathTo.entryFile(
        project.id,
        collection.id,
        entry.id
      );
      expect(await Fs.pathExists(entryFilePath)).toBe(true);

      const readEntry = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(readEntry.values).toEqual(originalValues);
    });

    it('should roll back a failed delete and restore the entry', async function () {
      vi.spyOn(core.git, 'commit').mockRejectedValueOnce(
        CoreError.internal('Simulated commit failure')
      );

      await expect(
        core.entries.delete({
          projectId: project.id,
          collectionId: collection.id,
          id: entry.id,
        })
      ).rejects.toThrow();

      // Entry file still exists
      const entryFilePath = core.util.pathTo.entryFile(
        project.id,
        collection.id,
        entry.id
      );
      expect(await Fs.pathExists(entryFilePath)).toBe(true);

      // Entry is still readable
      const readEntry = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(readEntry.id).toEqual(entry.id);
    });
  });
});
