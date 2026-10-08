import type { ComponentResolver, FieldDefinition } from '../schema/index.js';
import { CoreError } from './shared.js';

/**
 * Pre-loads every Component the given ids reach, transitively, and returns
 * the synchronous resolver schema generation needs.
 *
 * The walk follows each nested `ofComponents` and skips an id already loaded,
 * so a cycle terminates. An empty `ofComponents` contributes nothing: it
 * means every Component, which the schema builder answers with a permissive
 * item schema without resolving anything.
 *
 * The resolver throws `Internal` for an id the walk never reached, which is a
 * caller that built it from the wrong field definitions.
 */
export async function preloadComponentResolver(
  componentIds: string[],
  loadFieldDefinitions: (componentId: string) => Promise<FieldDefinition[]>
): Promise<ComponentResolver> {
  const loaded = new Map<string, FieldDefinition[]>();
  const queue = [...componentIds];

  while (queue.length > 0) {
    const componentId = queue.shift()!;
    if (loaded.has(componentId)) {
      continue;
    }

    const fieldDefinitions = await loadFieldDefinitions(componentId);
    loaded.set(componentId, fieldDefinitions);

    for (const fieldDefinition of fieldDefinitions) {
      if (fieldDefinition.valueType === 'component') {
        queue.push(...fieldDefinition.ofComponents);
      }
    }
  }

  return (componentId: string) => {
    const fieldDefinitions = loaded.get(componentId);
    if (!fieldDefinitions) {
      throw CoreError.internal(
        `Component "${componentId}" was not pre-loaded for schema generation`
      );
    }
    return fieldDefinitions;
  };
}

/**
 * The Component ids the given field definitions name directly, deduplicated.
 *
 * The roots a `preloadComponentResolver` walk starts from, so a caller does
 * not have to know that only a `component` field carries any.
 */
export function componentIdsOf(fieldDefinitions: FieldDefinition[]): string[] {
  const ids = fieldDefinitions.flatMap((fieldDefinition) =>
    fieldDefinition.valueType === 'component'
      ? fieldDefinition.ofComponents
      : []
  );

  return [...new Set(ids)];
}
