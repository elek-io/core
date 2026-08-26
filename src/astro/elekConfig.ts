import { z } from '@hono/zod-openapi';
import { uuidSchema } from '../schema/baseSchema.js';
import { contentRefSchema } from '../schema/projectSchema.js';
import { CoreError } from '../util/shared.js';

/**
 * One elek.io Project a site consumes
 */
export interface ElekProjectDeclaration {
  /**
   * ID of the Project
   */
  id: string;
  /**
   * The remote repository URL to provision from
   *
   * Only the elek() integration consumes it, provisioning every
   * Project that has one. A Project that is managed locally by another
   * application, like the Desktop app, needs none and is skipped.
   */
  remoteUrl?: string;
  /**
   * The content state to read: a channel (`production`, `preview` or
   * `draft`) or an exact Release version. The ELEK_IO_CHANNEL
   * environment variable overrides this.
   *
   * @default 'production'
   */
  ref?: string;
}

export interface ElekConfig {
  /**
   * The Projects this site consumes, keyed by an alias you choose
   */
  projects: Record<string, ElekProjectDeclaration>;
}

/**
 * Aliases prefix the keys of the derived collections (`websitePosts`),
 * so they have to concatenate cleanly in camelCase
 */
const aliasPattern = /^[a-z][a-zA-Z0-9]*$/;

const elekProjectDeclarationSchema = z.strictObject({
  id: uuidSchema,
  remoteUrl: z.string().trim().min(1).optional(),
  ref: contentRefSchema.optional(),
});

const elekConfigSchema = z.strictObject({
  projects: z
    .record(z.string(), elekProjectDeclarationSchema)
    .superRefine((projects, context) => {
      const aliases = Object.keys(projects);
      if (aliases.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'Declare at least one Project',
        });
      }
      for (const alias of aliases) {
        if (aliasPattern.test(alias)) {
          continue;
        }
        context.addIssue({
          code: 'custom',
          path: [alias],
          message:
            'A Project alias must start with a lowercase letter and continue with letters or digits, because it prefixes the keys of the derived collections',
        });
      }
    }),
});

/**
 * Validates an elek config and throws a `BadRequest` naming what is
 * wrong and where
 *
 * Every entry point runs this on the config it receives, so a config
 * that skipped defineElekConfig fails the same way everywhere.
 */
export function assertElekConfig(config: ElekConfig): void {
  const parsed = elekConfigSchema.safeParse(config);
  if (parsed.success) {
    return;
  }
  throw CoreError.badRequest(
    `The elek config is invalid:\n${z.prettifyError(parsed.error)}`,
    parsed.error
  );
}

/**
 * Declares the elek.io Projects a site consumes, validating them right away.
 *
 * The returned config is the single declaration both `astro.config` and the
 * content config import, so a Project id is written once. By convention it
 * lives in `elek.config.ts`, but nothing discovers it automatically.
 *
 * Returns the very object it was given, so the alias keys survive as literal
 * types and every loader can check them at compile time.
 *
 * @see ../../docs/usage.md
 */
export function defineElekConfig<const T extends ElekConfig>(config: T): T {
  assertElekConfig(config);
  return config;
}

/**
 * Resolves an alias to its declaration, throwing a `NotFound` that
 * lists the declared aliases
 *
 * The generic loader signatures make an alias typo a compile error
 * already. This covers a config that was built by hand.
 */
export function readDeclaration(
  config: ElekConfig,
  alias: string
): ElekProjectDeclaration {
  const declaration = config.projects[alias];
  if (declaration) {
    return declaration;
  }
  throw CoreError.notFound(
    `The elek config declares no Project "${alias}". Declared aliases: ${
      Object.keys(config.projects).join(', ') || 'none'
    }`
  );
}
