import type { Loader } from 'astro/loaders';
import Path from 'node:path';
import Url from 'node:url';
import Fs from 'fs-extra';
import { assetSchema, flattenFieldDefinitions } from '../index.node.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
} from './schema.js';
import { transformEntryValues } from './transform.js';
import {
  assertElekConfig,
  readDeclaration,
  type ElekConfig,
} from './elekConfig.js';
import { getCore, ensureProjectAvailable, logReadingProject } from './core.js';
import { toPascalCase } from '../cli/util.js';

export interface ElekAssetsLoaderProps<T extends ElekConfig> {
  /** The elek config, also imported by astro.config */
  config: T;
  /** Alias of the Project in config.projects */
  project: keyof T['projects'] & string;
  /**
   * Where the Asset binaries are saved. A relative path resolves
   * against the Astro project root.
   *
   * @default 'src/content/elek/<alias>/assets'
   */
  outDir?: string;
}

export interface ElekEntriesLoaderProps<T extends ElekConfig> {
  /** The elek config, also imported by astro.config */
  config: T;
  /** Alias of the Project in config.projects */
  project: keyof T['projects'] & string;
  /** Collection UUID or slug */
  collectionIdOrSlug: string;
}

/**
 * Where a Project saves its Asset binaries when the loader is left to
 * decide. Below `src/` so `astro:assets` can pick them up, and per
 * alias so two Projects never write into the same directory.
 */
export function defaultAssetsOutDir(alias: string): string {
  return Path.join('src', 'content', 'elek', alias, 'assets');
}

/**
 * Astro content loader for elek.io Assets.
 *
 * Reads and saves Assets from a Project and exposes them through
 * Astro's content collection system.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { elekAssetsLoader } from '@elek-io/core/astro';
 * import { config } from '../elek.config';
 *
 * export const collections = {
 *   assets: defineCollection({
 *     loader: elekAssetsLoader({ config, project: 'website' }),
 *   });
 * };
 * ```
 */
export function elekAssetsLoader<const T extends ElekConfig>(
  props: ElekAssetsLoaderProps<T>
): Loader {
  assertElekConfig(props.config);
  const alias = props.project;
  const { id: projectId } = readDeclaration(props.config, alias);

  return {
    name: 'elek-assets',
    schema: assetSchema,
    load: async (context) => {
      const core = getCore();
      await ensureProjectAvailable(core, alias, projectId);
      await logReadingProject(core, projectId, (message) =>
        context.logger.info(message)
      );

      // Relative paths belong to the Astro project, not to whatever
      // directory the build was started from
      const outDir = Path.resolve(
        Url.fileURLToPath(context.config.root),
        props.outDir ?? defaultAssetsOutDir(alias)
      );
      context.logger.info(
        `Loading elek.io Assets of Project "${alias}", saving to "${outDir}"`
      );

      const { list: assets, total } = await core.assets.list({
        projectId,
        limit: 0,
      });
      if (total === 0) {
        context.logger.warn('No Assets found');
      } else {
        context.logger.info(`Found ${total} Assets`);
      }

      const seen = new Set<string>();
      for (const asset of assets) {
        seen.add(asset.id);
        const absoluteAssetFilePath = Path.join(
          outDir,
          `${asset.id}.${asset.extension}`
        );
        const data = { ...asset, absolutePath: absoluteAssetFilePath };
        const digest = context.generateDigest(data);

        // Skip unchanged Assets, but only when the file is still on disk -
        // outDir may have been cleaned since the digest was last stored.
        const existing = context.store.get(asset.id);
        if (
          existing?.digest === digest &&
          (await Fs.pathExists(absoluteAssetFilePath))
        ) {
          continue;
        }

        await Fs.ensureDir(Path.dirname(absoluteAssetFilePath));
        await core.assets.save({
          projectId,
          id: asset.id,
          filePath: absoluteAssetFilePath,
        });

        const parsed = await context.parseData({ id: asset.id, data });
        context.store.set({ id: asset.id, data: parsed, digest });
      }

      // Remove store entries for Assets that no longer exist in the Project.
      for (const id of [...context.store.keys()]) {
        if (!seen.has(id)) context.store.delete(id);
      }

      context.logger.info('Finished loading Assets');
    },
  };
}

/**
 * Astro content loader for elek.io Collection Entries.
 *
 * Reads all Entries from a Collection and exposes them through
 * Astro's content collection system.
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { elekEntriesLoader } from '@elek-io/core/astro';
 * import { config } from '../elek.config';
 *
 * export const collections = {
 *   posts: defineCollection({
 *     loader: elekEntriesLoader({
 *       config,
 *       project: 'website',
 *       collectionIdOrSlug: 'posts',
 *     }),
 *   });
 * };
 * ```
 */
export function elekEntriesLoader<const T extends ElekConfig>(
  props: ElekEntriesLoaderProps<T>
): Loader {
  assertElekConfig(props.config);
  const alias = props.project;
  const { id: projectId } = readDeclaration(props.config, alias);

  return {
    name: 'elek-entries',
    createSchema: async () => {
      const core = getCore();
      await ensureProjectAvailable(core, alias, projectId);
      const resolvedId = await core.collections.resolveCollectionId({
        projectId,
        idOrSlug: props.collectionIdOrSlug,
      });
      const collection = await core.collections.read({
        projectId,
        id: resolvedId,
      });
      const project = await core.projects.read({ id: projectId });
      const languages = project.settings.language.supported;
      const { list: components } = await core.components.list({
        projectId,
        limit: 0,
      });

      return {
        schema: buildEntryValuesSchema(
          flattenFieldDefinitions(collection.fieldDefinitions),
          languages,
          components
        ),
        types: buildEntryValuesTypeString(
          flattenFieldDefinitions(collection.fieldDefinitions),
          languages,
          components,
          toPascalCase(collection.slug.plural)
        ),
      };
    },
    load: async (context) => {
      const core = getCore();
      await ensureProjectAvailable(core, alias, projectId);
      await logReadingProject(core, projectId, (message) =>
        context.logger.info(message)
      );
      const resolvedCollectionId = await core.collections.resolveCollectionId({
        projectId,
        idOrSlug: props.collectionIdOrSlug,
      });
      context.logger.info(
        `Loading elek.io Entries of Collection "${props.collectionIdOrSlug}" of Project "${alias}"`
      );

      const { list: entries, total } = await core.entries.list({
        projectId,
        collectionId: resolvedCollectionId,
        limit: 0,
      });
      if (total === 0) {
        context.logger.warn('No Entries found');
      } else {
        context.logger.info(`Found ${total} Entries`);
      }

      const seen = new Set<string>();
      for (const entry of entries) {
        seen.add(entry.id);
        const values = transformEntryValues(entry.values);
        const digest = context.generateDigest(values);

        // Skip re-validating Entries whose data has not changed.
        const existing = context.store.get(entry.id);
        if (existing?.digest === digest) continue;

        const parsed = await context.parseData({ id: entry.id, data: values });
        context.store.set({ id: entry.id, data: parsed, digest });
      }

      // Remove store entries for Entries that no longer exist in the Collection.
      for (const id of [...context.store.keys()]) {
        if (!seen.has(id)) context.store.delete(id);
      }

      context.logger.info('Finished loading Entries');
    },
  };
}
