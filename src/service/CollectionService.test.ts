import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import ElekIoCore from '../index.node.js';
import core, {
  flattenFieldDefinitions,
  type Asset,
  type Collection,
  type Entry,
  type Project,
  uuid,
} from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

describe('CollectionService', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to create a new Collection', async function () {
    collection = await createCollection(project.id);

    expect(collection.id).toBeDefined();
  });

  it('should be able to read a Collection', async function () {
    const readCollection = await core.collections.read({
      projectId: project.id,
      id: collection.id,
    });

    expect(readCollection.name.singular.en).toEqual(
      collection.name.singular.en
    );
  });

  it('should be able to update a Collection', async function () {
    collection.description.en =
      'The title should be short and catchy, to grab the users attention.';
    collection = await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    expect(collection.description.en).toEqual(
      'The title should be short and catchy, to grab the users attention.'
    );
  });

  it('should be able to get a Collection of a specific commit', async function () {
    const history = await core.collections.history({
      projectId: project.id,
      id: collection.id,
    });
    const collectionFromHistory = await core.collections.read({
      projectId: project.id,
      id: collection.id,
      commitHash: history.at(-1)?.hash,
    });

    expect(collectionFromHistory.description.en).toEqual(
      'A Collection that contains our Products'
    );
  });

  it('should be able to list all Collections', async function () {
    const collections = await core.collections.list({
      projectId: project.id,
    });

    expect(collections.list.length).toEqual(1);
    expect(collections.total).toEqual(1);
    expect(collections.list.find((a) => a.id === collection.id)?.id).toEqual(
      collection.id
    );
  });

  it('should be able to count all Collections', async function () {
    const counted = await core.collections.count({
      projectId: project.id,
    });

    expect(counted).toEqual(1);
  });

  it('should be able to identify a Collection', function () {
    expect(core.collections.isCollection(collection)).toEqual(true);
    expect(core.collections.isCollection({ objectType: 'collection' })).toEqual(
      false
    );
  });

  it('should be able to delete a Collection', async function () {
    await core.collections.delete({
      projectId: project.id,
      id: collection.id,
    });

    expect(
      await Fs.pathExists(
        core.util.pathTo.collection(project.id, collection.id)
      )
    ).toBe(false);
    expect(
      await Fs.pathExists(
        core.util.pathTo.collectionFile(project.id, collection.id)
      )
    ).toBe(false);
  });
});

describe('CollectionService - resolveCollectionId', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
    collection = await createCollection(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should resolve a collection by UUID', async function () {
    const resolvedId = await core.collections.resolveCollectionId({
      projectId: project.id,
      idOrSlug: collection.id,
    });

    expect(resolvedId).toEqual(collection.id);
  });

  it('should resolve a collection by slug', async function () {
    const resolvedId = await core.collections.resolveCollectionId({
      projectId: project.id,
      idOrSlug: collection.slug.plural,
    });

    expect(resolvedId).toEqual(collection.id);
  });

  it('should return error when resolving a non-existent identifier', async function () {
    await expect(
      core.collections.resolveCollectionId({
        projectId: project.id,
        idOrSlug: 'non-existent-slug',
      })
    ).rejects.toThrow();
  });

  it('should return error when resolving a non-existent UUID', async function () {
    const fakeUuid = uuid();
    await expect(
      core.collections.resolveCollectionId({
        projectId: project.id,
        idOrSlug: fakeUuid,
      })
    ).rejects.toThrow();
  });
});

describe('CollectionService - readBySlug', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
    collection = await createCollection(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should read a collection by its slug', async function () {
    const readCollection = await core.collections.readBySlug({
      projectId: project.id,
      slug: collection.slug.plural,
    });

    expect(readCollection.id).toEqual(collection.id);
    expect(readCollection.slug.plural).toEqual(collection.slug.plural);
  });

  it('should return error when reading by a non-existent slug', async function () {
    await expect(
      core.collections.readBySlug({
        projectId: project.id,
        slug: 'non-existent-slug',
      })
    ).rejects.toThrow();
  });
});

