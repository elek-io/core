import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoreError } from '../util/shared.js';
import type {
  EntryReferenceIssue,
  MarkdownFeatures,
  Value,
} from '../test/setup.js';
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
        content: { en: 'Changed Text', de: 'Changed Text' },
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
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      description: null,
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

    // Create a collection with a dynamic field referencing the component
    dynamicCollection = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Page', de: 'Page' },
        plural: { en: 'Pages', de: 'Pages' },
      },
      slug: { singular: 'page', plural: 'pages' },
      description: {
        en: 'Pages with dynamic content blocks',
        de: 'Pages with dynamic content blocks',
      },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'blocks',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Content Blocks', de: 'Content Blocks' },
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
                  content: {
                    en: 'Welcome to our site',
                    de: 'Welcome to our site',
                  },
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

/**
 * Helper: extract `error.cause.issues` from a thrown `CoreError`.
 * Returns `null` if the error isn't a CoreError with the expected shape.
 */
function getReferenceIssues(error: unknown): EntryReferenceIssue[] | null {
  if (!(error instanceof CoreError)) return null;
  const cause = error.cause as { issues?: unknown } | undefined;
  if (!cause || !Array.isArray(cause.issues)) return null;
  return cause.issues as EntryReferenceIssue[];
}

/** Markdown features map with everything disabled — tests opt in. */
const offMarkdownFeatures: MarkdownFeatures = {
  headings: [],
  blockquotes: false,
  lists: false,
  codeBlocks: false,
  thematicBreak: false,
  rawHtml: false,
  tables: false,
  taskListItems: false,
  footnotes: false,
  emphasis: false,
  strong: false,
  inlineCode: false,
  externalLinks: false,
  entryReferences: false,
  externalImages: false,
  assetReferences: false,
  strikethrough: false,
  hardLineBreaks: false,
};

