import { z } from '@hono/zod-openapi';
import { logLevelSchema, versionSchema } from './baseSchema.js';

/**
 * The fully resolved option set, once the defaults and the `ELEK_IO_`
 * environment variables have been applied. Core exposes it as `core.options`.
 *
 * A constructor takes the partial `constructorElekIoCoreSchema` below instead.
 */
export const elekIoCoreOptionsSchema = z.object({
  log: z.object({
    /**
     * The lowest level that should be logged
     *
     * @default 'info'
     */
    level: logLevelSchema,
    /**
     * Whether Core registers process-level uncaught exception and
     * unhandled rejection handlers
     *
     * A host that owns its own error handling turns it off,
     * which is what the Astro entry does:
     * inside a build the host owns the process.
     *
     * @default true
     */
    hasProcessErrorHandlers: z.boolean(),
    /**
     * The version of the application logging through Core
     *
     * Written to `service.version` on a record whose `source` is not `core`,
     * so a log file says which build of the host wrote it. Without it those
     * records carry no version at all.
     *
     * @default undefined
     * @see ../../contributing/logging.md
     */
    hostVersion: versionSchema.optional(),
  }),
  file: z.object({
    /**
     * Caches parsed JSON object files in memory, never Asset binaries. The
     * map is per Core instance and unbounded, and is cleared after a git
     * operation that changes the working tree.
     *
     * So a stale read needs a writer outside this Core instance.
     *
     * @default true
     */
    cache: z.boolean(),
  }),
  /**
   * The directory Core reads and writes data in
   *
   * Overrides the ELEK_IO_DATA_DIR environment variable.
   * Relative paths are resolved against the current working directory.
   *
   * @default '~/elek.io'
   */
  dataDir: z.string().trim().min(1),
  cloud: z.object({
    /**
     * Base URL of the elek.io Cloud API
     *
     * Everything Core does over the network other than git goes here,
     * which today is sending a report. A constant would make the call
     * untestable at every layer, so it is configuration.
     *
     * Overrides the ELEK_IO_CLOUD_URL environment variable.
     * A trailing slash is dropped, since a path is appended to this.
     *
     * @default 'https://api.elek.io'
     */
    url: z.url(),
  }),
  /**
   * If set to true, Core never mutates a Project or its remote
   *
   * Every create, update, delete, synchronize and release operation
   * throws a `CoreError` of type `PreconditionFailed`. Cloning and
   * fetching work without a User being set.
   *
   * Overrides the ELEK_IO_READ_ONLY environment variable.
   *
   * @default false
   */
  isReadOnly: z.boolean(),
});
export type ElekIoCoreOptions = z.infer<typeof elekIoCoreOptionsSchema>;

export const constructorElekIoCoreSchema = elekIoCoreOptionsSchema
  // `log` holds more than one setting, so its keys are individually
  // optional. Without this, opting out of the process error handlers
  // would force a caller to pin the level too, and the Astro entry
  // deliberately leaves the level to ELEK_IO_LOG_LEVEL.
  .extend({ log: elekIoCoreOptionsSchema.shape.log.partial() })
  .partial({
    log: true,
    file: true,
    cloud: true,
    dataDir: true,
    isReadOnly: true,
  })
  .optional();
export type ConstructorElekIoCoreProps = z.infer<
  typeof constructorElekIoCoreSchema
>;
