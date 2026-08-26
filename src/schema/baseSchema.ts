import { z } from '@hono/zod-openapi';

/**
 * All currently supported, BCP 47 compliant language tags
 */
export const supportedLanguageSchema = z.enum([
  'bg', // Bulgarian
  'cs', // Czech
  'da', // Danish
  'de', // German
  'el', // Greek
  'en', // English
  'es', // Spanish
  'et', // Estonian
  'fi', // Finnish
  'fr', // French
  'hu', // Hungarian
  'it', // Italian
  'ja', // Japanese
  'lt', // Lithuanian
  'lv', // Latvian
  'nl', // Dutch
  'pl', // Polish
  'pt', // Portuguese
  'ro', // Romanian
  'ru', // Russian
  'sk', // Slovak
  'sl', // Slovenian
  'sv', // Swedish
  'zh', // Chinese
]);
export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;

export const supportedIconSchema = z.enum(['home', 'plus']);
export type SupportedIcon = z.infer<typeof supportedIconSchema>;

export const objectTypeSchema = z.enum([
  'project',
  'asset',
  'collection',
  'component',
  'entry',
  'value',
]);
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const versionSchema = z
  .string()
  .refine(
    (version) => /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(version),
    'String must follow the Semantic Versioning format (https://semver.org/)'
  );
export type Version = z.infer<typeof versionSchema>;

export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/**
 * A record keyed by every language Core supports, the 24 of
 * `supportedLanguageSchema`, with every key optional. This is the structural
 * type used for file I/O and for Core's exported TypeScript types.
 *
 * Static types stay broad because a Project's supported languages are runtime
 * data. Per-project completeness is enforced at service boundaries by the
 * strict factories in `strictEntitySchema.ts`.
 *
 * @see ./strictEntitySchema.ts
 * @see ../../contributing/language-scoped-validation.md
 */
export function partialTranslatableRecordOf<T extends z.ZodTypeAny>(schema: T) {
  return z.partialRecord(supportedLanguageSchema, schema);
}

/**
 * A translatable string. Every value is trimmed and must not be empty, so
 * `{ en: '   ' }` is rejected as `BadRequest` rather than stored blank.
 *
 * @see {@link partialTranslatableRecordOf} for why keys are optional and where
 *   per-project language completeness is enforced.
 */
export const partialTranslatableStringSchema = partialTranslatableRecordOf(
  z.string().trim().min(1)
);

export const reservedSlugs = new Set([
  'index',
  'new',
  'create',
  'update',
  'delete',
  'edit',
  'list',
  'count',
  'api',
  'admin',
  'collection',
  'collections',
  'entry',
  'entries',
  'asset',
  'assets',
  'project',
  'projects',
  'null',
  'undefined',
  'true',
  'false',
  'constructor',
  '__proto__',
  'prototype',
  'toString',
  'valueOf',
  'login',
  'logout',
  'auth',
  'settings',
  'config',
]);

export const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !reservedSlugs.has(slug), {
    message: 'This slug is reserved and cannot be used',
  });