describe('EntryService - reference validation', function () {
  let project: Project & { destroy: () => Promise<void> };
  let imageAsset: Asset; // image/png from the test fixture
  let referencedEntry: Entry;
  let collectionForRefs: Collection;
  let collectionWithMarkdown: Collection;
  /** Slugs used on `collectionForRefs`. */
  const refSlugs = {
    assetImagesOnly: 'asset-images-only',
    entryRef: 'entry-ref',
  };
  /** Slugs used on `collectionWithMarkdown`. */
  const mdSlugs = {
    body: 'body',
  };

  beforeAll(async function () {
    project = await createProject('EntryService Ref Validation');
    imageAsset = await createAsset(project.id);

    // First create the markdown collection so we have somewhere to put a
    // referenced entry. Markdown features include entryReferences AND
    // assetReferences so we can test mdast tree refs end-to-end.
    collectionWithMarkdown = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Article', de: 'Article' },
        plural: { en: 'Articles', de: 'Articles' },
      },
      slug: { singular: 'article', plural: 'articles' },
      description: {
        en: 'Articles with markdown body content',
        de: 'Articles with markdown body content',
      },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: mdSlugs.body,
          valueType: 'mdast',
          fieldType: 'markdown',
          label: { en: 'Body', de: 'Body' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          features: {
            ...offMarkdownFeatures,
            entryReferences: true,
            assetReferences: true,
          },
          ofCollections: [],
          // Allow only JPEG so PNG assets (the test fixture) trigger
          // asset_mime_mismatch.
          ofAssetMimeTypes: ['image/jpeg'],
          defaultValue: null,
        },
      ],
    });

    // Create a referenced entry first (the body field is optional → no
    // refs needed).
    referencedEntry = await core.entries.create({
      projectId: project.id,
      collectionId: collectionWithMarkdown.id,
      values: {
        [mdSlugs.body]: {
          objectType: 'value',
          valueType: 'mdast',
          content: { en: null, de: null },
        },
      },
    });

    // Collection with flat asset + entry reference fields.
    collectionForRefs = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: 'Product', de: 'Product' },
        plural: { en: 'Products', de: 'Products' },
      },
      slug: { singular: 'product-ref', plural: 'products-ref' },
      description: { en: 'Products', de: 'Products' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: refSlugs.assetImagesOnly,
          valueType: 'reference',
          fieldType: 'asset',
          label: { en: 'Image', de: 'Image' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          // Allow only JPEG — the test fixture asset is PNG, so any
          // reference to it triggers asset_mime_mismatch.
          ofAssetMimeTypes: ['image/jpeg'],
        },
        {
          id: uuid(),
          slug: refSlugs.entryRef,
          valueType: 'reference',
          fieldType: 'entry',
          label: { en: 'Related', de: 'Related' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          ofCollections: [],
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

  describe('flat asset reference fields', function () {
    it('rejects an Entry whose asset reference points to a non-existent asset', async function () {
      const ghostAssetId = uuid();
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionForRefs.id,
          values: {
            [refSlugs.assetImagesOnly]: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [{ objectType: 'asset', id: ghostAssetId }],
                de: [],
              },
            },
            [refSlugs.entryRef]: {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [], de: [] },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'reference_not_found',
          refKind: 'asset',
          refId: ghostAssetId,
          fieldSlug: refSlugs.assetImagesOnly,
          language: 'en',
          index: 0,
          treePath: [],
        });
      }
    });

    it('rejects an Entry whose asset reference has the wrong MIME type', async function () {
      // imageAsset is image/png; the field allows only image/jpeg.
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionForRefs.id,
          values: {
            [refSlugs.assetImagesOnly]: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [{ objectType: 'asset', id: imageAsset.id }],
                de: [],
              },
            },
            [refSlugs.entryRef]: {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [], de: [] },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'asset_mime_mismatch',
          assetId: imageAsset.id,
          expectedMimeTypes: ['image/jpeg'],
          actualMimeType: 'image/png',
          fieldSlug: refSlugs.assetImagesOnly,
          language: 'en',
        });
      }
    });
  });

  describe('flat entry reference fields', function () {
    it('rejects an Entry whose entry reference points to a non-existent entry', async function () {
      const ghostEntryId = uuid();
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionForRefs.id,
          values: {
            [refSlugs.assetImagesOnly]: {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [], de: [] },
            },
            [refSlugs.entryRef]: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [
                  {
                    objectType: 'entry',
                    id: ghostEntryId,
                    collectionId: collectionWithMarkdown.id,
                  },
                ],
                de: [],
              },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'reference_not_found',
          refKind: 'entry',
          refId: ghostEntryId,
          collectionId: collectionWithMarkdown.id,
          fieldSlug: refSlugs.entryRef,
          language: 'en',
          index: 0,
          treePath: [],
        });
      }
    });

    it('accepts an Entry whose entry reference points to a real entry', async function () {
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: collectionForRefs.id,
        values: {
          [refSlugs.assetImagesOnly]: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          [refSlugs.entryRef]: {
            objectType: 'value',
            valueType: 'reference',
            content: {
              en: [
                {
                  objectType: 'entry',
                  id: referencedEntry.id,
                  collectionId: collectionWithMarkdown.id,
                },
              ],
              de: [],
            },
          },
        },
      });
      expect(entry.id).toBeDefined();
    });
  });

  describe('mdast tree references', function () {
    it('rejects an mdast entryReference to a non-existent entry', async function () {
      const ghostEntryId = uuid();
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionWithMarkdown.id,
          values: {
            [mdSlugs.body]: {
              objectType: 'value',
              valueType: 'mdast',
              content: {
                en: {
                  type: 'root',
                  children: [
                    {
                      type: 'paragraph',
                      children: [
                        {
                          type: 'entryReference',
                          collectionId: collectionWithMarkdown.id,
                          entryId: ghostEntryId,
                          children: [{ type: 'text', value: 'gone' }],
                        },
                      ],
                    },
                  ],
                },
                de: null,
              },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'reference_not_found',
          refKind: 'entry',
          refId: ghostEntryId,
          collectionId: collectionWithMarkdown.id,
          fieldSlug: mdSlugs.body,
          language: 'en',
          index: null,
          // root.children[0] (paragraph) -> children[0] (entryReference)
          treePath: [0, 0],
        });
      }
    });

    it('rejects an mdast assetReference whose MIME does not match ofAssetMimeTypes', async function () {
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionWithMarkdown.id,
          values: {
            [mdSlugs.body]: {
              objectType: 'value',
              valueType: 'mdast',
              content: {
                en: {
                  type: 'root',
                  children: [
                    {
                      type: 'paragraph',
                      children: [
                        {
                          type: 'assetReference',
                          assetId: imageAsset.id,
                          alt: 'png logo',
                          title: null,
                        },
                      ],
                    },
                  ],
                },
                de: null,
              },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'asset_mime_mismatch',
          assetId: imageAsset.id,
          expectedMimeTypes: ['image/jpeg'],
          actualMimeType: 'image/png',
          fieldSlug: mdSlugs.body,
          language: 'en',
          index: null,
          treePath: [0, 0],
        });
      }
    });

    it('rejects an mdast assetReference to a non-existent asset', async function () {
      const ghostAssetId = uuid();
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionWithMarkdown.id,
          values: {
            [mdSlugs.body]: {
              objectType: 'value',
              valueType: 'mdast',
              content: {
                en: {
                  type: 'root',
                  children: [
                    {
                      type: 'paragraph',
                      children: [
                        {
                          type: 'assetReference',
                          assetId: ghostAssetId,
                          alt: 'missing',
                          title: null,
                        },
                      ],
                    },
                  ],
                },
                de: null,
              },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'reference_not_found',
          refKind: 'asset',
          refId: ghostAssetId,
          fieldSlug: mdSlugs.body,
          language: 'en',
          index: null,
          treePath: [0, 0],
        });
      }
    });

    it('reports the treePath for a reference that is not the first child', async function () {
      const ghostEntryId = uuid();
      try {
        await core.entries.create({
          projectId: project.id,
          collectionId: collectionWithMarkdown.id,
          values: {
            [mdSlugs.body]: {
              objectType: 'value',
              valueType: 'mdast',
              content: {
                en: {
                  type: 'root',
                  children: [
                    {
                      type: 'paragraph',
                      children: [{ type: 'text', value: 'first block' }],
                    },
                    {
                      type: 'paragraph',
                      children: [
                        { type: 'text', value: 'a ' },
                        { type: 'text', value: 'b ' },
                        {
                          type: 'entryReference',
                          collectionId: collectionWithMarkdown.id,
                          entryId: ghostEntryId,
                          children: [{ type: 'text', value: 'gone' }],
                        },
                      ],
                    },
                  ],
                },
                de: null,
              },
            },
          },
        });
        throw new Error('expected create to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'reference_not_found',
          refKind: 'entry',
          refId: ghostEntryId,
          // root.children[1] (second paragraph) -> children[2] (third child = entryReference)
          treePath: [1, 2],
        });
      }
    });

    it('accepts an mdast entryReference to a real entry', async function () {
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: collectionWithMarkdown.id,
        values: {
          [mdSlugs.body]: {
            objectType: 'value',
            valueType: 'mdast',
            content: {
              en: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      {
                        type: 'entryReference',
                        collectionId: collectionWithMarkdown.id,
                        entryId: referencedEntry.id,
                        children: [{ type: 'text', value: 'tutorial' }],
                      },
                    ],
                  },
                ],
              },
              de: null,
            },
          },
        },
      });
      expect(entry.id).toBeDefined();
    });
  });

  describe('update path', function () {
    it('rejects an update that introduces a dangling asset reference', async function () {
      // Create a clean entry first.
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: collectionForRefs.id,
        values: {
          [refSlugs.assetImagesOnly]: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          [refSlugs.entryRef]: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
        },
      });

      const ghostAssetId = uuid();
      try {
        await core.entries.update({
          projectId: project.id,
          collectionId: collectionForRefs.id,
          id: entry.id,
          values: {
            [refSlugs.assetImagesOnly]: {
              objectType: 'value',
              valueType: 'reference',
              content: {
                en: [{ objectType: 'asset', id: ghostAssetId }],
                de: [],
              },
            },
            [refSlugs.entryRef]: {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [], de: [] },
            },
          },
        });
        throw new Error('expected update to throw');
      } catch (error) {
        const issues = getReferenceIssues(error);
        expect(issues).not.toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues![0]).toMatchObject({
          kind: 'reference_not_found',
          refKind: 'asset',
          refId: ghostAssetId,
        });
      }
    });
  });
});

describe('EntryService - dynamic field with open ofComponents', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject('EntryService Open Components Test');
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('resolves all Project Components when a dynamic field has an empty ofComponents', { timeout: 30000 }, async function () {
    const hero = await core.components.create({
      projectId: project.id,
      name: { en: 'Hero', de: 'Hero' },
      slug: 'hero',
      description: { en: 'Hero', de: 'Hero' },
      fieldDefinitions: [
        {
          id: uuid(),
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

    const pages = await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: { singular: { en: 'Page', de: 'Page' }, plural: { en: 'Pages', de: 'Pages' } },
      description: { en: 'Pages', de: 'Pages' },
      slug: { singular: 'page', plural: 'pages' },
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'blocks',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Blocks', de: 'Blocks' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [], // open: any Component is allowed
          min: null,
          max: null,
        },
      ],
    });

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: pages.id,
      values: {
        blocks: {
          objectType: 'value',
          valueType: 'component',
          content: [
            {
              id: uuid(),
              componentId: hero.id,
              values: {
                title: {
                  objectType: 'value',
                  valueType: 'string',
                  content: { en: 'Welcome', de: 'Willkommen' },
                },
              },
            },
          ],
        },
      },
    });

    expect(entry.id).toBeDefined();
  });
});
