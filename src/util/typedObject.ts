/**
 * `Object.keys` and `Object.entries`, typed to the object's own keys.
 *
 * TypeScript widens both to `string`, because a JavaScript object may carry
 * keys its type does not mention. The objects Core walks with these cannot,
 * they are built by Core from a schema. The narrowing needs one assertion,
 * which lives here so no call site needs its own.
 *
 * Only reach for these when the key type is guaranteed by construction.
 *
 * @see ../../contributing/linting.md
 */

/**
 * `Object.keys` returning the object's own key type instead of `string[]`.
 */
export function keysOf<T extends object>(value: T): Array<keyof T> {
  // The contained assertion this module exists to provide, see the file comment
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.keys(value) as Array<keyof T>;
}

/**
 * `Object.entries` returning the object's own key and value types instead of
 * `[string, T][]`.
 */
export function entriesOf<T extends object>(
  value: T
): Array<[keyof T, T[keyof T]]> {
  // The contained assertion this module exists to provide, see the file comment
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.entries(value) as Array<[keyof T, T[keyof T]]>;
}
