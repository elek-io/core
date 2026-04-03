import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Value } from '../test/setup.js';
import core, {
  uuid,
  type Asset,
  type Collection,
  type Component,
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
    await expect(
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values: {},
      })
    ).rejects.toThrow();
  });

  it('should fail to update an Entry with values not matching their fieldDefinitions', async function () {
    const slugs = Object.keys(entry.values);
    const firstSlug = slugs[0]!;
    const values: Record<string, Value> = {
      ...entry.values,
      [firstSlug]: {
        ...entry.values[firstSlug]!,
        valueType: 'number',
        content: { en: 123 },
      },
    };

    await expect(
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values,
      })
    ).rejects.toThrow();
  });

  it('should be able to update an Entry with values that match the Collections fieldDefinitions', async function () {
    const slugs = Object.keys(entry.values);
    const firstSlug = slugs[0]!;
    const values: Record<string, Value> = {
      ...entry.values,
      [firstSlug]: {
        ...entry.values[firstSlug]!,
        valueType: 'string',
        content: { en: 'Changed Text' },
      },
    };

    entry = await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values,
    });

    expect(entry.values).toEqual(values);
  });

  it('should be able to get an Entry of a specific commit', async function () {
    const history = await core.entries.history({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    const entryFromHistory = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      commitHash: history.at(-1)?.hash,
    });

    expect(Object.keys(entryFromHistory.values).length).toEqual(3);
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

  it('should be able to identify an Entry', function () {
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

describe('EntryService - component values', function () {
  let project: Project & { destroy: () => Promise<void> };
  let component: Component;
  let dynamicCollection: Collection;

  beforeAll(async function () {
    project = await createProject('EntryService Component Test');

    // Create a component with a text field
    const titleFieldId = uuid();
    component = await core.components.create({
      projectId: project.id,
      name: { en: 'Hero' },
      slug: 'hero',
      description: null,
      fieldDefinitions: [
        {
          id: titleFieldId,
          slug: 'title',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Title' },
          description: null,
          defaultValue: null,
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
        },
      ],
    });

    // Create a collection with a dynamic field referencing the component
    dynamicCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Page' }, plural: { en: 'Pages' } },
      slug: { singular: 'page', plural: 'pages' },
      description: { en: 'Pages with dynamic content blocks' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'blocks',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Content Blocks' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [component.id],
          min: null,
          max: null,
        },
      ],
    });
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to create an Entry with component values', async function () {
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: dynamicCollection.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [
            {
              id: uuid(),
              componentId: component.id,
              values: {
                title: {
                  objectType: 'value',
                  valueType: 'string',
                  content: { en: 'Welcome to our site' },
                },
              },
            },
          ],
        },
      },
    });

    expect(entry.id).toBeDefined();
    expect(entry.values['blocks']!.valueType).toEqual('component');
  });

  it('should reject an Entry with invalid component values', async function () {
    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: dynamicCollection.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: uuid(),
                componentId: component.id,
                values: {
                  title: {
                    objectType: 'value',
                    valueType: 'number',
                    content: { en: 123 },
                  },
                },
              },
            ],
          },
        },
      })
    ).rejects.toThrow();
  });
});
