import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
    const readCollection = (await core.collections.read({
      projectId: project.id,
      id: collection.id,
    }))._unsafeUnwrap();

    expect(readCollection.name.singular.en).toEqual(
      collection.name.singular.en
    );
  });

  it('should be able to update a Collection', async function () {
    collection.description.en =
      'The title should be short and catchy, to grab the users attention.';
    collection = (await core.collections.update({
      projectId: project.id,
      ...collection,
    }))._unsafeUnwrap();

    expect(collection.description.en).toEqual(
      'The title should be short and catchy, to grab the users attention.'
    );
  });

  it('should be able to get a Collection of a specific commit', async function () {
    const history = (await core.collections.history({
      projectId: project.id,
      id: collection.id,
    }))._unsafeUnwrap();
    const collectionFromHistory = (await core.collections.read({
      projectId: project.id,
      id: collection.id,
      commitHash: history.at(-1)?.hash,
    }))._unsafeUnwrap();

    expect(collectionFromHistory.description.en).toEqual(
      'A Collection that contains our Products'
    );
  });

  it('should be able to list all Collections', async function () {
    const collections = (await core.collections.list({ projectId: project.id }))._unsafeUnwrap();

    expect(collections.list.length).toEqual(1);
    expect(collections.total).toEqual(1);
    expect(collections.list.find((a) => a.id === collection.id)?.id).toEqual(
      collection.id
    );
  });

  it('should be able to count all Collections', async function () {
    const counted = (await core.collections.count({ projectId: project.id }))._unsafeUnwrap();

    expect(counted).toEqual(1);
  });

  it('should be able to identify a Collection', function () {
    expect(core.collections.isCollection(collection)).toEqual(true);
    expect(core.collections.isCollection({ objectType: 'collection' })).toEqual(
      false
    );
  });

  it('should be able to delete a Collection', async function () {
    (await core.collections.delete({ projectId: project.id, id: collection.id }))._unsafeUnwrap();

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
    const resolvedId = (await core.collections.resolveCollectionId({
      projectId: project.id,
      idOrSlug: collection.id,
    }))._unsafeUnwrap();

    expect(resolvedId).toEqual(collection.id);
  });

  it('should resolve a collection by slug', async function () {
    const resolvedId = (await core.collections.resolveCollectionId({
      projectId: project.id,
      idOrSlug: collection.slug.plural,
    }))._unsafeUnwrap();

    expect(resolvedId).toEqual(collection.id);
  });

  it('should return error when resolving a non-existent identifier', async function () {
    const result = await core.collections.resolveCollectionId({
      projectId: project.id,
      idOrSlug: 'non-existent-slug',
    });
    expect(result.isErr()).toBe(true);
  });

  it('should return error when resolving a non-existent UUID', async function () {
    const fakeUuid = uuid();
    const result = await core.collections.resolveCollectionId({
      projectId: project.id,
      idOrSlug: fakeUuid,
    });
    expect(result.isErr()).toBe(true);
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
    const readCollection = (await core.collections.readBySlug({
      projectId: project.id,
      slug: collection.slug.plural,
    }))._unsafeUnwrap();

    expect(readCollection.id).toEqual(collection.id);
    expect(readCollection.slug.plural).toEqual(collection.slug.plural);
  });

  it('should return error when reading by a non-existent slug', async function () {
    const result = await core.collections.readBySlug({
      projectId: project.id,
      slug: 'non-existent-slug',
    });
    expect(result.isErr()).toBe(true);
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
    const result = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Duplicate' },
        plural: { en: 'Duplicates' },
      },
      slug: {
        singular: 'duplicate',
        plural: collection.slug.plural, // same as existing
      },
      description: { en: 'A duplicate slug collection' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'some-field',
          valueType: 'string',
          label: { en: 'Field' },
          description: { en: 'Field' },
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
    expect(result.isErr()).toBe(true);
  });

  it('should reject updating a collection slug to conflict with an existing one', async function () {
    // Create a second collection with a different slug
    const secondCollection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Other' },
        plural: { en: 'Others' },
      },
      slug: {
        singular: 'other',
        plural: 'others',
      },
      description: { en: 'Another collection' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'other-field',
          valueType: 'string',
          label: { en: 'Field' },
          description: { en: 'Field' },
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
    }))._unsafeUnwrap();

    // Try to update it to use the first collection's slug
    const updateResult = await core.collections.update({
      projectId: project.id,
      ...secondCollection,
      slug: {
        singular: secondCollection.slug.singular,
        plural: collection.slug.plural, // conflict
      },
    });
    expect(updateResult.isErr()).toBe(true);

    // Clean up
    (await core.collections.delete({
      projectId: project.id,
      id: secondCollection.id,
    }))._unsafeUnwrap();
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
    const result = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Item' },
        plural: { en: 'Items' },
      },
      slug: {
        singular: 'item',
        plural: 'items',
      },
      description: { en: 'Test' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'duplicate-slug',
          valueType: 'string',
          label: { en: 'Field 1' },
          description: { en: 'Field 1' },
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
          label: { en: 'Field 2' },
          description: { en: 'Field 2' },
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
    expect(result.isErr()).toBe(true);
  });

  it('should reject updating a collection with duplicate fieldDefinition slugs', async function () {
    const collection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Widget' },
        plural: { en: 'Widgets' },
      },
      slug: {
        singular: 'widget',
        plural: 'widgets',
      },
      description: { en: 'Test' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'field-a',
          valueType: 'string',
          label: { en: 'Field A' },
          description: { en: 'Field A' },
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
          label: { en: 'Field B' },
          description: { en: 'Field B' },
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
    }))._unsafeUnwrap();

    // Rename field-b to field-a (duplicate)
    const updatedFieldDefs = collection.fieldDefinitions.map((fd) => ({
      ...fd,
      slug: 'field-a',
    }));

    const updateResult = await core.collections.update({
      projectId: project.id,
      ...collection,
      fieldDefinitions: updatedFieldDefs,
    });
    expect(updateResult.isErr()).toBe(true);

    // Clean up
    (await core.collections.delete({
      projectId: project.id,
      id: collection.id,
    }))._unsafeUnwrap();
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

    collection = (await core.collections.update({
      projectId: project.id,
      ...collection,
      fieldDefinitions: updatedFieldDefs,
    }))._unsafeUnwrap();

    // Read the entry and verify the value key was renamed
    const updatedEntry = (await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    }))._unsafeUnwrap();

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

    collection = (await core.collections.update({
      projectId: project.id,
      ...collection,
      fieldDefinitions: updatedFieldDefs,
    }))._unsafeUnwrap();

    const updatedEntry = (await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    }))._unsafeUnwrap();

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
    const tempCollection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Temp' },
        plural: { en: 'Temps' },
      },
      slug: {
        singular: 'temp',
        plural: 'temps',
      },
      description: { en: 'Temporary' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'temp-field',
          valueType: 'string',
          label: { en: 'Field' },
          description: { en: 'Field' },
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
    }))._unsafeUnwrap();

    const indexPath = core.util.pathTo.collectionIndex(project.id);
    let indexContent = JSON.parse(
      await Fs.readFile(indexPath, { encoding: 'utf8' })
    ) as Record<string, string>;
    expect(indexContent[tempCollection.id]).toEqual('temps');

    (await core.collections.delete({
      projectId: project.id,
      id: tempCollection.id,
    }))._unsafeUnwrap();

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
    const collection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Product' }, plural: { en: 'Products' } },
      slug: { singular: 'product', plural: 'products' },
      description: { en: 'Products' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'ungrouped-field',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Ungrouped' },
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
          label: { en: 'Details' },
          description: { en: 'Additional product details' },
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'grouped-field',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Grouped' },
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
    }))._unsafeUnwrap();

    expect(collection.fieldDefinitions).toHaveLength(2);
    const group = collection.fieldDefinitions.find((fd) => 'isGroup' in fd);
    expect(group).toBeDefined();
    expect((group as { id: string }).id).toEqual(groupId);
    expect(flattenFieldDefinitions(collection.fieldDefinitions)).toHaveLength(
      2
    );
  });

  it('should create entries using fieldDefinitions inside a group', async function () {
    const collection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Article' }, plural: { en: 'Articles' } },
      slug: { singular: 'article', plural: 'articles' },
      description: { en: 'Articles' },
      fieldDefinitions: [
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Content' },
          description: null,
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'title',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Title' },
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
    }))._unsafeUnwrap();

    const entry = (await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Hello World' },
        },
      },
    }))._unsafeUnwrap();

    expect(entry.values['title']).toBeDefined();
  });

  it('should reject duplicate slugs across grouped and ungrouped fieldDefinitions', async function () {
    const result = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Dupe' }, plural: { en: 'Dupes' } },
      slug: { singular: 'dupe', plural: 'dupes' },
      description: { en: 'Dupes' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'same-slug',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Ungrouped' },
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
          label: { en: 'Group' },
          description: null,
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'same-slug',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Grouped duplicate' },
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
    expect(result.isErr()).toBe(true);
  });

  it('should rename entry value keys for a fieldDefinition inside a group', async function () {
    const fieldId = uuid();
    const collection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Post' }, plural: { en: 'Posts' } },
      slug: { singular: 'post', plural: 'posts' },
      description: { en: 'Posts' },
      fieldDefinitions: [
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Meta' },
          description: null,
          fieldDefinitions: [
            {
              id: fieldId,
              slug: 'old-slug',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Field' },
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
    }))._unsafeUnwrap();

    const entry = (await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: {
        'old-slug': {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'test' },
        },
      },
    }))._unsafeUnwrap();

    // Rename the field inside the group
    const updatedCollection = (await core.collections.update({
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
              label: { en: 'Field' },
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
    }))._unsafeUnwrap();

    expect(updatedCollection).toBeDefined();

    const updatedEntry = (await core.entries.read({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    }))._unsafeUnwrap();

    expect(updatedEntry.values['new-slug']).toBeDefined();
    expect(updatedEntry.values['old-slug']).toBeUndefined();
  });

  it('should create a collection with an empty group', async function () {
    const emptyGroupCollection = (await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Empty Group Test' },
        plural: { en: 'Empty Group Tests' },
      },
      slug: { singular: 'empty-group-test', plural: 'empty-group-tests' },
      description: { en: 'A collection with an empty group' },
      fieldDefinitions: [
        {
          isGroup: true,
          id: uuid(),
          label: { en: 'Empty Group' },
          description: null,
          fieldDefinitions: [],
        },
      ],
    }))._unsafeUnwrap();

    expect(emptyGroupCollection).toBeDefined();
    expect(emptyGroupCollection.fieldDefinitions).toHaveLength(1);

    // Should be able to create an entry with no values (empty group means no fields)
    const entry = (await core.entries.create({
      projectId: project.id,
      collectionId: emptyGroupCollection.id,
      values: {},
    }))._unsafeUnwrap();

    expect(entry.id).toBeDefined();
  });
});
