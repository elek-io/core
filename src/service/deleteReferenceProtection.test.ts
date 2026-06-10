import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoreError } from '../util/shared.js';
import core, {
  uuid,
  type Collection,
  type Component,
  type MarkdownFeatures,
  type Project,
  type ReferencingEntry,
  type Value,
} from '../test/setup.js';
import {
  createAsset,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

/**
 * Extracts the `ReferencingEntry[]` from a blocked-delete `Conflict` error.
 * Returns `null` if the error isn't the expected shape.
 */
function getReferencingEntries(error: unknown): ReferencingEntry[] | null {
  if (!(error instanceof CoreError) || error.type !== 'Conflict') return null;
  if (!Array.isArray(error.cause)) return null;
  return error.cause as ReferencingEntry[];
}

/** Markdown features all off — these tests opt in to references only. */
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

/** Collection with optional flat `image` (asset) and `related` (entry) refs. */
async function createRefCollection(projectId: string): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Ref', de: 'Ref' },
      plural: { en: 'Refs', de: 'Refs' },
    },
    slug: { singular: `ref-${suffix}`, plural: `refs-${suffix}` },
    description: { en: 'Refs', de: 'Refs' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'image',
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
        ofAssetMimeTypes: [],
      },
      {
        id: uuid(),
        slug: 'related',
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
}

/** Collection with an optional markdown `body` allowing asset + entry refs. */
async function createMarkdownCollection(
  projectId: string
): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Article', de: 'Article' },
      plural: { en: 'Articles', de: 'Articles' },
    },
    slug: { singular: `article-${suffix}`, plural: `articles-${suffix}` },
    description: { en: 'Articles', de: 'Articles' },
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'body',
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
        ofAssetMimeTypes: [],
        defaultValue: null,
      },
    ],
  });
}

/** Component with optional `image` (asset) and `link` (entry) reference fields. */
async function createMediaComponent(projectId: string): Promise<Component> {
  return core.components.create({
    projectId,
    name: { en: 'Media', de: 'Media' },
    slug: `media-${uuid()}`,
    description: null,
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'image',
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
        ofAssetMimeTypes: [],
      },
      {
        id: uuid(),
        slug: 'link',
        valueType: 'reference',
        fieldType: 'entry',
        label: { en: 'Link', de: 'Link' },
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
}

/** Collection with a `blocks` dynamic field composing the given component. */
async function createPagesCollection(
  projectId: string,
  componentId: string
): Promise<Collection> {
  const suffix = uuid();
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: 'Page', de: 'Page' },
      plural: { en: 'Pages', de: 'Pages' },
    },
    slug: { singular: `page-${suffix}`, plural: `pages-${suffix}` },
    description: { en: 'Pages', de: 'Pages' },
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
        ofComponents: [componentId],
        min: null,
        max: null,
      },
    ],
  });
}

