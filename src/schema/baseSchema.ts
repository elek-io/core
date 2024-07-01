import z from 'zod';

export const environmentSchema = z.enum(['production', 'development', 'test']);
export type Environment = z.infer<typeof environmentSchema>;

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

export const supportedAssetMimeTypeSchema = z.enum([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'application/pdf',
  'application/zip',
  'video/mp4',
  'video/webm',
  'audio/webm',
  'audio/flac',
]);
export type SupportedAssetMimeType = z.infer<
  typeof supportedAssetMimeTypeSchema
>;

/**
 * Files we currently support for Assets
 *
 * Detection of binary-based files is done by "file-type" dependency
 * @see https://github.com/sindresorhus/file-type?tab=readme-ov-file#supported-file-types
 */
export const supportedAssetExtensionSchema = z.enum([
  'avif',
  'gif',
  'jpg',
  'jpeg',
  'png',
  'svg',
  'webp',
  'pdf',
  'zip',
  'mp4',
  'webm',
  'flac',
  'json',
]);
export type SupportedAssetExtension = z.infer<
  typeof supportedAssetExtensionSchema
>;

export const supportedAssetTypeSchema = z.object({
  extension: supportedAssetExtensionSchema,
  mimeType: supportedAssetMimeTypeSchema,
});
export type SupportedAssetType = z.infer<typeof supportedAssetTypeSchema>;

export const objectTypeSchema = z.enum([
  'project',
  'asset',
  'collection',
  'entry',
  'value',
  'sharedValue',
]);
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const versionSchema = z.string();
// .refine((version) => {
//   if (Semver.valid(version) !== null) {
//     return true;
//   }
//   return false;
// }, 'String must follow the Semantic Versioning format (https://semver.org/)');
export type Version = z.infer<typeof versionSchema>;

export const uuidSchema = z.string().uuid('shared.invalidUuid');
export type Uuid = z.infer<typeof uuidSchema>;

/**
 * A record that can be used to translate a string value into all supported languages
 */
export const translatableStringSchema = z.record(
  supportedLanguageSchema,
  z.string().trim().min(1, 'shared.translatableStringRequired')
);
export type TranslatableString = z.infer<typeof translatableStringSchema>;

/**
 * A record that can be used to translate a number value into all supported languages
 */
export const translatableNumberSchema = z.record(
  supportedLanguageSchema,
  z.number({ required_error: 'shared.translatableNumberRequired' })
);
export type TranslatableNumber = z.infer<typeof translatableNumberSchema>;

/**
 * A record that can be used to translate a boolean value into all supported languages
 */
export const translatableBooleanSchema = z.record(
  supportedLanguageSchema,
  z.boolean({ required_error: 'shared.translatableBooleanRequired' })
);
export type TranslatableBoolean = z.infer<typeof translatableBooleanSchema>;

export function translatableArrayOf<T extends z.ZodTypeAny>(schema: T) {
  return z.record(supportedLanguageSchema, z.array(schema));
}
