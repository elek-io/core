/**
 * `Object.keys` and `Object.entries`, typed to the object's own keys.
 *
 * TypeScript widens both to `string`, because a JavaScript object may carry
 * keys its type does not mention. The objects Core walks with these cannot:
 * a Value's `content` is a `partialRecord` keyed by the supported languages,
 * a `MarkdownFeatures` object by its declared flags. Both are built by Core
 * from a schema, so their key type is exactly what the type says.
 *
 * The narrowing needs one assertion, which lives here so no call site needs
 * its own. That is the whole reason these exist, and the reason this file is
 * the only place `typescript/no-unsafe-type-assertion` is disabled outside
 * the exemptions listed in `contributing/linting.md`.
 *
 * Only reach for these when the key type is guaranteed by construction. For
 * an object that crosses a trust boundary (parsed JSON, user input) validate
 * it with a schema instead.
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
