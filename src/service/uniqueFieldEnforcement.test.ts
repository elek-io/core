import Fs from 'fs-extra';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CoreError } from '../util/shared.js';
import core, {
  uuid,
  type Collection,
  type Project,
  type Value,
} from '../test/setup.js';
import { createProject } from '../test/util.js';

/**
 * Builds a Collection with an optional unique `sku` text field and an optional
 * `slug` field. A fresh slug per Collection keeps Collection-slug uniqueness
 * happy across tests.
 */
async function createUniqueCollection(projectId: string): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Item', de: 'Item' },
      plural: { en: 'Items', de: 'Items' },
    },
    slug: { singular: `item-${suffix}`, plural: `items-${suffix}` },
    description: { en: 'Items', de: 'Items' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'sku',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'SKU', de: 'SKU' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: true,
        inputWidth: '12',
        defaultValue: null,
        min: null,
        max: null,
      },
      {
        id: uuid(),
        slug: 'page-slug',
        valueType: 'string',
        fieldType: 'slug',
        label: { en: 'Slug', de: 'Slug' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: true,
        inputWidth: '12',
        defaultValue: null,
        separator: '-',
        lowercase: true,
        decamelize: true,
        ofFieldDefinitions: [],
      },
    ],
  });
}

// Every field must be present with content for every project language (en, de);
// unset language slots are null.
function content(map?: Record<string, string | null>) {
  return { en: map?.['en'] ?? null, de: map?.['de'] ?? null };
}

function values(input: {
  sku?: Record<string, string | null>;
  slug?: Record<string, string | null>;
}): Record<string, Value> {
  return {
    sku: {
      objectType: 'value',
      valueType: 'string',
      content: content(input.sku),
    },
    'page-slug': {
      objectType: 'value',
      valueType: 'string',
      content: content(input.slug),
    },
  };
}

describe('Unique field enforcement', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  beforeEach(async function () {
    collection = await createUniqueCollection(project.id);
  });

  it('rejects a second Entry with the same unique value', async function () {
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: 'A-1' } }),
    });

    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ sku: { en: 'A-1' } }),
      })
    ).rejects.toThrow(CoreError);
  });

  it('reports the conflict as a structured Conflict error', async function () {
    const first = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: 'B-1' } }),
    });

    let error: unknown;
    try {
      await core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ sku: { en: 'B-1' } }),
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect((error as CoreError).type).toBe('Conflict');
    const conflicts = (error as CoreError).cause as Array<{
      fieldSlug: string;
      language: string;
      conflictingEntryId: string;
    }>;
    expect(conflicts).toEqual([
      expect.objectContaining({
        fieldSlug: 'sku',
        language: 'en',
        conflictingEntryId: first.id,
      }),
    ]);
  });

  it('allows the same value in different languages', async function () {
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: 'shared' } }),
    });

    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ sku: { de: 'shared' } }),
      })
    ).resolves.toBeDefined();
  });

  it('allows multiple Entries with a null / unset unique value', async function () {
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: null } }),
    });

    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({}),
      })
    ).resolves.toBeDefined();
  });

  it('rejects an update that takes another Entry value, but allows keeping own', async function () {
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: 'taken' } }),
    });
    const second = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: 'free' } }),
    });

    await expect(
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: second.id,
        values: values({ sku: { en: 'taken' } }),
      })
    ).rejects.toThrow(CoreError);

    // Re-saving its own value is allowed
    await expect(
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: second.id,
        values: values({ sku: { en: 'free' } }),
      })
    ).resolves.toBeDefined();
  });

  it('frees the value when an Entry is deleted', async function () {
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ sku: { en: 'recycle' } }),
    });

    await core.entries.delete({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ sku: { en: 'recycle' } }),
      })
    ).resolves.toBeDefined();
  });

  it('enforces uniqueness on slug fields too', async function () {
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: values({ slug: { en: 'about-us' } }),
    });

    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ slug: { en: 'about-us' } }),
      })
    ).rejects.toThrow(CoreError);
  });

  it('rejects a non-canonical slug value', async function () {
    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ slug: { en: 'About Us' } }),
      })
    ).rejects.toThrow(CoreError);
  });

  it('catches duplicates introduced outside the service (e.g. by a pull)', async function () {
    const coreVersion = core.coreVersion;

    // An Entry file written directly, as a pull or merge would land it. It never
    // passed through EntryService, so only a scan of disk can see it.
    const id = uuid();
    await Fs.writeJSON(
      core.util.pathTo.entryFile(project.id, collection.id, id),
      {
        objectType: 'entry',
        id,
        coreVersion,
        created: '2024-01-01T00:00:00.000Z',
        updated: null,
        values: values({ sku: { en: 'pulled' } }),
      }
    );

    // The scan-on-write check reads the on-disk Entry and rejects the duplicate
    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: values({ sku: { en: 'pulled' } }),
      })
    ).rejects.toThrow(CoreError);

    // Clean up the directly-written file so afterEach sees a clean git status
    await Fs.remove(core.util.pathTo.entryFile(project.id, collection.id, id));
  });
});

