import type { Collection, Entry, Project, Value } from '@elek-io/shared';
import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import {
  createCollection,
  createEntry,
  createProject,
  createValue,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;
  let entry: Entry;
  let value: Value;

  beforeAll(async function () {
    project = await createProject();
    collection = await createCollection(project.id);
    value = await createValue(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential('should be able to create a new Entry', async function () {
    entry = await createEntry(project.id, collection.id, value.id);

    expect(entry.id).to.not.be.undefined;
  });

  it.sequential('should be able to read an Entry', async function () {
    const readEntry = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      language: 'en',
    });

    expect(readEntry.id).to.equal(entry.id);
  });

  it.sequential('should be able to update an Entry', async function () {
    const updatedEntry = await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      language: entry.language,
      valueReferences: [],
    });

    expect(updatedEntry.valueReferences).to.be.an('array').that.is.empty;
  });

  it.sequential('should be able to list all Entries', async function () {
    const entries = await core.entries.list({
      projectId: project.id,
      collectionId: collection.id,
    });

    expect(entries.list.length).to.equal(1);
    expect(entries.total).to.equal(1);
    expect(entries.list.find((a) => a.id === entry.id)?.id).to.equal(entry.id);
  });

  it.sequential('should be able to count all Entries', async function () {
    const counted = await core.entries.count({
      projectId: project.id,
      collectionId: collection.id,
    });

    expect(counted).to.equal(1);
  });

  it.sequential('should be able to identify an Entry', async function () {
    expect(core.entries.isEntry(entry)).to.be.true;
    expect(core.entries.isEntry({ fileType: 'entry' })).to.be.false;
  });

  it.sequential('should be able to delete an Entry', async function () {
    await core.entries.delete({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      language: entry.language,
    });

    expect(
      await Fs.pathExists(
        core.util.pathTo.entryFile(
          project.id,
          collection.id,
          entry.id,
          entry.language
        )
      )
    ).to.be.false;
  });
});