describe('CollectionService - slug uniqueness', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
    collection = await createCollection(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should reject creating a second collection with the same slug', async function () {
    await expect(
      core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Duplicate', de: 'Duplicate' },
          plural: { en: 'Duplicates', de: 'Duplicates' },
        },
        slug: {
          singular: 'duplicate',
          plural: collection.slug.plural, // same as existing
        },
        description: {
          en: 'A duplicate slug collection',
          de: 'A duplicate slug collection',
        },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'some-field',
            valueType: 'string',
            label: { en: 'Field', de: 'Field' },
            description: { en: 'Field', de: 'Field' },
            fieldType: 'text',
            inputWidth: '12',
            isDisabled: false,
            isRequired: false,
            isUnique: false,
            min: null,
            max: null,
            defaultValue: null,
          },
        ],
      })
    ).rejects.toThrow();
  });

  it('should reject updating a collection slug to conflict with an existing one', async function () {
    // Create a second collection with a different slug
    const secondCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Other', de: 'Other' },
        plural: { en: 'Others', de: 'Others' },
      },
      slug: {
        singular: 'other',
        plural: 'others',
      },
      description: { en: 'Another collection', de: 'Another collection' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'other-field',
          valueType: 'string',
          label: { en: 'Field', de: 'Field' },
          description: { en: 'Field', de: 'Field' },
          fieldType: 'text',
          inputWidth: '12',
          isDisabled: false,
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });

    // Try to update it to use the first collection's slug
    await expect(
      core.collections.update({
        projectId: project.id,
        ...secondCollection,
        slug: {
          singular: secondCollection.slug.singular,
          plural: collection.slug.plural, // conflict
        },
      })
    ).rejects.toThrow();

    // Clean up
    await core.collections.delete({
      projectId: project.id,
      id: secondCollection.id,
    });
  });
});

describe('CollectionService - fieldDefinition slug uniqueness', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should reject creating a collection with duplicate fieldDefinition slugs', async function () {
    await expect(
      core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Item', de: 'Item' },
          plural: { en: 'Items', de: 'Items' },
        },
        slug: {
          singular: 'item',
          plural: 'items',
        },
        description: { en: 'Test', de: 'Test' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'duplicate-slug',
            valueType: 'string',
            label: { en: 'Field 1', de: 'Field 1' },
            description: { en: 'Field 1', de: 'Field 1' },
            fieldType: 'text',
            inputWidth: '12',
            isDisabled: false,
            isRequired: false,
            isUnique: false,
            min: null,
            max: null,
            defaultValue: null,
          },
          {
            id: uuid(),
            slug: 'duplicate-slug',
            valueType: 'string',
            label: { en: 'Field 2', de: 'Field 2' },
            description: { en: 'Field 2', de: 'Field 2' },
            fieldType: 'text',
            inputWidth: '12',
            isDisabled: false,
            isRequired: false,
            isUnique: false,
            min: null,
            max: null,
            defaultValue: null,
          },
        ],
      })
    ).rejects.toThrow();
  });

  it('should reject updating a collection with duplicate fieldDefinition slugs', async function () {
    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Widget', de: 'Widget' },
        plural: { en: 'Widgets', de: 'Widgets' },
      },
      slug: {
        singular: 'widget',
        plural: 'widgets',
      },
      description: { en: 'Test', de: 'Test' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'field-a',
          valueType: 'string',
          label: { en: 'Field A', de: 'Field A' },
          description: { en: 'Field A', de: 'Field A' },
          fieldType: 'text',
          inputWidth: '12',
          isDisabled: false,
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          id: uuid(),
          slug: 'field-b',
          valueType: 'string',
          label: { en: 'Field B', de: 'Field B' },
          description: { en: 'Field B', de: 'Field B' },
          fieldType: 'text',
          inputWidth: '12',
          isDisabled: false,
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });

    // Rename field-b to field-a (duplicate)
    const updatedFieldDefs = collection.fieldDefinitions.map((fd) => ({
      ...fd,
      slug: 'field-a',
    }));

    await expect(
      core.collections.update({
        projectId: project.id,
        ...collection,
        fieldDefinitions: updatedFieldDefs,
      })
    ).rejects.toThrow();

    // Clean up
    await core.collections.delete({
      projectId: project.id,
      id: collection.id,
    });
  });
});