/**
 * A `code` text field whose uniqueness is configurable. A stable id lets the
 * Collection-update cascade treat the create and the flip as the same field.
 */
function codeFieldDef(id: string, unique: boolean) {
  return {
    id,
    slug: 'code',
    valueType: 'string' as const,
    fieldType: 'text' as const,
    label: { en: 'Code', de: 'Code' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: unique,
    inputWidth: '12' as const,
    defaultValue: null,
    min: null,
    max: null,
  };
}

/**
 * Collection with a single optional `code` text field, used to exercise the
 * Collection-update flip-to-unique path.
 */
async function createCodeCollection(
  projectId: string,
  options: { unique: boolean; fieldId: string }
): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Doc', de: 'Doc' },
      plural: { en: 'Docs', de: 'Docs' },
    },
    slug: { singular: `doc-${suffix}`, plural: `docs-${suffix}` },
    description: { en: 'Docs', de: 'Docs' },
    fieldDefinitions: [codeFieldDef(options.fieldId, options.unique)],
  });
}

function codeValues(code: string | null): Record<string, Value> {
  return {
    code: {
      objectType: 'value',
      valueType: 'string',
      content: { en: code, de: null },
    },
  };
}

describe('Making a field unique via Collection update', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('rejects the flip when existing Entries already collide', async function () {
    const codeId = uuid();
    const collection = await createCodeCollection(project.id, {
      unique: false,
      fieldId: codeId,
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: codeValues('X'),
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: codeValues('X'),
    });

    await expect(
      core.collections.update({
        ...collection,
        projectId: project.id,
        fieldDefinitions: [codeFieldDef(codeId, true)],
      })
    ).rejects.toThrow(CoreError);
  });

  it('allows the flip when there are no collisions, and enforces afterwards', async function () {
    const codeId = uuid();
    const collection = await createCodeCollection(project.id, {
      unique: false,
      fieldId: codeId,
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: codeValues('A'),
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: codeValues('B'),
    });

    await expect(
      core.collections.update({
        ...collection,
        projectId: project.id,
        fieldDefinitions: [codeFieldDef(codeId, true)],
      })
    ).resolves.toBeDefined();

    // The field is now enforced for new writes
    await expect(
      core.entries.create({
        projectId: project.id,
        collectionId: collection.id,
        values: codeValues('A'),
      })
    ).rejects.toThrow(CoreError);
  });

  it('accepts the flip when resolutions break the collision', async function () {
    const codeId = uuid();
    const collection = await createCodeCollection(project.id, {
      unique: false,
      fieldId: codeId,
    });
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: codeValues('DUP'),
    });
    const second = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: codeValues('DUP'),
    });

    await expect(
      core.collections.update({
        ...collection,
        projectId: project.id,
        fieldDefinitions: [codeFieldDef(codeId, true)],
        resolutions: {
          [second.id]: {
            code: {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'UNIQUE', de: null },
            },
          },
        },
      })
    ).resolves.toBeDefined();
  });
});
