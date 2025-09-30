import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
  ensureCleanGitStatus,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;
  let entry: Entry;
  let referencedEntry: Entry;
  let asset: Asset;
  // let sharedValue: SharedValue;

  beforeAll(async function () {
    project = await createProject();
    collection = await createCollection(project.id);
    asset = await createAsset(project.id);
    referencedEntry = await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it.sequential('should be able to create a new Entry', async function () {
    entry = await createEntry(
      project.id,
      collection.id,
      asset.id,
      referencedEntry.id
    );

    expect(entry.id).toBeDefined();
  });

  it.sequential('should be able to read an Entry', async function () {
    const readEntry = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(readEntry.id).toEqual(entry.id);
  });

  it.sequential('should be able to update an Entry', async function () {
    entry = await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: [],
    });

    expect(entry.values).toEqual([]);
  });

  it.sequential(
    'should be able to get an Entry of a specific commit',
    async function () {
      const entryFromHistory = await core.entries.read({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        commitHash: entry.history.pop()?.hash,
      });

      expect(entryFromHistory.values.length).toEqual(3);
    }
  );

  it.sequential('should be able to list all Entries', async function () {
    const entries = await core.entries.list({
      projectId: project.id,
      collectionId: collection.id,
    });

    expect(entries.list.length).toEqual(2);
    expect(entries.total).toEqual(2);
    expect(entries.list.find((a) => a.id === entry.id)?.id).toEqual(entry.id);
  });

  it.sequential('should be able to count all Entries', async function () {
    const counted = await core.entries.count({
      projectId: project.id,
      collectionId: collection.id,
    });

    expect(counted).toEqual(2);
  });

  it.sequential('should be able to identify an Entry', async function () {
    expect(core.entries.isEntry(entry)).toBe(true);
    expect(core.entries.isEntry({ objectType: 'entry' })).toBe(false);
  });

  it.sequential('should be able to delete an Entry', async function () {
    await core.entries.delete({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(
      await Fs.pathExists(
        core.util.pathTo.entryFile(project.id, collection.id, entry.id)
      )
    ).toBe(false);
  });
});
