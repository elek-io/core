import { z } from 'zod';
import { environmentSchema, versionSchema } from './baseSchema.js';

/**
 * Options that can be passed to elek.io core
 */
export const elekIoCoreOptionsSchema = z.object({
  /**
   * The environment elek.io Core is currently running in
   */
  environment: environmentSchema,
  /**
   * The current version of elek.io Core
   */
  version: versionSchema,
  file: z.object({
    json: z.object({
      /**
       * If set, adds indentation with spaces (number) or escape character (string)
       * and line break characters to saved JSON files on disk, to make them easier to read.
       * Defaults to 2 spaces of indentation.
       */
      indentation: z.union([z.number(), z.string()]),
    }),
  }),
});
export type ElekIoCoreOptions = z.infer<typeof elekIoCoreOptionsSchema>;

export const constructorElekIoCoreSchema = elekIoCoreOptionsSchema
  .omit({
    version: true,
  })
  .partial({
    environment: true,
    file: true,
  })
  .optional();
export type ConstructorElekIoCoreProps = z.infer<
  typeof constructorElekIoCoreSchema
>;
