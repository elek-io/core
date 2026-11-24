import Fs from 'fs-extra';
import { describe, expect, it, onTestFinished } from 'vitest';
import core, { uuid, type Value } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
  createSingleEntryCollection,
  ensureCleanGitStatus,
  expectCoreError,
  singleEntryValues,
} from '../test/util.js';

/**
 * A Single Entry is a Collection limited to one Entry, which is where one-off
 * content such as contact details lives. What it is set to is decided when
 * the Collection is created and never again.
 */
describe('A Collection limited to one Entry', function () {
  /** The one Value an Entry of `writeOlderCollection` holds. */
  function titleValues(title: string): Record<string, Value> {
    return {
      title: {
        objectType: 'value',
        valueType: 'string',
        content: { en: title, de: title },
      },
    };
  }

  /**
   * Writes and commits a Collection folder the way a Core before Single
   * Entries wrote one: a `collection.json` with no `isSingleEntry` key at
   * all. Its path was never read, so no cache of this Core answers for it.
   */
  async function writeOlderCollection(projectId: string) {
    const id = uuid();
    const filePath = core.util.pathTo.collectionFile(projectId, id);
    await Fs.outputJson(filePath, {
      objectType: 'collection',
      id,
      coreVersion: '0.27.0',
      created: '2026-11-01T00:00:00.000Z',
      updated: null,
      name: {
        singular: { en: 'Page', de: 'Seite' },
        plural: { en: 'Pages', de: 'Seiten' },
      },
      slug: { singular: 'page', plural: 'pages' },
      description: { en: 'The pages', de: 'Die Seiten' },
      icon: 'home',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'title',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Title', de: 'Titel' },
          description: null,
          inputWidth: '12',
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          min: null,
          max: 70,
          defaultValue: null,
        },
      ],
    });
    const projectPath = core.util.pathTo.project(projectId);
    await core.git.add(projectPath, [filePath]);
    await core.git.commit(projectPath, {
      method: 'create',
      reference: { objectType: 'collection', id },
    });
    return { id, filePath };
  }

  it('is a Single Entry from the moment it is created', async function () {
    const project = await createProject();
    onTestFinished(project.destroy);

    const collection = await createSingleEntryCollection(project.id);

    expect(collection.isSingleEntry).toBe(true);
    const read = await core.collections.read({
      projectId: project.id,
      id: collection.id,
    });
    expect(read.isSingleEntry).toBe(true);
    const file: unknown = await Fs.readJson(
      core.util.pathTo.collectionFile(project.id, collection.id)
    );
    expect(file).toMatchObject({ isSingleEntry: true });
  });

  it('takes one Entry and refuses a second, naming the one it holds', async function ({
    task,
  }) {
    const project = await createProject();
    onTestFinished(project.destroy);
    const collection = await createSingleEntryCollection(project.id);

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: singleEntryValues('+493012345678'),
    });

    await expectCoreError(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: singleEntryValues('+493087654321'),
      }),
      'Conflict',
      `already holds Entry "${entry.id}"`
    );
    // The refusal comes before anything is written, so the one Entry it
    // holds is still the one that was created first
    expect(
      await core.entries.count({
        projectId: project.id,
        collectionId: collection.id,
      })
    ).toBe(1);
    // And it is read the way every other Collection's Entries are
    const { list, total } = await core.entries.list({
      projectId: project.id,
      collectionId: collection.id,
    });
    expect(total).toBe(1);
    expect(list.map(({ id }) => id)).toEqual([entry.id]);
    await ensureCleanGitStatus(task, project.id);
  });

  it('holds a list of Entries in a Collection created without it', async function () {
    const project = await createProject();
    onTestFinished(project.destroy);
    const collection = await createCollection(project.id);
    const asset = await createAsset(project.id);

    expect(collection.isSingleEntry).toBe(false);
    await createEntry(project.id, collection.id, asset.id);
    await createEntry(project.id, collection.id, asset.id);

    expect(
      await core.entries.count({
        projectId: project.id,
        collectionId: collection.id,
      })
    ).toBe(2);
  });

  it('never becomes a list, and a list never becomes one', async function ({
    task,
  }) {
    const project = await createProject();
    onTestFinished(project.destroy);
    const single = await createSingleEntryCollection(project.id);
    const list = await createCollection(project.id);

    await expectCoreError(
      core.collections.update({
        projectId: project.id,
        ...single,
        isSingleEntry: false,
      }),
      'Conflict',
      'is set when the Collection is created'
    );
    await expectCoreError(
      core.collections.update({
        projectId: project.id,
        ...list,
        isSingleEntry: true,
      }),
      'Conflict',
      'is set when the Collection is created'
    );

    // An update repeating what the Collection was created as goes through,
    // which is what every caller sending a Collection back does
    const updated = await core.collections.update({
      projectId: project.id,
      ...single,
      description: { en: 'How to reach us today', de: 'Wie man uns erreicht' },
    });
    expect(updated.isSingleEntry).toBe(true);

    // And leaving it out keeps it too, which is what a caller sending only
    // the fields it edits does
    const kept = await core.collections.update({
      projectId: project.id,
      id: single.id,
      icon: single.icon,
      name: single.name,
      description: single.description,
      slug: single.slug,
      fieldDefinitions: single.fieldDefinitions,
    });
    expect(kept.isSingleEntry).toBe(true);
    expect(
      (await core.collections.read({ projectId: project.id, id: list.id }))
        .isSingleEntry
    ).toBe(false);
    await ensureCleanGitStatus(task, project.id);
  });

  it('reads a Collection written before Single Entries existed as the list it is', async function () {
    const project = await createProject();
    onTestFinished(project.destroy);
    const older = await writeOlderCollection(project.id);

    const collection = await core.collections.read({
      projectId: project.id,
      id: older.id,
    });
    expect(collection.isSingleEntry).toBe(false);

    // Reading it writes nothing, so the file is still the one the older
    // Core left behind
    const file: unknown = await Fs.readJson(older.filePath);
    expect(file).not.toHaveProperty('isSingleEntry');

    // And it takes as many Entries as it did before
    await core.entries.create({
      projectId: project.id,
      collectionId: older.id,
      values: titleValues('First'),
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: older.id,
      values: titleValues('Second'),
    });
    expect(
      await core.entries.count({
        projectId: project.id,
        collectionId: older.id,
      })
    ).toBe(2);

    // Upgrading the Project, which is what opening one an older Core wrote
    // does, writes the Collection back as the list it is
    await core.projects.upgrade({ id: project.id, force: true });
    const upgraded: unknown = await Fs.readJson(older.filePath);
    expect(upgraded).toMatchObject({ isSingleEntry: false });
  });
});