describe('CollectionService - fieldDefinition slug rename cascade', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;
  let entry: Entry;

  beforeAll(async function () {
    project = await createProject();
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    entry = await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should rename entry value keys when a fieldDefinition slug is renamed', async function () {
    const oldSlugs = Object.keys(entry.values);
    const targetFieldDef = flattenFieldDefinitions(
      collection.fieldDefinitions
    )[0]!;
    const oldSlug = targetFieldDef.slug;
    const newSlug = 'renamed-field';

    // Update the collection with a renamed field definition slug
    const updatedFieldDefs = collection.fieldDefinitions.map((fd) => {
      if (fd.id === targetFieldDef.id) {
        return { ...fd, slug: newSlug };
      }
      return fd;
    });

    collection = await core.collections.update({
      projectId: project.id,
      ...collection,
      fieldDefinitions: updatedFieldDefs,
    });

    // Read the entry and verify the value key was renamed
    const updatedEntry = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(updatedEntry.values[newSlug]).toBeDefined();
    expect(updatedEntry.values[oldSlug]).toBeUndefined();

    // All other keys should still be present
    const newSlugs = Object.keys(updatedEntry.values);
    expect(newSlugs.length).toEqual(oldSlugs.length);

    entry = updatedEntry;
  });

  it('should rename multiple field definition slugs simultaneously', async function () {
    // Rename two field definitions at once
    const firstFd = flattenFieldDefinitions(collection.fieldDefinitions)[0]!;
    const secondFd = flattenFieldDefinitions(collection.fieldDefinitions)[1]!;
    const newSlug1 = 'multi-rename-a';
    const newSlug2 = 'multi-rename-b';

    const updatedFieldDefs = collection.fieldDefinitions.map((fd) => {
      if (fd.id === firstFd.id) return { ...fd, slug: newSlug1 };
      if (fd.id === secondFd.id) return { ...fd, slug: newSlug2 };
      return fd;
    });

    collection = await core.collections.update({
      projectId: project.id,
      ...collection,
      fieldDefinitions: updatedFieldDefs,
    });

    const updatedEntry = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(updatedEntry.values[newSlug1]).toBeDefined();
    expect(updatedEntry.values[newSlug2]).toBeDefined();
    expect(updatedEntry.values[firstFd.slug]).toBeUndefined();
    expect(updatedEntry.values[secondFd.slug]).toBeUndefined();

    entry = updatedEntry;
  });
});

describe('CollectionService - collection index', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
    collection = await createCollection(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should create an index file on disk after collection creation', async function () {
    const indexPath = core.util.pathTo.collectionIndex(project.id);
    expect(await Fs.pathExists(indexPath)).toBe(true);

    const indexContent = JSON.parse(
      await Fs.readFile(indexPath, { encoding: 'utf8' })
    ) as Record<string, string>;
    expect(indexContent[collection.id]).toEqual(collection.slug.plural);
  });

  it('should remove collection from index after deletion', async function () {
    const tempCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Temp', de: 'Temp' },
        plural: { en: 'Temps', de: 'Temps' },
      },
      slug: {
        singular: 'temp',
        plural: 'temps',
      },
      description: { en: 'Temporary', de: 'Temporary' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'temp-field',
          valueType: 'string',
          label: { en: 'Field', de: 'Field' },
          description: { en: 'Field', de: 'Field' },
          fieldType: 'text',
          inputWidth: '12',
          isDisabled: false,
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });

    const indexPath = core.util.pathTo.collectionIndex(project.id);
    let indexContent = JSON.parse(
      await Fs.readFile(indexPath, { encoding: 'utf8' })
    ) as Record<string, string>;
    expect(indexContent[tempCollection.id]).toEqual('temps');

    await core.collections.delete({
      projectId: project.id,
      id: tempCollection.id,
    });

    indexContent = JSON.parse(
      await Fs.readFile(indexPath, { encoding: 'utf8' })
    ) as Record<string, string>;
    expect(indexContent[tempCollection.id]).toBeUndefined();
  });
});

