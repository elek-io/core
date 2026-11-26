import { z } from '@hono/zod-openapi';
import {
  supportedLanguageSchema,
  uuidSchema,
  versionSchema,
  objectTypeSchema,
} from './baseSchema.js';
import { collectionFileSchema } from './collectionSchema.js';
import { componentFileSchema } from './componentSchema.js';
import { baseFileSchema } from './fileSchema.js';

/**
 * The name a Contract is known by, in the shape of a package name, so two
 * Projects on the same theme agree on what it is called.
 */
export const contractNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/,
    'String must be a name of lowercase words, digits, dots, dashes and underscores, optionally scoped as "@scope/name"'
  );
export type ContractName = z.infer<typeof contractNameSchema>;

/**
 * The languages a Contract serves: the listed ones, or `any` for a theme
 * that renders whatever the Project holds.
 */
export const contractLanguagesSchema = z.union([
  z.literal('any'),
  z.array(supportedLanguageSchema).nonempty(),
]);
export type ContractLanguages = z.infer<typeof contractLanguagesSchema>;

/**
 * What a theme states it needs, as Collections and Components in Core's own
 * schemas. This is the `elek.contract.json` of a theme's repository, and the
 * copy a Project keeps per version in use.
 */
export const contractSchema = z.object({
  name: contractNameSchema,
  version: versionSchema,
  languages: contractLanguagesSchema,
  collections: z.array(collectionFileSchema),
  components: z.array(componentFileSchema),
});
export type Contract = z.infer<typeof contractSchema>;

/** The name of a theme's Contract inside its repository */
export const CONTRACT_FILE_NAME = 'elek.contract.json';

/**
 * Where a Contract comes from. A git address is the only origin Core reads,
 * and a kind added later only adds a member here.
 */
export const contractOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('git'), url: z.string().trim().min(1) }),
]);
export type ContractOrigin = z.infer<typeof contractOriginSchema>;

/**
 * `contracts/<id>/contract.json`, which names the Contract and where it comes
 * from. The Project keeps one per Contract, whatever uses it, and a copy of
 * every version in use sits beside it as `<version>.json`.
 */
export const contractFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.contract).readonly(),
  name: contractNameSchema,
  origin: contractOriginSchema,
});
export type ContractFile = z.infer<typeof contractFileSchema>;

/**
 * `contracts/<id>/<version>.json`, one copy of the Contract at one version,
 * with the commit of its origin it was read from.
 */
export const contractVersionFileSchema = z.object({
  version: versionSchema,
  commit: z.string().trim().min(1),
  contract: contractSchema,
});
export type ContractVersionFile = z.infer<typeof contractVersionFileSchema>;

/** A Contract the Project keeps, with the versions it holds a copy of */
export const keptContractSchema = contractFileSchema.extend({
  versions: z.array(versionSchema),
});
export type KeptContract = z.infer<typeof keptContractSchema>;

export const contractFromProjectSchema = z.object({
  projectId: uuidSchema.readonly(),
  name: contractNameSchema,
  version: versionSchema,
  languages: contractLanguagesSchema.optional(),
});
export type ContractFromProjectProps = z.infer<
  typeof contractFromProjectSchema
>;

export const readThemeContractSchema = z.object({
  url: z.string().trim().min(1),
  version: versionSchema.optional(),
});
export type ReadThemeContractProps = z.infer<typeof readThemeContractSchema>;

export const themeVersionsSchema = readThemeContractSchema.omit({
  version: true,
});
export type ThemeVersionsProps = z.infer<typeof themeVersionsSchema>;

/** A Contract read from a theme, with the version and commit it came from */
export const themeContractSchema = z.object({
  contract: contractSchema,
  version: versionSchema,
  commit: z.string(),
});
export type ThemeContract = z.infer<typeof themeContractSchema>;

export const createContractSchema = z.object({
  projectId: uuidSchema.readonly(),
  origin: contractOriginSchema,
  contract: contractSchema,
  commit: z.string().trim().min(1),
});
export type CreateContractProps = z.infer<typeof createContractSchema>;

export const readContractSchema = z.object({
  projectId: uuidSchema.readonly(),
  id: uuidSchema.readonly(),
});
export type ReadContractProps = z.infer<typeof readContractSchema>;

export const readContractVersionSchema = readContractSchema.extend({
  version: versionSchema,
});
export type ReadContractVersionProps = z.infer<
  typeof readContractVersionSchema
>;

export const listContractsSchema = z.object({
  projectId: uuidSchema.readonly(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type ListContractsProps = z.infer<typeof listContractsSchema>;

export const countContractsSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type CountContractsProps = z.infer<typeof countContractsSchema>;
