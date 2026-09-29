import { defineCollection } from 'astro/content/config';
import { CoreError } from '../util/shared.js';
import { toPascalCase } from '../cli/util.js';
import {
  flattenFieldDefinitions,
  type FieldDefinition,
} from '../schema/fieldSchema.js';
import type { Collection } from '../schema/collectionSchema.js';
import { assertElekConfig, type ElekConfig } from './elekConfig.js';
import { elekAssetsLoader, elekEntriesLoader } from './loaders.js';
import { getCore, ensureProjectAvailable } from './core.js';

type ElekCollection = ReturnType<typeof defineCollection>;

/**
 * Where the binaries of one Project's Assets are saved. `imageDir` takes the
 * images, `publicDir` every other file, and `true` takes both defaults.
 *
 * A relative path resolves against the Astro project root. `imageDir` has to
 * stay inside the project for `astro:assets` to process an image, and
 * `publicDir` inside Astro's own `publicDir` for the file to be served. An
 * Asset landing outside either is still saved and stored, with `src` or `href`
 * null and a warning, rather than failing the build.
 */
export type ElekAssetsOption = true | { imageDir?: string; publicDir?: string };

export interface ElekCollectionsOptions<T extends ElekConfig> {
  /**
   * Which Projects contribute their Assets collection, `true` for the
   * default directories or an object to say where the binaries go.
   *
   * Left out, no Project does. An Assets collection copies every
   * binary of its Project into the site on each sync, so it is the
   * expensive one to derive without needing it.
   */
  assets?: { [Alias in keyof T['projects'] & string]?: ElekAssetsOption };
  /**
   * Which Collections to derive, named by plural slug or by id.
   *
   * Left out, none are. A name that matches no Collection of the
   * Project it is listed under throws, so a typo says so instead of
   * quietly deriving nothing.
   */
  collections?: { [Alias in keyof T['projects'] & string]?: string[] };
}

/**
 * Reads the entry an option holds for one alias.
 *
 * An options object is the complete list, so an alias it does not name
 * contributes nothing.
 */
function optionFor<V>(
  option: Record<string, V | undefined> | undefined,
  alias: string
): V | undefined {
  if (option === undefined) {
    return undefined;
  }
  return Object.entries(option).find(([key]) => key === alias)?.[1];
}

/**
 * Narrows a Project's Collections to the selection, matching each name
 * against the plural slug and the id, the same two a loader's
 * `collectionIdOrSlug` accepts.
 *
 * A name that matches nothing throws rather than being skipped. The
 * selection exists to leave Collections out, so a silently dropped one
 * is indistinguishable from the feature working.
 */
function selectCollections(
  list: Collection[],
  selection: string[],
  alias: string
): Collection[] {
  const unknown = selection.filter(
    (name) =>
      !list.some(
        (collection) =>
          collection.slug.plural === name || collection.id === name
      )
  );
  if (unknown.length > 0) {
    throw CoreError.notFound(
      `Project "${alias}" has no Collection ${unknown
        .map((name) => `"${name}"`)
        .join(', ')}. It has ${list
        .map((collection) => `"${collection.slug.plural}"`)
        .join(', ')}. Name a Collection by its plural slug or its id.`
    );
  }

  return list.filter(
    (collection) =>
      selection.includes(collection.slug.plural) ||
      selection.includes(collection.id)
  );
}

/**
 * Whether a field can hold a reference to an Asset, either as a
 * reference field or as an assetReference node inside markdown
 */
function canReferenceAssets(fieldDefinition: FieldDefinition): boolean {
  if (fieldDefinition.fieldType === 'asset') {
    return true;
  }
  return (
    fieldDefinition.valueType === 'mdast' &&
    fieldDefinition.features.assetReferences
  );
}

/**
 * Refuses a selection that derives a Collection able to reference
 * Assets while leaving that Project's Assets collection out.
 *
 * Following such a reference is `getEntry("<alias>Assets", ref.id)`,
 * which without the collection fails while a page renders, far from
 * the config that caused it. The content model says this up front, so
 * the build says it up front too.
 */
