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
 * Returns the current UNIX timestamp
 *
 * Since the UNIX timestamp is the number of seconds
 * that have elapsed from January 1, 1970, UTC and
 * `Date.now()` returns the time in milliseconds,
 * we need to convert this into seconds.
 */
export function currentTimestamp() {
  return Math.floor(Date.now() / 1000);
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
