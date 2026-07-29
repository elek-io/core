import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import core, { uuid, type MarkdownFeatures } from '../test/setup.js';
import { createProject } from '../test/util.js';
import { CoreError } from '../util/shared.js';
import { defineElekConfig } from './elekConfig.js';
import { elekCollections } from './collections.js';
import { getCore } from './core.js';

/** Every markdown feature off, so a test only turns on what it is about */
const markdownFeaturesOff: MarkdownFeatures = {
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

/**
 * A Collection with nothing but a slug, the derived keys only depend
 * on the plural one
 */
async function createCollectionWithSlug(
  projectId: string,
  singular: string,
  plural: string
) {
  return core.collections.create({
    projectId,
    icon: 'home',
    name: {
      singular: { en: singular, de: singular },
      plural: { en: plural, de: plural },
    },
    slug: { singular, plural },
    description: { en: `The ${plural}`, de: `The ${plural}` },
    fieldDefinitions: [],
  });
}

describe('elekCollections', function () {
  let project: Awaited<ReturnType<typeof createProject>>;
  let other: Awaited<ReturnType<typeof createProject>>;

  beforeAll(async function () {
    project = await createProject('Derived Collections Test');
    await createCollectionWithSlug(project.id, 'product', 'products');
    await createCollectionWithSlug(project.id, 'blog-post', 'blog-posts');

    other = await createProject('Derived Collections Test Two');
    await createCollectionWithSlug(other.id, 'page', 'pages');
  }, 60000);

  afterAll(async function () {
    await project.destroy();
    await other.destroy();
  }, 60000);

  it('should derive one collection per elek.io Collection plus the Assets one', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    const collections = await elekCollections(config);

    expect(Object.keys(collections).sort()).toEqual([
      'websiteAssets',
      'websiteBlogPosts',
      'websiteProducts',
    ]);
    // Pins what astro's defineCollection does with a loader-only config
    expect(collections['websiteProducts']).toMatchObject({
      type: 'content_layer',
    });
  }, 30000);

  it('should prefix the keys of every declared Project without mixing them', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: other.id } },
    });

    const collections = await elekCollections(config);

    expect(Object.keys(collections).sort()).toEqual([
      'shopAssets',
      'shopPages',
      'websiteAssets',
      'websiteBlogPosts',
      'websiteProducts',
    ]);
  }, 30000);

  it('should warn that the bare call is for exploration only', async function () {
    // It derives everything, which is what gets someone started and
    // what nobody should ship
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });
    const warn = vi.spyOn(getCore().logger, 'warn');

    await elekCollections(config);

    const messages = warn.mock.calls.map(([props]) => props.message);
    expect(
      messages.some((message) => message.includes('elekCollections'))
    ).toBe(true);
    // Names what it derived, so the cost is in front of the developer
    expect(messages.some((message) => message.includes('3'))).toBe(true);
    warn.mockRestore();
  }, 30000);

  it('should stay silent once a selection is given', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });
    const warn = vi.spyOn(getCore().logger, 'warn');

    await elekCollections(config, {
      collections: { website: ['products'] },
      assets: { website: true },
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  }, 30000);

  it('should derive exactly what the selection names and nothing else', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: other.id } },
    });

    const collections = await elekCollections(config, {
      collections: { website: ['products'], shop: ['pages'] },
      assets: { website: true },
    });

    // website's blog-posts and shop's Assets are not named, so they are
    // not derived
    expect(Object.keys(collections).sort()).toEqual([
      'shopPages',
      'websiteAssets',
      'websiteProducts',
    ]);
  }, 30000);

  it('should derive no Assets at all when the key is left out', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    const collections = await elekCollections(config, {
      collections: { website: ['products'] },
    });

    expect(Object.keys(collections)).toEqual(['websiteProducts']);
  }, 30000);

  it('should derive no Collections at all when the key is left out', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    const collections = await elekCollections(config, {
      assets: { website: true },
    });

    expect(Object.keys(collections)).toEqual(['websiteAssets']);
  }, 30000);

  it('should take the Assets directories of a named alias', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    const collections = await elekCollections(config, {
      assets: { website: { imageDir: './src/media' } },
    });

    expect(Object.keys(collections)).toEqual(['websiteAssets']);
  }, 30000);

  it('should accept a Collection UUID as well as its slug', async function () {
    const products = await core.collections.readBySlug({
      projectId: project.id,
      slug: 'products',
    });
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    const collections = await elekCollections(config, {
      collections: { website: [products.id] },
    });

    expect(Object.keys(collections)).toEqual(['websiteProducts']);
  }, 30000);

  it('should throw naming the alias when a selected Collection does not exist', async function () {
    // Silently deriving nothing would look exactly like a Collection
    // that failed to load
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    let error: unknown = null;
    try {
      await elekCollections(config, { collections: { website: ['post'] } });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('NotFound');
    expect(error instanceof CoreError && error.message).toContain('post');
    expect(error instanceof CoreError && error.message).toContain('website');
    // Says what the Project does have, so a typo is obvious
    expect(error instanceof CoreError && error.message).toContain('blog-posts');
  }, 30000);

  it('should throw when a selection derives nothing at all', async function () {
    // Same reason as the typo above, an empty result is what a broken
    // loader looks like
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    await expect(elekCollections(config, {})).rejects.toThrow(
      /derives no collections/
    );
    await expect(
      elekCollections(config, { collections: {}, assets: {} })
    ).rejects.toThrow(/derives no collections/);
  }, 30000);

  it('should throw when a selected Collection can reference excluded Assets', async function () {
    // Following the reference is getEntry("<alias>Assets", ref.id), so
    // excluding the Assets collection breaks it at render time, in a
    // template far away from the config that caused it
    const referencing = await createProject('Derived Collections References');
    try {
      await core.collections.create({
        projectId: referencing.id,
        icon: 'home',
        name: {
          singular: { en: 'post', de: 'post' },
          plural: { en: 'posts', de: 'posts' },
        },
        slug: { singular: 'post', plural: 'posts' },
        description: { en: 'The posts', de: 'The posts' },
        fieldDefinitions: [
          {
            id: uuid(),
            slug: 'cover',
            valueType: 'reference',
            fieldType: 'asset',
            label: { en: 'Cover', de: 'Cover' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            min: null,
            max: null,
            ofAssetMimeTypes: [],
          },
        ],
      });

      const config = defineElekConfig({
        projects: { website: { id: referencing.id } },
      });

      let error: unknown = null;
      try {
        await elekCollections(config, { collections: { website: ['posts'] } });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(CoreError);
      // Names the Collection, the field and the fix
      expect(error instanceof CoreError && error.message).toContain('posts');
      expect(error instanceof CoreError && error.message).toContain('cover');
      expect(error instanceof CoreError && error.message).toContain('website');

      // Naming the Assets of that Project is what makes it build
      const collections = await elekCollections(config, {
        collections: { website: ['posts'] },
        assets: { website: true },
      });
      expect(Object.keys(collections).sort()).toEqual([
        'websiteAssets',
        'websitePosts',
      ]);
    } finally {
      await referencing.destroy();
    }
  }, 60000);

  it('should throw when a markdown field may reference excluded Assets', async function () {
    // An Asset reference does not need a reference field, markdown
    // carries assetReference nodes too, and mdastRender resolves them
    // through the same Assets collection
    const referencing = await createProject('Derived Collections Markdown');
    try {
      async function createBodyCollection(assetReferences: boolean) {
        return core.collections.create({
          projectId: referencing.id,
          icon: 'home',
          name: {
            singular: { en: 'note', de: 'note' },
            plural: {
              en: assetReferences ? 'notes' : 'plain-notes',
              de: assetReferences ? 'notes' : 'plain-notes',
            },
          },
          slug: {
            singular: assetReferences ? 'note' : 'plain-note',
            plural: assetReferences ? 'notes' : 'plain-notes',
          },
          description: { en: 'The notes', de: 'The notes' },
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
              features: { ...markdownFeaturesOff, assetReferences },
              ofCollections: [],
              ofAssetMimeTypes: [],
              defaultValue: null,
            },
          ],
        });
      }

      await createBodyCollection(true);
      await createBodyCollection(false);

      const config = defineElekConfig({
        projects: { website: { id: referencing.id } },
      });

      let error: unknown = null;
      try {
        await elekCollections(config, { collections: { website: ['notes'] } });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(CoreError);
      expect(error instanceof CoreError && error.message).toContain('notes');
      expect(error instanceof CoreError && error.message).toContain('body');

      // The same field with the feature off reaches no Asset, so it
      // derives without the Assets collection
      const collections = await elekCollections(config, {
        collections: { website: ['plain-notes'] },
      });
      expect(Object.keys(collections)).toEqual(['websitePlainNotes']);
    } finally {
      await referencing.destroy();
    }
  }, 60000);

  it('should throw naming both sides when two derived keys collide', async function () {
    // toPascalCase cannot mark a digit boundary, so "a-1b" and "a1b"
    // both become "A1b"
    const collisions = await createProject('Derived Collections Collision');
    try {
      await createCollectionWithSlug(collisions.id, 'a-1b', 'a-1b');
      await createCollectionWithSlug(collisions.id, 'a1b', 'a1b');

      const config = defineElekConfig({
        projects: { website: { id: collisions.id } },
      });

      let error: unknown = null;
      try {
        await elekCollections(config);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(CoreError);
      expect(error instanceof CoreError && error.type).toEqual('Conflict');
      expect(error instanceof CoreError && error.message).toContain(
        'websiteA1b'
      );
      expect(error instanceof CoreError && error.message).toContain('a-1b');
      expect(error instanceof CoreError && error.message).toContain('a1b');
    } finally {
      await collisions.destroy();
    }
  }, 60000);

  it('should throw when two aliases and Collections meet in the same key', async function () {
    // Alias "web" plus "site-posts" and alias "webSite" plus "posts"
    // both derive "webSitePosts"
    const first = await createProject('Derived Collections Alias A');
    const second = await createProject('Derived Collections Alias B');
    try {
      await createCollectionWithSlug(first.id, 'site-post', 'site-posts');
      await createCollectionWithSlug(second.id, 'post', 'posts');

      const config = defineElekConfig({
        projects: { web: { id: first.id }, webSite: { id: second.id } },
      });

      await expect(
        elekCollections(config, {
          collections: { web: ['site-posts'], webSite: ['posts'] },
        })
      ).rejects.toThrow(/webSitePosts/);
    } finally {
      await first.destroy();
      await second.destroy();
    }
  }, 60000);

  it('should fail with the alias when a declared Project is not available', async function () {
    const config = defineElekConfig({
      projects: { missing: { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' } },
    });

    await expect(elekCollections(config)).rejects.toThrow(/missing/);
  }, 30000);

  it('should accept only the declared aliases in the assets option', function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: other.id } },
    });

    expect(Object.keys(config.projects)).toEqual(['website', 'shop']);

    type Options = NonNullable<
      Parameters<typeof elekCollections<typeof config>>[1]
    >;
    type PerAlias = NonNullable<Options['assets']>;

    expectTypeOf<keyof PerAlias>().toEqualTypeOf<'website' | 'shop'>();
  });

  it('should accept only the declared aliases in the collections option', function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: other.id } },
    });

    expect(Object.keys(config.projects)).toEqual(['website', 'shop']);

    type Options = NonNullable<
      Parameters<typeof elekCollections<typeof config>>[1]
    >;
    type PerAlias = NonNullable<Options['collections']>;

    expectTypeOf<keyof PerAlias>().toEqualTypeOf<'website' | 'shop'>();
  });
});
