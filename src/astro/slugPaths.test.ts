import { describe, expect, it } from 'vitest';
import { elekSlugPaths } from './slugPaths.js';
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
    let error: unknown = null;
    try {
      elekSlugPaths(posts, { slugField: 'permalink' });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('BadRequest');
    expect(error instanceof CoreError && error.message).toContain('permalink');
  });

  it('should reject a language the Entries do not have', function () {
    let error: unknown = null;
    try {
      elekSlugPaths(posts, { slugField: 'slug', language: 'fr' });
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
