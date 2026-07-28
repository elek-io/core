import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';
import core from '../test/setup.js';
import { createProject } from '../test/util.js';
import { CoreError } from '../util/shared.js';
import { defineElekConfig } from './elekConfig.js';
import { elekCollections } from './collections.js';

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

  it('should drop every Assets collection when asked', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: other.id } },
    });

    const collections = await elekCollections(config, { assets: false });

    expect(Object.keys(collections).sort()).toEqual([
      'shopPages',
      'websiteBlogPosts',
      'websiteProducts',
    ]);
  }, 30000);

  it('should drop the Assets collection of a single Project', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id }, shop: { id: other.id } },
    });

    const collections = await elekCollections(config, {
      assets: { shop: false },
    });

    expect(Object.keys(collections).sort()).toEqual([
      'shopPages',
      'websiteAssets',
      'websiteBlogPosts',
      'websiteProducts',
    ]);
  }, 30000);

  it('should keep the Assets collection when only its outDir is overridden', async function () {
    const config = defineElekConfig({
      projects: { website: { id: project.id } },
    });

    const collections = await elekCollections(config, {
      assets: { website: { outDir: './src/media' } },
    });

    expect(Object.keys(collections)).toContain('websiteAssets');
  }, 30000);

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

      await expect(elekCollections(config, { assets: false })).rejects.toThrow(
        /webSitePosts/
      );
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
    type PerAlias = Exclude<Options['assets'], false | undefined>;

    expectTypeOf<keyof PerAlias>().toEqualTypeOf<'website' | 'shop'>();
  });
});
