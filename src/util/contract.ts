import {
  flattenFieldDefinitions,
  type CollectionFile,
  type ComponentFile,
  type FieldDefinition,
  type Uuid,
} from '../schema/index.js';

/** A Collection or Component a Contract names but does not hold */
export interface MissingContractReference {
  objectType: 'collection' | 'component';
  /** The id the field definition names */
  id: Uuid;
  /** The Collection or Component holding the field definition */
  referencedBy: Uuid;
  fieldDefinitionId: Uuid;
}

/**
 * Every Collection and Component the given field definitions name, through
 * an `entry` or `markdown` field's `ofCollections` and a `dynamic` field's
 * `ofComponents`.
 *
 * An empty list on either means every Collection or Component of the
 * Project, so it names none in particular and yields nothing.
 */
export function referencedIdsOf(fieldDefinitions: FieldDefinition[]): {
  collections: Map<Uuid, Uuid>;
  components: Map<Uuid, Uuid>;
} {
  const collections = new Map<Uuid, Uuid>();
  const components = new Map<Uuid, Uuid>();
  for (const fieldDefinition of fieldDefinitions) {
    if ('ofCollections' in fieldDefinition) {
      for (const id of fieldDefinition.ofCollections) {
        collections.set(id, fieldDefinition.id);
      }
    }
    if ('ofComponents' in fieldDefinition) {
      for (const id of fieldDefinition.ofComponents) {
        components.set(id, fieldDefinition.id);
      }
    }
  }
  return { collections, components };
}

/**
 * Every Collection and Component the Contract's own Collections and
 * Components name and the Contract does not hold, so generating one refuses
 * instead of writing a Contract whose references lead nowhere.
 *
 * Empty for a Contract whose references are closed, which is what a Contract
 * generated from a Project with no dangling reference yields.
 */
export function missingContractReferences(props: {
  collections: readonly CollectionFile[];
  components: readonly ComponentFile[];
}): MissingContractReference[] {
  const collectionIds = new Set(props.collections.map(({ id }) => id));
  const componentIds = new Set(props.components.map(({ id }) => id));
  const missing: MissingContractReference[] = [];

  const holders: Array<{ id: Uuid; fieldDefinitions: FieldDefinition[] }> = [
    ...props.collections.map((collection) => ({
      id: collection.id,
      fieldDefinitions: flattenFieldDefinitions(collection.fieldDefinitions),
    })),
    ...props.components.map((component) => ({
      id: component.id,
      fieldDefinitions: component.fieldDefinitions,
    })),
  ];

  for (const holder of holders) {
    const referenced = referencedIdsOf(holder.fieldDefinitions);
    for (const [id, fieldDefinitionId] of referenced.collections) {
      if (collectionIds.has(id) === false) {
        missing.push({
          objectType: 'collection',
          id,
          referencedBy: holder.id,
          fieldDefinitionId,
        });
      }
    }
    for (const [id, fieldDefinitionId] of referenced.components) {
      if (componentIds.has(id) === false) {
        missing.push({
          objectType: 'component',
          id,
          referencedBy: holder.id,
          fieldDefinitionId,
        });
      }
    }
  }

  return missing;
}
