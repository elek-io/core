import type { Value } from '../schema/valueSchema.js';

/**
 * Transforms an elek.io Entry's values record into a flat object
 * keyed by field definition slug. Each value's translatable content
 * is preserved as-is.
 *
 * For component (dynamic) fields, the nested values within each
 * component item are recursively transformed.
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
