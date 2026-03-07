import type { Value } from '../schema/valueSchema.js';

/**
 * Transforms an elek.io Entry's values array into a flat object
 * keyed by field definition ID. Each value's translatable content
 * is preserved as-is.
 */
export function transformEntryValues(
  values: Value[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const value of values) {
    result[value.fieldDefinitionId] = value.content;
  }
  return result;
}
