import Fs from 'fs-extra';
import Path from 'node:path';
import { errAsync } from 'neverthrow';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CoreErrors } from '../util/shared.js';
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
      const countBefore = (
        await core.assets.count({
          projectId: project.id,
        })
      )._unsafeUnwrap();

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult1 = await core.assets.create({
        projectId: project.id,
        filePath: Path.resolve('src/test/data/150x150.png'),
        name: 'rollback-test',
        description: 'Should not persist',
      });
      expect(rollbackResult1.isErr()).toBe(true);

      // Count unchanged - the new asset was cleaned up
      const countAfter = (
        await core.assets.count({
          projectId: project.id,
        })
      )._unsafeUnwrap();
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve the original file', async function () {
      const oldAssetPath = core.util.pathTo.asset(
        project.id,
        asset.id,
        asset.extension
      );
      const oldHash = await getFileHash(oldAssetPath);

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult2 = await core.assets.update({
        projectId: project.id,
        id: asset.id,
        name: 'updated-name',
        description: asset.description,
        newFilePath: Path.resolve('src/test/data/150x150.jpeg'),
      });
      expect(rollbackResult2.isErr()).toBe(true);

      // Original file still exists and is unchanged
      expect(await Fs.pathExists(oldAssetPath)).toBe(true);
      expect(await getFileHash(oldAssetPath)).toEqual(oldHash);

      // Asset is still readable with original data
      const readAsset = (
        await core.assets.read({
          projectId: project.id,
          id: asset.id,
        })
      )._unsafeUnwrap();
      expect(readAsset.name).toEqual(asset.name);
    });

    it('should roll back a failed delete and restore the file', async function () {
      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult3 = await core.assets.delete({
        projectId: project.id,
        id: asset.id,
        extension: asset.extension,
      });
      expect(rollbackResult3.isErr()).toBe(true);

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
      const readAsset = (
        await core.assets.read({
          projectId: project.id,
          id: asset.id,
        })
      )._unsafeUnwrap();
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
      const countBefore = (
        await core.collections.count({
          projectId: project.id,
        })
      )._unsafeUnwrap();

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult4 = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Rollback Item' },
          plural: { en: 'Rollback Items' },
        },
        slug: { singular: 'rollback-item', plural: 'rollback-items' },
        description: { en: 'Should not persist' },
        fieldDefinitions: [],
      });
      expect(rollbackResult4.isErr()).toBe(true);

      // Count unchanged - the new collection was cleaned up
      const countAfter = (
        await core.collections.count({
          projectId: project.id,
        })
      )._unsafeUnwrap();
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve original data', async function () {
      const originalName = collection.name;

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult5 = await core.collections.update({
        ...collection,
        projectId: project.id,
        name: {
          singular: { en: 'Updated Name' },
          plural: { en: 'Updated Names' },
        },
      });
      expect(rollbackResult5.isErr()).toBe(true);

      // Collection file exists and contains original data
      expect(
        await Fs.pathExists(
          core.util.pathTo.collectionFile(project.id, collection.id)
        )
      ).toBe(true);

      const readCollection = (
        await core.collections.read({
          projectId: project.id,
          id: collection.id,
        })
      )._unsafeUnwrap();
      expect(readCollection.name.singular.en).toEqual(originalName.singular.en);
    });

    it('should roll back a failed delete and restore the collection', async function () {
      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult6 = await core.collections.delete({
        projectId: project.id,
        id: collection.id,
      });
      expect(rollbackResult6.isErr()).toBe(true);

      // Collection folder and file still exist
      expect(
        await Fs.pathExists(
          core.util.pathTo.collection(project.id, collection.id)
        )
      ).toBe(true);

      // Collection is still readable
      const readCollection = (
        await core.collections.read({
          projectId: project.id,
          id: collection.id,
        })
      )._unsafeUnwrap();
      expect(readCollection.id).toEqual(collection.id);
    });

    it('should still work when index write fails (safeWriteIndex)', async function () {
      const indexPath = Path.join(
        core.util.pathTo.collections(project.id),
        'index.json'
      );

      try {
        // Make index.json read-only so safeWriteIndex fails with EACCES
        await Fs.chmod(indexPath, 0o444);

        // Create should succeed - git commit works, safeWriteIndex swallows the error
        const newCollection = (
          await core.collections.create({
            projectId: project.id,
            icon: 'plus',
            name: {
              singular: { en: 'Index Test' },
              plural: { en: 'Index Tests' },
            },
            slug: { singular: 'index-test', plural: 'index-tests' },
            description: { en: 'Testing safeWriteIndex' },
            fieldDefinitions: [],
          })
        )._unsafeUnwrap();

        // Restore permissions before assertions
        await Fs.chmod(indexPath, 0o644);

        // Entity was committed successfully - readable by ID
        const readById = (
          await core.collections.read({
            projectId: project.id,
            id: newCollection.id,
          })
        )._unsafeUnwrap();
        expect(readById.id).toEqual(newCollection.id);

        // Readable by slug - triggers index rebuild from disk
        const readBySlug = (
          await core.collections.readBySlug({
            projectId: project.id,
            slug: newCollection.slug.plural,
          })
        )._unsafeUnwrap();
        expect(readBySlug.id).toEqual(newCollection.id);
      } finally {
        // Ensure permissions are always restored
        await Fs.chmod(indexPath, 0o644).catch(() => {});
      }
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
      const countBefore = (
        await core.components.count({
          projectId: project.id,
        })
      )._unsafeUnwrap();

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult7 = await core.components.create({
        projectId: project.id,
        name: { en: 'Rollback Component' },
        slug: 'rollback-component',
        description: { en: 'Should not persist' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'test-field',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Test' },
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
      });
      expect(rollbackResult7.isErr()).toBe(true);

      // Count unchanged
      const countAfter = (
        await core.components.count({
          projectId: project.id,
        })
      )._unsafeUnwrap();
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve original data', async function () {
      const originalName = component.name;

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult8 = await core.components.update({
        ...component,
        projectId: project.id,
        name: { en: 'Updated Component' },
      });
      expect(rollbackResult8.isErr()).toBe(true);

      // Component file exists and contains original data
      expect(
        await Fs.pathExists(
          core.util.pathTo.componentFile(project.id, component.id)
        )
      ).toBe(true);

      const readComponent = (
        await core.components.read({
          projectId: project.id,
          id: component.id,
        })
      )._unsafeUnwrap();
      expect(readComponent.name.en).toEqual(originalName.en);
    });

    it('should roll back a failed delete and restore the component', async function () {
      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult9 = await core.components.delete({
        projectId: project.id,
        id: component.id,
      });
      expect(rollbackResult9.isErr()).toBe(true);

      // Component folder and file still exist
      expect(
        await Fs.pathExists(
          core.util.pathTo.component(project.id, component.id)
        )
      ).toBe(true);

      // Component is still readable
      const readComponent = (
        await core.components.read({
          projectId: project.id,
          id: component.id,
        })
      )._unsafeUnwrap();
      expect(readComponent.id).toEqual(component.id);
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
      const countBefore = (
        await core.entries.count({
          projectId: project.id,
          collectionId: collection.id,
        })
      )._unsafeUnwrap();

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const result = await core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: {
          'product-name': {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'rollback test' },
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
      });
      expect(result.isErr()).toBe(true);

      // Count unchanged
      const countAfter = (
        await core.entries.count({
          projectId: project.id,
          collectionId: collection.id,
        })
      )._unsafeUnwrap();
      expect(countAfter).toEqual(countBefore);
    });

    it('should roll back a failed update and preserve original data', async function () {
      const originalValues = entry.values;

      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult10 = await core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values: {
          ...entry.values,
          'product-name': {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'UPDATED SHOULD NOT PERSIST' },
          },
        },
      });
      expect(rollbackResult10.isErr()).toBe(true);

      // Entry file exists and contains original data
      const entryFilePath = core.util.pathTo.entryFile(
        project.id,
        collection.id,
        entry.id
      );
      expect(await Fs.pathExists(entryFilePath)).toBe(true);

      const readEntry = (
        await core.entries.read({
          projectId: project.id,
          collectionId: collection.id,
          id: entry.id,
        })
      )._unsafeUnwrap();
      expect(readEntry.values).toEqual(originalValues);
    });

    it('should roll back a failed delete and restore the entry', async function () {
      vi.spyOn(core.git, 'commit').mockReturnValueOnce(
        errAsync(CoreErrors.internal('Simulated commit failure'))
      );

      const rollbackResult11 = await core.entries.delete({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
      });
      expect(rollbackResult11.isErr()).toBe(true);

      // Entry file still exists
      const entryFilePath = core.util.pathTo.entryFile(
        project.id,
        collection.id,
        entry.id
      );
      expect(await Fs.pathExists(entryFilePath)).toBe(true);

      // Entry is still readable
      const readEntry = (
        await core.entries.read({
          projectId: project.id,
          collectionId: collection.id,
          id: entry.id,
        })
      )._unsafeUnwrap();
      expect(readEntry.id).toEqual(entry.id);
    });
  });
});
