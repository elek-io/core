import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, {
  Value,
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

describe('EntryService', function () {
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

  it('should be able to create a new Entry', async function () {
    entry = await createEntry(
      project.id,
      collection.id,
      asset.id,
      referencedEntry.id
    );

    expect(entry.id).toBeDefined();
  });

  it('should be able to read an Entry', async function () {
    const readEntry = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(readEntry.id).toEqual(entry.id);
  });

  it('should fail to update an Entry with no values while there are fieldDefinitions', async function () {
    await expect(() =>
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values: [],
      })
    ).rejects.toThrow();
  });

  it('should fail to update an Entry with values not matching their fieldDefinitions', async function () {
    const changedValue: Value = {
      ...(entry.values[0] as Value),
      valueType: 'number',
      content: { en: 123 },
    };
    const values: Value[] = [
      changedValue,
      entry.values[1] as Value,
      entry.values[2] as Value,
    ];

    await expect(() =>
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values,
      })
    ).rejects.toThrow();
  });

  it('should be able to update an Entry with values that match the Collections fieldDefinitions', async function () {
    const changedValue: Value = {
      ...(entry.values[0] as Value),
      valueType: 'string',
      content: { en: 'Changed Text' },
    };
    const values: Value[] = [
      changedValue,
      entry.values[1] as Value,
      entry.values[2] as Value,
    ];

    entry = await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values,
    });

    expect(entry.values).toEqual(values);
  });

  it('should be able to get an Entry of a specific commit', async function () {
    const entryFromHistory = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      commitHash: entry.history.pop()?.hash,
    });

    expect(entryFromHistory.values.length).toEqual(3);
  });

  it('should be able to list all Entries', async function () {
    const entries = await core.entries.list({
      projectId: project.id,
      collectionId: collection.id,
    });

    expect(entries.list.length).toEqual(2);
    expect(entries.total).toEqual(2);
    expect(entries.list.find((a) => a.id === entry.id)?.id).toEqual(entry.id);
  });

  it('should be able to count all Entries', async function () {
    const counted = await core.entries.count({
      projectId: project.id,
      collectionId: collection.id,
    });

    expect(counted).toEqual(2);
  });

  it('should be able to identify an Entry', async function () {
    expect(core.entries.isEntry(entry)).toBe(true);
    expect(core.entries.isEntry({ objectType: 'entry' })).toBe(false);
  });

  it('should be able to delete an Entry', async function () {
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
