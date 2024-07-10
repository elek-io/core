import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, {
  type Asset,
  type Collection,
  type Entry,
  type Project,
} from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;
  let referencedEntry: Entry;
  let entry: Entry;

  beforeAll(async function () {
    project = await createProject();

    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    referencedEntry = await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential('should be able to create a new Entry', async function () {
    entry = await createEntry(
      project.id,
      collection.id,
      asset.id,
      referencedEntry.id
    );

    expect(entry.id).to.not.be.undefined;
  });

  it.sequential(
    'should be able to export a Project with all data to JSON',
    async function () {
      const exportedProject = await core.projects.exportToJson(project.id);

      // To debug
      await Fs.writeFile(
        './src/test/tmp/project-export.json',
        JSON.stringify(exportedProject, null, 2)
      );

      expect(exportedProject.collections).to.have.lengthOf(1);
      expect(exportedProject.assets).to.have.lengthOf(1);
      expect(exportedProject.collections[0]?.entries).to.have.lengthOf(2);
      expect(
        exportedProject.collections[0]?.entries[0]?.values
      ).to.have.lengthOf(3);
    }
  );
});