describe('CollectionService - fieldDefinition groups', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should create a collection with grouped and ungrouped fieldDefinitions', async function () {
    const groupId = uuid();
    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Product', de: 'Product' },
        plural: { en: 'Products', de: 'Products' },
      },
      slug: { singular: 'product', plural: 'products' },
      description: { en: 'Products', de: 'Products' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'ungrouped-field',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Ungrouped', de: 'Ungrouped' },
          description: null,
          inputWidth: '12',
          isDisabled: false,
          isRequired: false,
          isUnique: false,
          min: null,
          max: null,
          defaultValue: null,
        },
        {
          isGroup: true,
          id: groupId,
          label: { en: 'Details', de: 'Details' },
          description: {
            en: 'Additional product details',
            de: 'Additional product details',
          },
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'grouped-field',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Grouped', de: 'Grouped' },
              description: null,
              inputWidth: '12',
              isDisabled: false,
              isRequired: false,
              isUnique: false,
              min: null,
              max: null,
              defaultValue: null,
            },
          ],
        },
      ],
    });

    expect(collection.fieldDefinitions).toHaveLength(2);
    const group = collection.fieldDefinitions.find((fd) => 'isGroup' in fd);
    expect(group).toBeDefined();
    expect((group as { id: string }).id).toEqual(groupId);
    expect(flattenFieldDefinitions(collection.fieldDefinitions)).toHaveLength(
      2
    );
  });

  it('should create entries using fieldDefinitions inside a group', async function () {
    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      slug: { singular: 'article', plural: 'articles' },
      description: { en: 'Articles', de: 'Articles' },
      fieldDefinitions: [
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Content', de: 'Content' },
          description: null,
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'title',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Title', de: 'Title' },
              description: null,
              inputWidth: '12',
              isDisabled: false,
              isRequired: true,
              isUnique: false,
              min: null,
              max: null,
              defaultValue: null,
            },
          ],
        },
      ],
    });

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello World', de: 'Hello World' },
        },
      },
    });

    expect(entry.values['title']).toBeDefined();
  });

  it('should reject duplicate slugs across grouped and ungrouped fieldDefinitions', async function () {
    await expect(
      core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Dupe', de: 'Dupe' },
          plural: { en: 'Dupes', de: 'Dupes' },
        },
        slug: { singular: 'dupe', plural: 'dupes' },
        description: { en: 'Dupes', de: 'Dupes' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'same-slug',
            valueType: 'string',
            fieldType: 'text',
            label: { en: 'Ungrouped', de: 'Ungrouped' },
            description: null,
            inputWidth: '12',
            isDisabled: false,
            isRequired: false,
            isUnique: false,
            min: null,
            max: null,
            defaultValue: null,
          },
          {
            isGroup: true,
            id: uuid(),
            label: { en: 'Group', de: 'Group' },
            description: null,
            fieldDefinitions: [
              {
                id: uuid(),
                slug: 'same-slug',
                valueType: 'string',
                fieldType: 'text',
                label: { en: 'Grouped duplicate', de: 'Grouped duplicate' },
                description: null,
                inputWidth: '12',
                isDisabled: false,
                isRequired: false,
                isUnique: false,
                min: null,
                max: null,
                defaultValue: null,
              },
            ],
          },
        ],
      })
    ).rejects.toThrow();
  });

  it('should rename entry value keys for a fieldDefinition inside a group', async function () {
    const fieldId = uuid();
    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Post', de: 'Post' },
        plural: { en: 'Posts', de: 'Posts' },
      },
      slug: { singular: 'post', plural: 'posts' },
      description: { en: 'Posts', de: 'Posts' },
      fieldDefinitions: [
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Meta', de: 'Meta' },
          description: null,
          fieldDefinitions: [
            {
              id: fieldId,
              slug: 'old-slug',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Field', de: 'Field' },
              description: null,
              inputWidth: '12',
              isDisabled: false,
              isRequired: true,
              isUnique: false,
              min: null,
              max: null,
              defaultValue: null,
            },
          ],
        },
      ],
    });

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        'old-slug': {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'test', de: 'test' },
        },
      },
    });

    // Rename the field inside the group
    const updatedCollection = await core.collections.update({
      projectId: project.id,
      ...collection,
      fieldDefinitions: [
        {
          ...(collection.fieldDefinitions[0] as {
            isGroup: true;
            id: string;
            label: Record<string, string>;
            description: null;
            fieldDefinitions: object[];
          }),
          fieldDefinitions: [
            {
              id: fieldId,
              slug: 'new-slug',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Field', de: 'Field' },
              description: null,
              inputWidth: '12',
              isDisabled: false,
              isRequired: true,
              isUnique: false,
              min: null,
              max: null,
              defaultValue: null,
            },
          ],
        },
      ],
    });

    expect(updatedCollection).toBeDefined();

    const updatedEntry = await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(updatedEntry.values['new-slug']).toBeDefined();
    expect(updatedEntry.values['old-slug']).toBeUndefined();
  });

  it('should create a collection with an empty group', async function () {
    const emptyGroupCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Empty Group Test', de: 'Empty Group Test' },
        plural: { en: 'Empty Group Tests', de: 'Empty Group Tests' },
      },
      slug: { singular: 'empty-group-test', plural: 'empty-group-tests' },
      description: {
        en: 'A collection with an empty group',
        de: 'A collection with an empty group',
      },
      fieldDefinitions: [
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Empty Group', de: 'Empty Group' },
          description: null,
          fieldDefinitions: [],
        },
      ],
    });

    expect(emptyGroupCollection).toBeDefined();
    expect(emptyGroupCollection.fieldDefinitions).toHaveLength(1);

    // Should be able to create an entry with no values (empty group means no fields)
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: emptyGroupCollection.id,
      values: {},
    });

    expect(entry.id).toBeDefined();
  });
});

