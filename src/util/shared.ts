import slugify from '@sindresorhus/slugify';
import { v4 as generateUuid } from 'uuid';
import { type Uuid } from '../schema/baseSchema.js';

/**
 * Returns a new UUID
 */
export function uuid(): Uuid {
  return generateUuid();
}

/**
 * Returns a string representing the current date and time
 * in a simplified format based on ISO 8601.
 * The timezone is always UTC.
 *
 * @example 'YYYY-MM-DDTHH:mm:ss.sssZ'
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
 * @see https://en.wikipedia.org/wiki/ISO_8601
 */
export function currentDatetime() {
  return new Date().toISOString();
}

/**
 * Returns the slug of given string
 */
export function slug(string: string): string {
  return slugify(string, {
    separator: '-',
    lowercase: true,
    decamelize: true,
  });
}
