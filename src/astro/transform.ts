import type { Value } from '../schema/valueSchema.js';

/**
 * Transforms an elek.io Entry's values record into a flat object
 * keyed by field definition slug. Each value's translatable content
 * is preserved as-is.
 */
export function transformEntryValues(values: Record<string, Value>) {
  const result: Record<string, unknown> = {};
  for (const [slug, value] of Object.entries(values)) {
    result[slug] = value.content;
  }
  return result;
}
