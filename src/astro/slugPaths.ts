import { CoreError } from '../util/shared.js';

/**
 * The minimum an Astro content entry has to look like to be routed by
 * one of its slug fields
 */
export interface ElekRoutableEntry {
  id: string;
  data: Record<string, unknown>;
}

export interface ElekSlugPathsProps {
  /** Field definition slug of the slug field to route by */
  slugField: string;
  /**
   * Route a single language, so the params hold the slug alone. Omit
   * to route every language, which adds the language to the params.
   */
  language?: string;
}

export interface ElekSlugPath<E extends ElekRoutableEntry> {
  params: { slug: string; language?: string };
  props: { entry: E };
}

/**
 * A slug Value is translatable, so it holds one slug per language and
 * `null` where an Entry has none
 */
function isTranslatable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns Entries into the paths a `getStaticPaths` returns, routing
 * them by one of their slug fields instead of by their UUID.
 *
 * Every language of the Collection gets its own path, with the
 * language in the params, unless a single one is asked for. An Entry
 * without a slug in a language is left out of that language, it has no
 * public URL there.
 *
 * A Collection can define any number of slug fields, so the field to
 * route by is named per call. Entries stay keyed by their UUID in
 * Astro's store, which is what `getEntry()` and every reference
 * lookup keeps using.
 *
 * @example
 * ```ts
 * // src/pages/[language]/[slug].astro
 * export async function getStaticPaths() {
 *   const posts = await getCollection('websitePosts');
 *   return elekSlugPaths(posts, { slugField: 'slug' });
 * }
 *
 * const { entry } = Astro.props;
 * ```
 */
export function elekSlugPaths<E extends ElekRoutableEntry>(
  entries: E[],
  props: ElekSlugPathsProps
): ElekSlugPath<E>[] {
  const paths: ElekSlugPath<E>[] = [];

  for (const entry of entries) {
    const value = entry.data[props.slugField];
    if (!isTranslatable(value)) {
      throw CoreError.badRequest(
        `Entry "${entry.id}" has no slug field "${props.slugField}" to route by. Name a slug field of the Collection, its Entries hold one slug per language.`
      );
    }

    if (props.language !== undefined && !(props.language in value)) {
      throw CoreError.badRequest(
        `Entry "${entry.id}" has no language "${props.language}". The Project supports: ${Object.keys(value).join(', ')}.`
      );
    }

    const languages =
      props.language === undefined ? Object.keys(value) : [props.language];

    for (const language of languages) {
      const slug = value[language];
      // Null is the normal state for an Entry that is not published in
      // a language, it simply gets no path there
      if (typeof slug !== 'string' || slug === '') {
        continue;
      }
      paths.push({
        params: props.language === undefined ? { language, slug } : { slug },
        props: { entry },
      });
    }
  }

  return paths;
}
