import Uuid from 'uuid';

export const localePattern = /^(?:(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)|(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang))$|^((?:[a-z]{2,3}(?:(?:-[a-z]{3}){1,3})?)|[a-z]{4}|[a-z]{5,8})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?((?:-(?:[\da-z]{5,8}|\d[\da-z]{3}))*)?((?:-[\da-wy-z](?:-[\da-z]{2,8})+)*)?(-x(?:-[\da-z]{1,8})+)?$|^(x(?:-[\da-z]{1,8})+)$/i; // eslint-disable-line max-len

/**
 * Validate a locale string to test if it is BCP 47 compliant
 * 
 * Taken from: https://github.com/SafetyCulture/bcp47
 * 
 * @param value the tag locale to parse
 * 
 * @see https://en.wikipedia.org/wiki/IETF_language_tag
 * @see https://tools.ietf.org/html/bcp47
 */
export function locale(value: string): boolean {
  return localePattern.test(value);
}

/**
 * Validates a string to test if it is an UUID v4
 * 
 * @param value the string to check
 * 
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/pull/46395
 */
// export function uuid(value: string): boolean {
//   if (Uuid.validate(value) && Uuid.version(value) === 4) {
//     return true;
//   }
//   return false;
// }