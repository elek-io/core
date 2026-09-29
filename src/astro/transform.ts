import type { Value } from '../schema/valueSchema.js';

/**
 * Drops the `Value` envelope (`objectType`, `valueType`) and hoists `content`,
 * which is why a page reads `entry.data.title.en`. Component items keep their
 * nesting, so the result is not flat.
 *
 * This stripped shape is exactly what `buildEntryValuesSchema` validates and
 * `buildEntryValuesTypeString` types. Not to be confused with the unrelated
 * `transformEntryValues` in `src/util/entryTransform.ts`.
 */
export function transformEntryValues(values: Record<string, Value>) {
  const result: Record<string, unknown> = {};
  for (const [slug, value] of Object.entries(values)) {
    if (value.valueType === 'component') {
      result[slug] = value.content.map((item) => ({
        id: item.id,
        componentId: item.componentId,
        values: transformEntryValues(item.values),
      }));
    } else {
      result[slug] = value.content;
    }
  }
  return result;
}
