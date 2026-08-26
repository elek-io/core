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

export {
  elekSlugPaths,
  type ElekRoutableEntry,
  type ElekSlugPath,
  type ElekSlugPathsProps,
} from './astro/slugPaths.js';

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
 * Astro integration that provisions every Project of the elek config from its
 * remote before Astro's content sync runs, so the loaders find them in the
 * data directory, also on CI runners that start with an empty one.
 *
 * A Project declared without a `remoteUrl` is skipped and left to the loaders,
 * and a config in which no Project has one fails. Runs on its own short-lived
 * read-only Core, so no User is required and nothing is ever mutated.
 *
 * @see ../docs/provisioning.md
 */
export function elek(props: ElekIntegrationProps): AstroIntegration {
  assertElekConfig(props.config);

  // Resolved before the hook runs, so a config the integration cannot
  // act on fails while astro.config is read instead of midway through a
  // build. A declaration without a remoteUrl is a Project that only
  // ever comes from the local data directory, which the loaders read on
  // their own, so it is skipped rather than rejected.
  const declarations = Object.entries(props.config.projects);
  const projects = declarations.flatMap(([alias, declaration]) =>
    declaration.remoteUrl
      ? [{ alias, ...declaration, remoteUrl: declaration.remoteUrl }]
      : []
  );
  const localOnly = declarations
    .filter(([, declaration]) => !declaration.remoteUrl)
    .map(([alias]) => alias);

  if (projects.length === 0) {
    throw CoreError.badRequest(
      `No declared Project has a remoteUrl, so elek() has nothing to provision: ${localOnly.join(
        ', '
      )}. Add one to the Project the build should fetch from its remote, or drop the integration when every Project comes from the local data directory.`
    );
  }

  return {
    name: 'elek',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        if (localOnly.length > 0) {
          logger.info(
            `Skipping "${localOnly.join(
              '", "'
            )}", declared without a remoteUrl and read from the local data directory`
          );
        }

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
