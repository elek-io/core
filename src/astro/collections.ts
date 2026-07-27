import { defineCollection } from 'astro/content/config';
import { CoreError } from '../util/shared.js';
import { toPascalCase } from '../cli/util.js';
import { assertElekConfig, type ElekConfig } from './elekConfig.js';
import { elekAssetsLoader, elekEntriesLoader } from './loaders.js';
import { getCore, ensureProjectAvailable } from './core.js';

type ElekCollection = ReturnType<typeof defineCollection>;

/**
 * What to do with the Assets collection of one Project: drop it, or
 * keep it and say where its binaries are saved
 */
export type ElekAssetsOption = false | { outDir?: string };

export interface ElekCollectionsOptions<T extends ElekConfig> {
  /**
   * The Assets collection per Project, included by default.
   *
   * `false` drops it for every Project, an object drops or configures
   * it per alias.
   */
  assets?:
    | false
    | { [Alias in keyof T['projects'] & string]?: ElekAssetsOption };
}

/**
 * Reads the Assets option that applies to one alias
 */
function assetsOptionFor<T extends ElekConfig>(
  options: ElekCollectionsOptions<T> | undefined,
  alias: string
): ElekAssetsOption {
  const assets = options?.assets;
  if (assets === false) {
    return false;
  }
  if (assets === undefined) {
    return {};
  }
  const perAlias = Object.entries(assets).find(([key]) => key === alias)?.[1];
  return perAlias ?? {};
}

/**
 * Derives an Astro content collection for every elek.io Collection of
 * every Project the config declares, plus one Assets collection per
 * Project.
 *
 * Keys are the Project alias followed by the Collection's plural slug
 * in PascalCase (`websitePosts`), always prefixed, also when a single
 * Project is declared. The Assets collection of a Project is
 * `${alias}Assets`.
 *
 * Reads the content model from disk, so the Projects have to be in the
 * data directory already. In a build that is what the elek()
 * integration takes care of, it runs before the content config loads.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { elekCollections } from '@elek-io/core/astro';
 * import { config } from '../elek.config';
 *
 * export const collections = {
 *   ...(await elekCollections(config)),
 * };
 * ```
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
    for (const collection of list) {
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
    const assets = assetsOptionFor(options, alias);
    if (assets !== false) {
      add(
        `${alias}Assets`,
        `the Assets of Project "${alias}"`,
        defineCollection({
          loader: elekAssetsLoader({
            config: declared,
            project: alias,
            ...(assets.outDir ? { outDir: assets.outDir } : {}),
          }),
        })
      );
    }
  }

  return collections;
}
