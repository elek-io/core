import type { Loader } from 'astro/loaders';
import Path from 'node:path';
import Fs from 'fs-extra';
import ElekIoCore, {
  assetSchema,
  flattenFieldDefinitions,
} from './index.node.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
} from './astro/schema.js';
import { transformEntryValues } from './astro/transform.js';

interface ElekAssetsProps {
  projectId: string;
  outDir: string;
}

interface ElekEntriesOptions {
  projectId: string;
  /** Collection UUID or slug */
  collectionIdOrSlug: string;
}

const core = new ElekIoCore({
  log: { level: 'info' },
});

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
      context.logger.info(
        `Loading elek.io Assets for Project "${props.projectId}", saving to "${props.outDir}"`
      );
      context.store.clear();

      const { list: assets, total } = await core.assets.list({
        projectId: props.projectId,
        limit: 0,
      });
      if (total === 0) {
        context.logger.warn('No Assets found');
      } else {
        context.logger.info(`Found ${total} Assets`);
      }

      for (const asset of assets) {
        const absoluteAssetFilePath = Path.resolve(
          Path.join(props.outDir, `${asset.id}.${asset.extension}`)
        );
        await Fs.ensureDir(Path.dirname(absoluteAssetFilePath));
        await core.assets.save({
          projectId: props.projectId,
          id: asset.id,
          filePath: absoluteAssetFilePath,
        });

        const parsed = await context.parseData({
          id: asset.id,
          data: {
            ...asset,
            absolutePath: absoluteAssetFilePath,
          },
        });
        context.store.set({ id: asset.id, data: parsed });
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
      const resolvedId = await core.collections.resolveCollectionId({
        projectId: props.projectId,
        idOrSlug: props.collectionIdOrSlug,
      });
      const collection = await core.collections.read({
        projectId: props.projectId,
        id: resolvedId,
      });

      return {
        schema: buildEntryValuesSchema(
          flattenFieldDefinitions(collection.fieldDefinitions)
        ),
        types: buildEntryValuesTypeString(
          flattenFieldDefinitions(collection.fieldDefinitions)
        ),
      };
    },
    load: async (context) => {
      const resolvedCollectionId = await core.collections.resolveCollectionId({
        projectId: props.projectId,
        idOrSlug: props.collectionIdOrSlug,
      });
      context.logger.info(
        `Loading elek.io Entries of Collection "${props.collectionIdOrSlug}" and Project "${props.projectId}"`
      );
      context.store.clear();

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

      for (const entry of entries) {
        const values = transformEntryValues(entry.values);

        const parsed = await context.parseData({ id: entry.id, data: values });
        context.store.set({ id: entry.id, data: parsed });
      }

      context.logger.info('Finished loading Entries');
    },
  };
}