describe('Delete reference protection', function () {
  let project: Project & { destroy: () => Promise<void> };
  let refCollection: Collection;
  let markdownCollection: Collection;
  let mediaComponent: Component;
  let pagesCollection: Collection;

  beforeAll(async function () {
    project = await createProject('Delete Reference Protection');
    refCollection = await createRefCollection(project.id);
    markdownCollection = await createMarkdownCollection(project.id);
    mediaComponent = await createMediaComponent(project.id);
    pagesCollection = await createPagesCollection(
      project.id,
      mediaComponent.id
    );
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  describe('Asset', function () {
    it('blocks deleting an Asset referenced by a flat reference field', async function () {
      const asset = await createAsset(project.id);
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: {
          image: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [{ objectType: 'asset', id: asset.id }], de: [] },
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
        },
      });

      let error: unknown;
      try {
        await core.assets.delete({ projectId: project.id, ...asset });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).not.toBeNull();
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: refCollection.id,
          entryId: referrer.id,
          fieldSlug: 'image',
          via: 'reference',
          componentPath: [],
        }),
      ]);

      // After removing the referrer, the Asset deletes cleanly.
      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: referrer.id,
      });
      await core.assets.delete({ projectId: project.id, ...asset });
      expect(
        await Fs.pathExists(core.util.pathTo.assetFile(project.id, asset.id))
      ).toBe(false);
    });

    it('blocks deleting an Asset referenced by an mdast assetReference node', async function () {
      const asset = await createAsset(project.id);
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: markdownCollection.id,
        values: {
          body: {
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
                        assetId: asset.id,
                        alt: 'logo',
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

      let error: unknown;
      try {
        await core.assets.delete({ projectId: project.id, ...asset });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: markdownCollection.id,
          entryId: referrer.id,
          fieldSlug: 'body',
          via: 'mdast',
          componentPath: [],
        }),
      ]);
    });

    it('blocks deleting an Asset referenced only inside a dynamic/component item', async function () {
      const asset = await createAsset(project.id);
      const itemId = uuid();
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: pagesCollection.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: itemId,
                componentId: mediaComponent.id,
                values: {
                  image: {
                    objectType: 'value',
                    valueType: 'reference',
                    content: {
                      en: [{ objectType: 'asset', id: asset.id }],
                      de: [],
                    },
                  },
                  link: {
                    objectType: 'value',
                    valueType: 'reference',
                    content: { en: [], de: [] },
                  },
                },
              },
            ],
          },
        },
      });

      let error: unknown;
      try {
        await core.assets.delete({ projectId: project.id, ...asset });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(1);
      expect(refs![0]).toMatchObject({
        entryId: referrer.id,
        fieldSlug: 'image',
        via: 'reference',
      });
      // The reference is nested one dynamic block deep.
      expect(refs![0]!.componentPath).toEqual([
        expect.objectContaining({
          fieldSlug: 'blocks',
          itemId,
          componentId: mediaComponent.id,
        }),
      ]);
    });

    it('reports every referring Entry when an Asset is referenced more than once', async function () {
      const asset = await createAsset(project.id);
      const imageValue = {
        image: {
          objectType: 'value' as const,
          valueType: 'reference' as const,
          content: {
            en: [{ objectType: 'asset' as const, id: asset.id }],
            de: [],
          },
        },
        related: {
          objectType: 'value' as const,
          valueType: 'reference' as const,
          content: { en: [], de: [] },
        },
      };
      const r1 = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: imageValue,
      });
      const r2 = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: imageValue,
      });

      let error: unknown;
      try {
        await core.assets.delete({ projectId: project.id, ...asset });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).not.toBeNull();
      expect(refs!.map((r) => r.entryId).sort()).toEqual([r1.id, r2.id].sort());
    });

    it('deletes an unreferenced Asset normally', async function () {
      const asset = await createAsset(project.id);
      await core.assets.delete({ projectId: project.id, ...asset });
      expect(
        await Fs.pathExists(
          core.util.pathTo.asset(project.id, asset.id, asset.extension)
        )
      ).toBe(false);
      expect(
        await Fs.pathExists(core.util.pathTo.assetFile(project.id, asset.id))
      ).toBe(false);
    });
  });

  describe('Entry', function () {
    it('blocks deleting an Entry referenced by another Entry in a different Collection', async function () {
      const target = await core.entries.create({
        projectId: project.id,
        collectionId: markdownCollection.id,
        values: {
          body: {
            objectType: 'value',
            valueType: 'mdast',
            content: { en: null, de: null },
          },
        },
      });
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: {
          image: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: {
              en: [
                {
                  objectType: 'entry',
                  id: target.id,
                  collectionId: markdownCollection.id,
                },
              ],
              de: [],
            },
          },
        },
      });

      let error: unknown;
      try {
        await core.entries.delete({
          projectId: project.id,
          collectionId: markdownCollection.id,
          id: target.id,
        });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: refCollection.id,
          entryId: referrer.id,
          fieldSlug: 'related',
          via: 'reference',
          componentPath: [],
        }),
      ]);

      // After removing the referrer, the target Entry deletes cleanly.
      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: referrer.id,
      });
      await core.entries.delete({
        projectId: project.id,
        collectionId: markdownCollection.id,
        id: target.id,
      });
    });

    it('blocks deleting an Entry referenced by an mdast entryReference node', async function () {
      const target = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: {
          image: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
        },
      });
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: markdownCollection.id,
        values: {
          body: {
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
                        collectionId: refCollection.id,
                        entryId: target.id,
                        children: [{ type: 'text', value: 'see also' }],
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

      let error: unknown;
      try {
        await core.entries.delete({
          projectId: project.id,
          collectionId: refCollection.id,
          id: target.id,
        });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: markdownCollection.id,
          entryId: referrer.id,
          fieldSlug: 'body',
          via: 'mdast',
          componentPath: [],
        }),
      ]);
    });

    it('allows deleting an Entry that references only itself', async function () {
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: {
          image: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
        },
      });
      // Point the Entry at itself (only possible once it has an id).
      await core.entries.update({
        projectId: project.id,
        collectionId: refCollection.id,
        id: entry.id,
        values: {
          image: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: {
              en: [
                {
                  objectType: 'entry',
                  id: entry.id,
                  collectionId: refCollection.id,
                },
              ],
              de: [],
            },
          },
        },
      });

      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: entry.id,
      });
      expect(
        await Fs.pathExists(
          core.util.pathTo.entryFile(project.id, refCollection.id, entry.id)
        )
      ).toBe(false);
    });

    it('deletes an unreferenced Entry normally', async function () {
      const entry = await core.entries.create({
        projectId: project.id,
        collectionId: refCollection.id,
        values: {
          image: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: { en: [], de: [] },
          },
        },
      });
      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: entry.id,
      });
      expect(
        await Fs.pathExists(
          core.util.pathTo.entryFile(project.id, refCollection.id, entry.id)
        )
      ).toBe(false);
    });
  });

  describe('Collection', function () {
    /** Values for a `createRefCollection`-shaped Entry with the given related Entry refs. */
    function refValues(
      related: Array<{ id: string; collectionId: string }>
    ): Record<string, Value> {
      return {
        image: {
          objectType: 'value',
          valueType: 'reference',
          content: { en: [], de: [] },
        },
        related: {
          objectType: 'value',
          valueType: 'reference',
          content: {
            en: related.map((r) => ({
              objectType: 'entry' as const,
              id: r.id,
              collectionId: r.collectionId,
            })),
            de: [],
          },
        },
      };
    }

    const createRefEntry = (
      collectionId: string,
      related: Array<{ id: string; collectionId: string }> = []
    ) =>
      core.entries.create({
        projectId: project.id,
        collectionId,
        values: refValues(related),
      });

    const updateRefEntry = (
      collectionId: string,
      id: string,
      related: Array<{ id: string; collectionId: string }>
    ) =>
      core.entries.update({
        projectId: project.id,
        collectionId,
        id,
        values: refValues(related),
      });

    it('blocks deleting a Collection whose Entry is referenced by a flat reference field in another Collection', async function () {
      const doomed = await createRefCollection(project.id);
      const target = await createRefEntry(doomed.id);
      const referrer = await createRefEntry(refCollection.id, [
        { id: target.id, collectionId: doomed.id },
      ]);

      let error: unknown;
      try {
        await core.collections.delete({ projectId: project.id, id: doomed.id });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: refCollection.id,
          entryId: referrer.id,
          fieldSlug: 'related',
          via: 'reference',
          componentPath: [],
        }),
      ]);

      // After removing the external referrer, the Collection deletes cleanly.
      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: referrer.id,
      });
      await core.collections.delete({ projectId: project.id, id: doomed.id });
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(false);
    });

    it('blocks deleting a Collection whose Entry is referenced by an mdast entryReference node', async function () {
      const doomed = await createRefCollection(project.id);
      const target = await createRefEntry(doomed.id);
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: markdownCollection.id,
        values: {
          body: {
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
                        collectionId: doomed.id,
                        entryId: target.id,
                        children: [{ type: 'text', value: 'see also' }],
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

      let error: unknown;
      try {
        await core.collections.delete({ projectId: project.id, id: doomed.id });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: markdownCollection.id,
          entryId: referrer.id,
          fieldSlug: 'body',
          via: 'mdast',
          componentPath: [],
        }),
      ]);

      await core.entries.delete({
        projectId: project.id,
        collectionId: markdownCollection.id,
        id: referrer.id,
      });
      await core.collections.delete({ projectId: project.id, id: doomed.id });
    });

    it('blocks deleting a Collection whose Entry is referenced inside a dynamic/component item', async function () {
      const doomed = await createRefCollection(project.id);
      const target = await createRefEntry(doomed.id);
      const itemId = uuid();
      const referrer = await core.entries.create({
        projectId: project.id,
        collectionId: pagesCollection.id,
        values: {
          blocks: {
            objectType: 'value',
            valueType: 'component',
            content: [
              {
                id: itemId,
                componentId: mediaComponent.id,
                values: {
                  image: {
                    objectType: 'value',
                    valueType: 'reference',
                    content: { en: [], de: [] },
                  },
                  link: {
                    objectType: 'value',
                    valueType: 'reference',
                    content: {
                      en: [
                        {
                          objectType: 'entry',
                          id: target.id,
                          collectionId: doomed.id,
                        },
                      ],
                      de: [],
                    },
                  },
                },
              },
            ],
          },
        },
      });

      let error: unknown;
      try {
        await core.collections.delete({ projectId: project.id, id: doomed.id });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(1);
      expect(refs![0]).toMatchObject({
        entryId: referrer.id,
        fieldSlug: 'link',
        via: 'reference',
      });
      expect(refs![0]!.componentPath).toEqual([
        expect.objectContaining({
          fieldSlug: 'blocks',
          itemId,
          componentId: mediaComponent.id,
        }),
      ]);

      await core.entries.delete({
        projectId: project.id,
        collectionId: pagesCollection.id,
        id: referrer.id,
      });
      await core.collections.delete({ projectId: project.id, id: doomed.id });
    });

    it('blocks deleting a Collection referenced as a whole by a hand-written reference', async function () {
      const doomed = await createRefCollection(project.id);

      // A reference to the Collection itself. No field type produces this, so
      // the test writes the Entry file directly to exercise the defensive
      // detection branch.
      const id = uuid();
      const referrerPath = core.util.pathTo.entryFile(
        project.id,
        refCollection.id,
        id
      );
      await Fs.writeJSON(referrerPath, {
        objectType: 'entry',
        id,
        coreVersion: core.coreVersion,
        created: '2024-01-01T00:00:00.000Z',
        updated: null,
        values: {
          related: {
            objectType: 'value',
            valueType: 'reference',
            content: {
              en: [{ objectType: 'collection', id: doomed.id }],
              de: [],
            },
          },
        },
      });

      let error: unknown;
      try {
        await core.collections.delete({ projectId: project.id, id: doomed.id });
      } catch (caught) {
        error = caught;
      }
      const refs = getReferencingEntries(error);
      expect(refs).toEqual([
        expect.objectContaining({
          collectionId: refCollection.id,
          entryId: id,
          fieldSlug: 'related',
          via: 'reference',
          componentPath: [],
        }),
      ]);

      // Remove the directly-written file so afterEach sees a clean git status,
      // after which the Collection deletes cleanly.
      await Fs.remove(referrerPath);
      await core.collections.delete({ projectId: project.id, id: doomed.id });
    });

    it('allows deleting a Collection whose Entries reference each other', async function () {
      const doomed = await createRefCollection(project.id);
      const a = await createRefEntry(doomed.id);
      const b = await createRefEntry(doomed.id);
      // Cross-link them (only possible once both exist).
      await updateRefEntry(doomed.id, a.id, [
        { id: b.id, collectionId: doomed.id },
      ]);
      await updateRefEntry(doomed.id, b.id, [
        { id: a.id, collectionId: doomed.id },
      ]);

      await core.collections.delete({ projectId: project.id, id: doomed.id });
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(false);
    });

    it('allows deleting a Collection whose Entry references only itself', async function () {
      const doomed = await createRefCollection(project.id);
      const entry = await createRefEntry(doomed.id);
      await updateRefEntry(doomed.id, entry.id, [
        { id: entry.id, collectionId: doomed.id },
      ]);

      await core.collections.delete({ projectId: project.id, id: doomed.id });
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(false);
    });

    it('allows deleting a Collection whose Entry references out to a surviving Entry', async function () {
      const survivor = await createRefEntry(refCollection.id);
      const doomed = await createRefCollection(project.id);
      await createRefEntry(doomed.id, [
        { id: survivor.id, collectionId: refCollection.id },
      ]);

      await core.collections.delete({ projectId: project.id, id: doomed.id });
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(false);
      // The survivor (and its Entry referencing nothing now removed) is intact.
      expect(
        await Fs.pathExists(
          core.util.pathTo.entryFile(project.id, refCollection.id, survivor.id)
        )
      ).toBe(true);

      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: survivor.id,
      });
    });

    it('deletes an empty Collection cleanly', async function () {
      const doomed = await createRefCollection(project.id);
      await core.collections.delete({ projectId: project.id, id: doomed.id });
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(false);
    });

    it('deletes an unreferenced Collection with Entries cleanly', async function () {
      const doomed = await createRefCollection(project.id);
      await createRefEntry(doomed.id);
      await createRefEntry(doomed.id);
      await core.collections.delete({ projectId: project.id, id: doomed.id });
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(false);
    });

    it('leaves the working tree and Collection untouched after a blocked delete', async function () {
      const doomed = await createRefCollection(project.id);
      const target = await createRefEntry(doomed.id);
      const referrer = await createRefEntry(refCollection.id, [
        { id: target.id, collectionId: doomed.id },
      ]);

      await expect(
        core.collections.delete({ projectId: project.id, id: doomed.id })
      ).rejects.toThrow(CoreError);

      // The Collection, its Entry and the working tree are all intact.
      expect(
        await Fs.pathExists(core.util.pathTo.collection(project.id, doomed.id))
      ).toBe(true);
      expect(
        await Fs.pathExists(
          core.util.pathTo.entryFile(project.id, doomed.id, target.id)
        )
      ).toBe(true);
      const status = await core.git.status(
        core.util.pathTo.project(project.id)
      );
      expect(status.length).toBe(0);
      // The slug index still resolves the Collection.
      await expect(
        core.collections.readBySlug({
          projectId: project.id,
          slug: doomed.slug.plural,
        })
      ).resolves.toMatchObject({ id: doomed.id });

      await core.entries.delete({
        projectId: project.id,
        collectionId: refCollection.id,
        id: referrer.id,
      });
      await core.collections.delete({ projectId: project.id, id: doomed.id });
    });
  });
});
