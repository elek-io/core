import type { AstroIntegration } from 'astro';
import type { Loader } from 'astro/loaders';
import Path from 'node:path';
import Fs from 'fs-extra';
import ElekIoCore, {
  assetSchema,
  CoreError,
  flattenFieldDefinitions,
  type ConstructorElekIoCoreProps,
} from './index.node.js';
import { resolveContentRef } from './util/node.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
} from './astro/schema.js';
import { transformEntryValues } from './astro/transform.js';
import {
  assertElekConfig,
  readDeclaration,
  type ElekConfig,
} from './astro/elekConfig.js';
import { toPascalCase } from './cli/util.js';

export {
  mdastRender,
  astroDefaults,
  type MdastAstroRenderers,
} from './astro/mdastRender.js';

export {
  defineElekConfig,
  type ElekConfig,
  type ElekProjectDeclaration,
} from './astro/elekConfig.js';

// Re-export `z` here too so it is available from the @elek-io/core/astro entry.
// See the note in schema/index.ts. zod is a required peer dependency.
export { z } from '@hono/zod-openapi';

interface ElekAssetsLoaderProps<T extends ElekConfig> {
  /** The elek config, also imported by astro.config */
  config: T;
  /** Alias of the Project in config.projects */
  project: keyof T['projects'] & string;
  outDir: string;
}

interface ElekEntriesLoaderProps<T extends ElekConfig> {
  /** The elek config, also imported by astro.config */
  config: T;
  /** Alias of the Project in config.projects */
  project: keyof T['projects'] & string;
  /** Collection UUID or slug */
  collectionIdOrSlug: string;
}

/**
 * Lazily-created, process-wide ElekIoCore. Created on first loader use so that
 * importing @elek-io/core/astro has no side effects. Configured through the
 * ELEK_IO_* environment variables, which are read once here.
 */
let coreInstance: ElekIoCore | undefined;
function getCore(): ElekIoCore {
  if (!coreInstance) {
    coreInstance = new ElekIoCore({ log: { level: 'info' } });
  }
  return coreInstance;
}

/**
 * Throws a typed, actionable error when the Project is not in the
 * data directory, which on a CI runner usually means the elek()
 * integration is missing from astro.config
 */
async function ensureProjectAvailable(
  core: ElekIoCore,
  alias: string,
  projectId: string
): Promise<void> {
  if (await Fs.pathExists(core.util.pathTo.project(projectId))) {
    return;
  }
  throw CoreError.notFound(
    `Project "${alias}" (${projectId}) was not found in the data directory "${core.options.dataDir}". Add the elek() integration to astro.config to provision it from its remote, or point ELEK_IO_DATA_DIR at the directory holding the Project. See the provisioning guide in the docs of @elek-io/core.`
  );
}

/**
 * Logs which content state a loader is about to read, so every build
 * states its source and ref
 */
async function logReadingProject(
  core: ElekIoCore,
  projectId: string,
  log: (message: string) => void
): Promise<void> {
  const project = await core.projects.read({ id: projectId });
  const branch = await core.projects.branches.current({ id: projectId });
  const source = branch === 'work' ? 'draft' : branch || 'Release tag';
  log(
    `Reading Project "${project.name}" version ${project.version} (${source}) from "${core.options.dataDir}"`
  );
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
 *     loader: elekAssetsLoader({
 *       config,
 *       project: 'website',
 *       outDir: './src/content/assets',
 *     }),
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
      context.logger.info(
        `Loading elek.io Assets of Project "${alias}", saving to "${props.outDir}"`
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

interface ElekIntegrationProps {
  /**
   * The elek config, also imported by the content config
   */
  config: ElekConfig;
  /**
   * Options for the short-lived Core the integration provisions with.
   * Prefer the ELEK_IO_* environment variables, which also reach the
   * loaders' own Core instance.
   */
  core?: ConstructorElekIoCoreProps;
}

/**
 * Astro integration that provisions every Project of the elek config
 * from its remote before Astro's content sync runs, so the loaders
 * find them in the data directory - also on CI runners that start
 * with an empty one.
 *
 * Every declared Project needs a `remoteUrl`, there is nothing to
 * provision from without one.
 *
 * Runs on its own short-lived read-only Core, so no User is required
 * and nothing is ever mutated. A locally existing Project managed by
 * another application (e.g. the Desktop app) is left untouched, so
 * local development keeps reading the live working copy. Private
 * remotes authenticate through the ELEK_IO_REMOTE_ACCESS_TOKEN environment variable.
 *
 * @example
 * ```js
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config';
 * import { elek } from '@elek-io/core/astro';
 * import { config } from './elek.config';
 *
 * export default defineConfig({
 *   integrations: [elek({ config })],
 * });
 * ```
 */
export function elek(props: ElekIntegrationProps): AstroIntegration {
  assertElekConfig(props.config);

  // Resolved before the hook runs, so a Project without a remote fails
  // while astro.config is read instead of midway through a build
  const projects = Object.entries(props.config.projects).map(
    ([alias, declaration]) => {
      if (!declaration.remoteUrl) {
        throw CoreError.badRequest(
          `Project "${alias}" has no remoteUrl, which elek() needs to provision it. Add one to the declaration, or drop the Project from the config when it only ever comes from the local data directory.`
        );
      }
      return { alias, ...declaration, remoteUrl: declaration.remoteUrl };
    }
  );

  return {
    name: 'elek',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        // An own short-lived Core, disposed after provisioning: the
        // loaders' shared instance lives in another module graph and
        // both coordinate through the data directory and env vars only
        const core = new ElekIoCore({ ...props.core, isReadOnly: true });
        try {
          for (const project of projects) {
            const ref = resolveContentRef(project.ref);
            logger.info(
              `Provisioning "${project.alias}" (Project ${project.id}) at "${ref}" from "${project.remoteUrl}"`
            );
            const result = await core.projects.provision({
              id: project.id,
              url: project.remoteUrl,
              ref,
            });
            if (result.warning) {
              logger.warn(result.warning);
            }
            const source =
              result.source === 'remote' ? '' : ` (${result.source})`;
            logger.info(
              `Provisioned "${project.alias}": Project "${result.project.name}" (${result.project.id}) at version ${result.project.version}${source}`
            );
          }
        } finally {
          await core.dispose();
        }
      },
    },
  };
}
