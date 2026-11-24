import { z } from '@hono/zod-openapi';
import { uuidSchema } from '../schema/baseSchema.js';
import { contractSchema } from '../schema/contractSchema.js';
import { contentRefSchema } from '../schema/projectSchema.js';
import { CoreError } from '../util/shared.js';

/**
 * One elek.io Project a site consumes
 */
export interface ElekProjectDeclaration {
  /**
   * The Project's own UUID, the one elek.io Desktop shows. Validated as a
   * UUID when the config is declared rather than when a loader runs.
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
   * What `elek()` provisions: a channel (`release`, `preview` or `draft`)
   * or an exact Release version. Nothing else reads it, so on a Project
   * declared without a `remoteUrl` it has no effect and the loaders read
   * whatever the data directory already holds.
   *
   * The ELEK_IO_CHANNEL environment variable overrides it with a channel
   * only, so an exact Release version there throws `BadRequest`.
   *
   * @default 'release'
   */
  ref?: string;
  /**
   * The Destination of this Project the site builds on, by its own name or
   * its id, which makes the site read the Project's Entries in the shape of
   * the site's own Contract rather than in the Project's.
   *
   * Needs `contract` on the config beside it. Left out, the site reads the
   * Project's own Collections, which is what it did before Contracts.
   */
  destination?: string;
}

export interface ElekConfig {
  /**
   * The Projects this site consumes, keyed by an alias you choose.
   *
   * An alias has to match `^[a-z][a-zA-Z0-9]*$`, because it is concatenated
   * into every derived collection key. `my-site` fails the config with a
   * `BadRequest` rather than producing an unusable key at sync time.
   */
  projects: Record<string, ElekProjectDeclaration>;
  /**
   * This site's own Contract, imported from the `elek.contract.json` beside
   * the config rather than discovered, and read by every Project declared
   * with a `destination`.
   *
   * Typed as data because TypeScript types a JSON import from its file. The
   * config validates it against Core's own schema instead, so a file that is
   * no Contract fails where you declared it.
   */
  contract?: unknown;
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
  destination: z.string().trim().min(1).optional(),
});

const elekConfigSchema = z
  .strictObject({
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
    contract: contractSchema.optional(),
  })
  // A site reads its Entries through a Destination and its own Contract
  // together, so one without the other is a half-wired site rather than a
  // default. Both halves say so where they were written.
  .superRefine((config, context) => {
    const named = Object.entries(config.projects).filter(([, declaration]) => {
      return declaration.destination !== undefined;
    });
    if (named.length > 0 && config.contract === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['contract'],
        message: `Project "${named[0]?.[0] ?? ''}" names a Destination, so add this site's own elek.contract.json as "contract"`,
      });
    }
    if (named.length === 0 && config.contract !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['contract'],
        message:
          'No declared Project names a Destination, so nothing reads this Contract. Add "destination" to the Project the site builds on, or drop the Contract',
      });
    }
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
