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
import { toPascalCase } from './cli/util.js';

export {
  mdastRender,
  astroDefaults,
  type MdastAstroRenderers,
} from './astro/mdastRender.js';

// Re-export `z` here too so it is available from the @elek-io/core/astro entry.
// See the note in schema/index.ts. zod is a required peer dependency.
export { z } from '@hono/zod-openapi';

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
 * Throws a typed, actionable error when the Project is not in the
 * data directory, which on a CI runner usually means the elek()
 * integration is missing from astro.config
 */
async function ensureProjectAvailable(
  core: ElekIoCore,
  projectId: string
): Promise<void> {
  if (await Fs.pathExists(core.util.pathTo.project(projectId))) {
    return;
  }
  throw CoreError.notFound(
    `Project "${projectId}" was not found in the data directory "${core.options.dataDir}". Add the elek() integration to astro.config to provision it from its remote, or point ELEK_IO_DATA_DIR at the directory holding the Project. See the ci-builds guide in the docs of @elek-io/core.`
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
  log(
    `Reading Project "${project.name}" version ${project.version} (${
      branch || 'pinned Release'
    }) from "${core.options.dataDir}"`
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
      await ensureProjectAvailable(core, props.projectId);
      await logReadingProject(core, props.projectId, (message) =>
        context.logger.info(message)
      );
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
      await ensureProjectAvailable(core, props.projectId);
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
      await ensureProjectAvailable(core, props.projectId);
      await logReadingProject(core, props.projectId, (message) =>
        context.logger.info(message)
      );
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

interface ElekProjectProps {
  /**
   * ID of the Project to provision
   */
  id: string;
  /**
   * The remote repository URL to provision from
   */
  remoteUrl: string;
  /**
   * The content state to provision: `production`, `work` or a Release
   * version. The ELEK_IO_REF environment variable overrides this.
   *
   * @default 'production'
   */
  ref?: string;
}

interface ElekIntegrationProps {
  /**
   * The Projects this site consumes
   */
  projects: ElekProjectProps[];
  /**
   * Options for the short-lived Core the integration provisions with.
   * Prefer the ELEK_IO_* environment variables, which also reach the
   * loaders' own Core instance.
   */
  core?: ConstructorElekIoCoreProps;
}

/**
 * Astro integration that provisions the declared Projects from their
 * remotes before Astro's content sync runs, so the elekAssets and
 * elekEntries loaders find them in the data directory - also on CI
 * runners that start with an empty one.
 *
 * Runs on its own short-lived read-only Core, so no User is required
 * and nothing is ever mutated. A locally existing Project managed by
 * another application (e.g. the Desktop app) is left untouched, so
 * local development keeps reading the live working copy. Private
 * remotes authenticate through the ELEK_IO_TOKEN environment variable.
 *
 * @example
 * ```js
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config';
 * import { elek } from '@elek-io/core/astro';
 *
 * export default defineConfig({
 *   integrations: [
 *     elek({
 *       projects: [
 *         {
 *           id: 'abc-123-...',
 *           remoteUrl: 'https://github.com/acme/website-content.git',
 *         },
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function elek(props: ElekIntegrationProps): AstroIntegration {
  return {
    name: 'elek',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        // An own short-lived Core, disposed after provisioning: the
        // loaders' shared instance lives in another module graph and
        // both coordinate through the data directory and env vars only
        const core = new ElekIoCore({ ...props.core, readOnly: true });
        try {
          for (const project of props.projects) {
            const ref = resolveContentRef(project.ref);
            logger.info(
              `Provisioning Project "${project.id}" at "${ref}" from "${project.remoteUrl}"`
            );
            const ensured = await core.projects.ensureFromRemote({
              id: project.id,
              url: project.remoteUrl,
              ref,
            });
            logger.info(
              `Project "${ensured.name}" (${ensured.id}) is available at version ${ensured.version}`
            );
          }
        } finally {
          await core.dispose();
        }
      },
    },
  };
}
