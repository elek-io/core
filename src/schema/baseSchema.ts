import { z } from '@hono/zod-openapi';

/**
 * All currently supported, BCP 47 compliant language tags
 *
 * The support depends on the tools and libraries we use.
 * We can't support a given language, if there is no support
 * for it from used third parties. Currently, to check if a langauge
 * tag can be added to this list, it needs to be supported by:
 * - DeepL translation API
 *
 * @see https://www.deepl.com/docs-api/other-functions/listing-supported-languages/
 */
export const supportedLanguageSchema = z.enum([
  /**
   * Bulgarian
   */
  'bg', //
  'cs', // Czech
  'da', // Danish
  'de', // German
  'el', // Greek
  'en', // (US) English
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
  'zh', // (Simplified) Chinese
]);
export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;

export const supportedIconSchema = z.enum(['home', 'plus', 'foobar']);
export type SupportedIcon = z.infer<typeof supportedIconSchema>;

export const objectTypeSchema = z.enum([
  'project',
  'asset',
  'collection',
  'entry',
  'value',
  'sharedValue',
]);
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);

export const versionSchema = z.string();
// .refine((version) => {
//   if (Semver.valid(version) !== null) {
//     return true;
//   }
//   return false;
// }, 'String must follow the Semantic Versioning format (https://semver.org/)');
export type Version = z.infer<typeof versionSchema>;

export const uuidSchema = z.uuid('shared.invalidUuid');
export type Uuid = z.infer<typeof uuidSchema>;

/**
 * A record that can be used to translate a string value into all supported languages
 */
export const translatableStringSchema = z.partialRecord(
  supportedLanguageSchema,
  z.string().trim().min(1, 'shared.translatableStringRequired')
);
export type TranslatableString = z.infer<typeof translatableStringSchema>;

/**
 * A record that can be used to translate a number value into all supported languages
 */
export const translatableNumberSchema = z.partialRecord(
  supportedLanguageSchema,
  z.number({
    error: (error) =>
      error.input === undefined
        ? 'shared.translatableNumberRequired'
        : 'shared.translatableNumberNotANumber',
  })
);
export type TranslatableNumber = z.infer<typeof translatableNumberSchema>;

/**
 * A record that can be used to translate a boolean value into all supported languages
 */
export const translatableBooleanSchema = z.partialRecord(
  supportedLanguageSchema,
  z.boolean({
    error: (error) =>
      error.input === undefined
        ? 'shared.translatableBooleanRequired'
        : 'shared.translatableBooleanNotABoolean',
  })
);
export type TranslatableBoolean = z.infer<typeof translatableBooleanSchema>;

export function translatableArrayOf<T extends z.ZodTypeAny>(schema: T) {
  return z.partialRecord(supportedLanguageSchema, z.array(schema));
}