describe('CollectionService - update entry resolutions', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collectionId: string;
  let entryId: string;
  let titleFieldId: string;

  // Adds a new REQUIRED field with no default, which cannot be auto-resolved
  // for the existing entry (missing_required issue per transformEntryValues).
  const collectionWithRequiredSummary = () => ({
    projectId: project.id,
    id: collectionId,
    icon: 'home' as const,
    name: {
      singular: { en: 'Article', de: 'Article' },
      plural: { en: 'Articles', de: 'Articles' },
    },
    description: { en: 'Articles', de: 'Articles' },
    slug: { singular: 'article', plural: 'articles' },
    fieldDefinitions: [
      {
        id: titleFieldId,
        slug: 'title',
        valueType: 'string' as const,
        fieldType: 'text' as const,
        label: { en: 'Title', de: 'Title' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        min: null,
        max: null,
      },
      {
        id: uuid(),
        slug: 'summary',
        valueType: 'string' as const,
        fieldType: 'text' as const,
        label: { en: 'Summary', de: 'Summary' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        min: null,
        max: null,
      },
    ],
  });

  beforeAll(async function () {
    project = await createProject('CollectionService Resolutions Test');

    titleFieldId = uuid();
    const collection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      description: { en: 'Articles', de: 'Articles' },
      slug: { singular: 'article', plural: 'articles' },
      fieldDefinitions: [
        {
          id: titleFieldId,
          slug: 'title',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Title', de: 'Title' },
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
    collectionId = collection.id;

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId,
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello', de: 'Hallo' },
        },
      },
    });
    entryId = entry.id;
  }, 30000);

  afterAll(async function () {
    await project.destroy();
  });

  it(
    'throws a conflict when field changes need unresolved entry resolutions',
    { timeout: 30000 },
    async function () {
      await expect(
        core.collections.update(collectionWithRequiredSummary())
      ).rejects.toThrow(/require entry resolutions/);
    }
  );

  it(
    'rejects a resolution value that fails the new field schema',
    { timeout: 30000 },
    async function () {
      await expect(
        core.collections.update({
          ...collectionWithRequiredSummary(),
          resolutions: {
            // Generically a valid Value, but the wrong valueType for a string field.
            [entryId]: {
              summary: {
                objectType: 'value',
                valueType: 'number',
                content: { en: 1, de: 1 },
              },
            },
          },
        })
      ).rejects.toThrow(/Resolution validation failed/);
    }
  );
});

describe('AbstractIndexedEntityService - stale index cache', function () {
  let project: Project & { destroy: () => Promise<void> };
  // A second, independent Core instance that shares the same on-disk data
  // directory. Used to simulate another actor mutating disk behind the test
  // instance's cached index.
  let secondCore: ElekIoCore;

  const makeCollection = (
    core_: typeof core,
    plural: string,
    singular: string
  ) =>
    core_.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: singular, de: singular },
        plural: { en: plural, de: plural },
      },
      description: { en: plural, de: plural },
      slug: { singular, plural },
      fieldDefinitions: [],
    });

  beforeAll(async function () {
    project = await createProject('IndexedEntity Stale Cache Test');
    secondCore = new ElekIoCore({ log: { level: 'debug' } });
  });

  afterAll(async function () {
    await project.destroy();
    await secondCore.dispose();
  });

  it(
    'rebuilds the index and retries when the cached index is stale',
    { timeout: 30000 },
    async function () {
      // Populate the test instance's cached index for this project.
      await makeCollection(core, 'firsts', 'first');

      // A second Core instance writes another Collection to the same data dir.
      // The test instance's cached index does not know about it yet.
      const second = await makeCollection(secondCore, 'seconds', 'second');

      // Resolving by slug misses the stale cache, then rebuilds from disk and
      // finds the Collection on the retry pass.
      const resolvedId = await core.collections.resolveCollectionId({
        projectId: project.id,
        idOrSlug: 'seconds',
      });
      expect(resolvedId).to.equal(second.id);
    }
  );
});