function assertAssetsReachable(
  selected: Collection[],
  hasAssets: boolean,
  alias: string
): void {
  if (hasAssets) {
    return;
  }
  for (const collection of selected) {
    const referencing = flattenFieldDefinitions(
      collection.fieldDefinitions
    ).filter(canReferenceAssets);
    if (referencing.length > 0) {
      throw CoreError.badRequest(
        `Collection "${collection.slug.plural}" of Project "${alias}" can reference Assets through ${referencing
          .map((fieldDefinition) => `"${fieldDefinition.slug}"`)
          .join(
            ', '
          )}, but the selection leaves the Assets of "${alias}" out. Following a reference reads them, so add "${alias}" to the assets option or drop the field.`
      );
    }
  }
}

/**
 * Derives Astro content collections from the elek.io Collections the options
 * name. That object is the complete list, nothing outside it is derived, and
 * with no options at all it derives everything and warns. Keys are the alias
 * plus the plural slug in PascalCase (`websitePosts`), Assets `${alias}Assets`.
 *
 * Reads the content model from disk. Throws `Conflict` on a key two sources
 * derive, `BadRequest` on a selection naming nothing, deriving nothing, or
 * leaving out Assets a derived Collection can reference.
 *
 * @see ../../docs/usage.md
 */
export async function elekCollections<const T extends ElekConfig>(
  config: T,
  options?: ElekCollectionsOptions<T>
): Promise<Record<string, ElekCollection>> {
  assertElekConfig(config);
  const core = getCore();
  // The loaders take the alias as a literal of their own config type,
  // which the aliases of this loop are not, so they see the declared shape
  const declared: ElekConfig = config;

  const collections: Record<string, ElekCollection> = {};
  const sources = new Map<string, string>();

  const add = (key: string, source: string, collection: ElekCollection) => {
    const existing = sources.get(key);
    if (existing) {
      throw CoreError.conflict(
        `Both ${existing} and ${source} derive the collection key "${key}". Rename one of them, or drop it from elekCollections() and declare it explicitly with your own key.`
      );
    }
    sources.set(key, source);
    collections[key] = collection;
  };

  for (const [alias, declaration] of Object.entries(declared.projects)) {
    await ensureProjectAvailable(core, alias, declaration.id);

    const { list } = await core.collections.list({
      projectId: declaration.id,
      limit: 0,
    });
    // No options at all derives everything, which is the exploration
    // step. Any options object is the complete list instead.
    const selected =
      options === undefined
        ? list
        : selectCollections(
            list,
            optionFor(options.collections, alias) ?? [],
            alias
          );

    const assets =
      options === undefined ? true : optionFor(options.assets, alias);
    assertAssetsReachable(selected, assets !== undefined, alias);

    for (const collection of selected) {
      add(
        `${alias}${toPascalCase(collection.slug.plural)}`,
        `Collection "${collection.slug.plural}" of Project "${alias}"`,
        defineCollection({
          loader: elekEntriesLoader({
            config: declared,
            project: alias,
            collectionIdOrSlug: collection.id,
          }),
        })
      );
    }

    // No Collection can ever take the Assets key, "assets" is a
    // reserved slug, so this only competes with another alias
    if (assets !== undefined) {
      const dirs = assets === true ? {} : assets;
      add(
        `${alias}Assets`,
        `the Assets of Project "${alias}"`,
        defineCollection({
          loader: elekAssetsLoader({
            config: declared,
            project: alias,
            ...(dirs.imageDir ? { imageDir: dirs.imageDir } : {}),
            ...(dirs.publicDir ? { publicDir: dirs.publicDir } : {}),
          }),
        })
      );
    }
  }

  const keys = Object.keys(collections);
  if (keys.length === 0) {
    throw CoreError.badRequest(
      `elekCollections() derives no collections from this selection, so the site would read nothing. Name at least one Collection or one Project's Assets, or call elekCollections(config) to derive everything while finding your way around.`
    );
  }

  if (options === undefined) {
    core.logger.warn({
      source: 'core',
      meta: {
        'elek.collection.count': keys.length,
        'elek.project.count': Object.keys(declared.projects).length,
      },
      message: `elekCollections() derived all ${String(keys.length)} collections of ${String(Object.keys(declared.projects).length)} Project(s), because it was called without a selection. That is meant for finding your way around a Project: it reads content this site may never use, and an Assets collection copies every binary of its Project into the site on each sync. Name what the site reads before shipping, for example elekCollections(config, { collections: { ${Object.keys(declared.projects)[0] ?? 'website'}: ['posts'] }, assets: { ${Object.keys(declared.projects)[0] ?? 'website'}: true } }).`,
    });
  }

  return collections;
}
