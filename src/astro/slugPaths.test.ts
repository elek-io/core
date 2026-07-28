import { describe, expect, expectTypeOf, it } from 'vitest';
import { elekSlugPaths, type ElekRoutableEntry } from './slugPaths.js';
import { CoreError } from '../util/shared.js';

const posts = [
  {
    id: 'aaa',
    data: {
      slug: { en: 'hello-world', de: 'hallo-welt' },
      title: { en: 'Hello world', de: 'Hallo Welt' },
    },
  },
  {
    id: 'bbb',
    data: {
      // Not published in German, so it has no URL there
      slug: { en: 'second-post', de: null },
      title: { en: 'Second post', de: 'Zweiter Beitrag' },
    },
  },
];

describe('elekSlugPaths', function () {
  it('should route every language by default', function () {
    const paths = elekSlugPaths(posts, { slugField: 'slug' });

    expect(paths.map((path) => path.params)).toEqual([
      { language: 'en', slug: 'hello-world' },
      { language: 'de', slug: 'hallo-welt' },
      { language: 'en', slug: 'second-post' },
    ]);
  });

  it('should route a single language without a language param', function () {
    const paths = elekSlugPaths(posts, { slugField: 'slug', language: 'en' });

    expect(paths.map((path) => path.params)).toEqual([
      { slug: 'hello-world' },
      { slug: 'second-post' },
    ]);
  });

  it('should skip an Entry without a slug in the routed language', function () {
    const paths = elekSlugPaths(posts, { slugField: 'slug', language: 'de' });

    expect(paths.map((path) => path.params)).toEqual([{ slug: 'hallo-welt' }]);
  });

  it('should hand the whole Entry to the page', function () {
    const [first] = elekSlugPaths(posts, { slugField: 'slug', language: 'en' });

    expect(first?.props.entry).toBe(posts[0]);
  });

  it('should keep a slug that repeats across languages', function () {
    // Slugs are unique per language, the same string may be used again
    // in another language
    const paths = elekSlugPaths(
      [{ id: 'aaa', data: { slug: { en: 'kontakt', de: 'kontakt' } } }],
      { slugField: 'slug' }
    );

    expect(paths.map((path) => path.params)).toEqual([
      { language: 'en', slug: 'kontakt' },
      { language: 'de', slug: 'kontakt' },
    ]);
  });

  it('should return nothing for no Entries', function () {
    expect(elekSlugPaths([], { slugField: 'slug' })).toEqual([]);
  });

  it('should reject a field that is not on the Entry', function () {
    // A typed Entry makes this a compile error, so the runtime guard is
    // reached through an Entry whose fields are not statically known
    const loose: ElekRoutableEntry[] = posts;

    let error: unknown = null;
    try {
      elekSlugPaths(loose, { slugField: 'permalink' });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('BadRequest');
    expect(error instanceof CoreError && error.message).toContain('permalink');
  });

  it('should reject a language the Entries do not have', function () {
    // A typed Entry makes this a compile error, so the runtime guard is
    // reached through an Entry whose languages are not statically known
    const loose: ElekRoutableEntry[] = posts;

    let error: unknown = null;
    try {
      elekSlugPaths(loose, { slugField: 'slug', language: 'fr' });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('BadRequest');
    // Names what is available instead
    expect(error instanceof CoreError && error.message).toContain('en');
    expect(error instanceof CoreError && error.message).toContain('de');
  });

  it('should reject a field that holds something other than a slug', function () {
    expect(() =>
      elekSlugPaths([{ id: 'aaa', data: { slug: 'hello-world' } }], {
        slugField: 'slug',
      })
    ).toThrow(/slug/);
  });
});

describe('elekSlugPaths language on props', function () {
  /** What the loaders generate: every Value keyed by the Project's languages */
  const typedPosts = [
    {
      id: 'aaa',
      data: {
        slug: { en: 'hello-world', de: 'hallo-welt' } as Record<
          'en' | 'de',
          string | null
        >,
        title: { en: 'Hello world', de: 'Hallo Welt' } as Record<
          'en' | 'de',
          string
        >,
      },
    },
  ];

  it('should hand the language of each path to the page', function () {
    // So a template reads entry.data.title[language] without naming the
    // languages itself, which Astro.params cannot type
    const paths = elekSlugPaths(typedPosts, { slugField: 'slug' });

    expect(paths.map((path) => path.props.language)).toEqual(['en', 'de']);
  });

  it('should hand the routed language over when a single one is asked for', function () {
    const paths = elekSlugPaths(typedPosts, {
      slugField: 'slug',
      language: 'de',
    });

    expect(paths).toHaveLength(1);
    expect(paths[0]?.props.language).toEqual('de');
    expect(paths[0]?.props.entry).toBe(typedPosts[0]);
  });

  it('should type the language from the Entry it routes', function () {
    const paths = elekSlugPaths(typedPosts, { slugField: 'slug' });

    expectTypeOf(paths[0]!.props.language).toEqualTypeOf<'en' | 'de'>();
  });

  it('should type the language option from the Entry too', function () {
    type Props = Parameters<
      typeof elekSlugPaths<(typeof typedPosts)[number], 'slug'>
    >[1];

    expectTypeOf<NonNullable<Props['language']>>().toEqualTypeOf<'en' | 'de'>();
  });

  it('should accept only field names the Entry has', function () {
    type Props = Parameters<
      typeof elekSlugPaths<(typeof typedPosts)[number], 'slug'>
    >[1];

    expectTypeOf<Props['slugField']>().toEqualTypeOf<'slug'>();
  });

  it('should fall back to string for an Entry whose languages are not typed', function () {
    // A hand-built entry, where nothing narrows the languages
    const loose: ElekRoutableEntry[] = [
      { id: 'aaa', data: { slug: { en: 'hello-world' } } },
    ];
    const paths = elekSlugPaths(loose, { slugField: 'slug' });

    expectTypeOf(paths[0]!.props.language).toEqualTypeOf<string>();
    expect(paths[0]?.props.language).toEqual('en');
  });
});
