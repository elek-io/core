import { z } from '@hono/zod-openapi';
import { logLevelSchema } from './baseSchema.js';

/**
 * Options that can be passed to elek.io core
 */
export const elekIoCoreOptionsSchema = z.object({
  log: z.object({
    /**
     * The lowest level that should be logged
     *
     * @default 'info'
     */
    level: logLevelSchema,
  }),
  file: z.object({
    /**
     * If set to true, caches files in memory to speed up access
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
  readOnly: z.boolean(),
});
export type ElekIoCoreOptions = z.infer<typeof elekIoCoreOptionsSchema>;

export const constructorElekIoCoreSchema = elekIoCoreOptionsSchema
  .partial({
    log: true,
    file: true,
    dataDir: true,
    readOnly: true,
  })
  .optional();
export type ConstructorElekIoCoreProps = z.infer<
  typeof constructorElekIoCoreSchema
>;
