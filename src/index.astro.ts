import type { AstroIntegration } from 'astro';
import ElekIoCore, {
  CoreError,
  type ConstructorElekIoCoreProps,
} from './index.node.js';
import { resolveContentRef } from './util/node.js';
import { assertElekConfig, type ElekConfig } from './astro/elekConfig.js';

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

export {
  elekAssetsLoader,
  elekEntriesLoader,
  type ElekAssetsLoaderProps,
  type ElekEntriesLoaderProps,
} from './astro/loaders.js';

export {
  elekCollections,
  type ElekAssetsOption,
  type ElekCollectionsOptions,
} from './astro/collections.js';

// Re-export `z` here too so it is available from the @elek-io/core/astro entry.
// See the note in schema/index.ts. zod is a required peer dependency.
export { z } from '@hono/zod-openapi';

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
