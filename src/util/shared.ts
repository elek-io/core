import slugify from 'slugify';
import { v4 as generateUuid } from 'uuid';
import { type Uuid } from '../schema/baseSchema.js';

// Hack to make slugify work with ESM
// @see https://github.com/simov/slugify/issues/24
// @ts-ignore
const Slugify = slugify.default || slugify;

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
  return Slugify(string, {
    replacement: '-', // replace spaces with replacement character, defaults to `-`
    remove: undefined, // remove characters that match regex, defaults to `undefined`
    lower: true, // convert to lower case, defaults to `false`
    strict: true, // strip special characters except replacement, defaults to `false`
  });
}
