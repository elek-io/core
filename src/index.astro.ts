import type { Loader } from 'astro/loaders';
import Path from 'node:path';
import Fs from 'fs-extra';
import ElekIoCore, {
  assetSchema,
  flattenFieldDefinitions,
  type ConstructorElekIoCoreProps,
} from './index.node.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
} from './astro/schema.js';
import { transformEntryValues } from './astro/transform.js';
import { toPascalCase } from './cli/util.js';

export {
  mdastRender,
  astroDefaults,
  type MdastAstroRenderers,
} from './astro/mdastRender.js';

interface ElekAssetsProps {
  projectId: string;
  outDir: string;
  /**
   * Options for the shared ElekIoCore instance. Core is created once on first
   * loader use, so the first loader to run wins and later options are ignored.
   */
  core?: ConstructorElekIoCoreProps;
}

interface ElekEntriesOptions {
  projectId: string;
  /** Collection UUID or slug */
  collectionIdOrSlug: string;
  /**
   * Options for the shared ElekIoCore instance. Core is created once on first
   * loader use, so the first loader to run wins and later options are ignored.
   */
  core?: ConstructorElekIoCoreProps;
}

/**
 * Lazily-created, process-wide ElekIoCore. Created on first loader use so that
 * importing @elek-io/core/astro has no side effects. The first loader to
 * initialize it wins.
 */
let coreInstance: ElekIoCore | undefined;
function getCore(options?: ConstructorElekIoCoreProps): ElekIoCore {
  if (!coreInstance) {
    coreInstance = new ElekIoCore(options ?? { log: { level: 'info' } });
  }
  return coreInstance;
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
 * import { elekAssets } from '@elek-io/core/astro';
 *
 * export const collections = {
 *   assets: defineCollection({
 *     loader: elekAssets({
 *       projectId: 'abc-123-...',
 *       outDir: './content/assets',
 *     }),
 *   });
 * };
 * ```
 */
export function elekAssets(props: ElekAssetsProps): Loader {
  return {
    name: 'elek-assets',
    schema: assetSchema,
    load: async (context) => {
      const core = getCore(props.core);
      context.logger.info(
        `Loading elek.io Assets for Project "${props.projectId}", saving to "${props.outDir}"`
      );

      const { list: assets, total } = await core.assets.list({
        projectId: props.projectId,
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
        const absoluteAssetFilePath = Path.resolve(
          Path.join(props.outDir, `${asset.id}.${asset.extension}`)
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
          projectId: props.projectId,
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
 * import { elekEntries } from '@elek-io/core/astro';
 *
 * export const collections = {
 *   entries: defineCollection({
 *     loader: elekEntries({
 *       projectId: 'abc-123-...',
 *       collectionIdOrSlug: 'blog-posts',
 *     }),
 *   });
 * };
 * ```
 */
export function elekEntries(props: ElekEntriesOptions): Loader {
  return {
    name: 'elek-entries',
    createSchema: async () => {
      const core = getCore(props.core);
      const resolvedId = await core.collections.resolveCollectionId({
        projectId: props.projectId,
        idOrSlug: props.collectionIdOrSlug,
      });
      const collection = await core.collections.read({
        projectId: props.projectId,
        id: resolvedId,
      });
      const project = await core.projects.read({ id: props.projectId });
      const languages = project.settings.language.supported;
      const { list: components } = await core.components.list({
        projectId: props.projectId,
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
      const core = getCore(props.core);
      const resolvedCollectionId = await core.collections.resolveCollectionId({
        projectId: props.projectId,
        idOrSlug: props.collectionIdOrSlug,
      });
      context.logger.info(
        `Loading elek.io Entries of Collection "${props.collectionIdOrSlug}" and Project "${props.projectId}"`
      );

      const { list: entries, total } = await core.entries.list({
        projectId: props.projectId,
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
