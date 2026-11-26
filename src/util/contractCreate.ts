import {
  flattenFieldDefinitions,
  type ComponentFile,
  type Contract,
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type Uuid,
} from '../schema/index.js';
import { uuid } from './shared.js';

/**
 * Something a field definition of the Contract names that nothing of the
 * Project fills, so creating it from the theme would write a field pointing
 * nowhere.
 *
 * `id` is what is named, by its id in the Contract, and
 * `fieldDefinitionId` the field definition of the Contract naming it.
 */
export interface UnfilledContractReference {
  objectType: 'collection' | 'component' | 'field';
  id: Uuid;
  fieldDefinitionId: Uuid;
}

/** Field definitions of the Contract as the Project's own */
export interface FieldDefinitionsFromContract {
  /** The field definitions, groups kept as they are */
  fieldDefinitions: FieldDefinitionOrGroup[];
  /** Which field definition of the Project each one of the Contract became */
  fieldDefinitionIds: Map<Uuid, Uuid>;
  /** Empty where every reference these field definitions carry is filled */
  unfilled: UnfilledContractReference[];
}

/** Components of the Contract a created Collection or field needs */
export interface ContractComponentsNeeded {
  /** Dependencies first, so each is created before the one naming it */
  components: ComponentFile[];
  /** Empty where every Component these field definitions name is held */
  unfilled: UnfilledContractReference[];
}

/**
 * The Components of the Contract the given field definitions need, and the
 * Components those need in turn, with a dependency before the Component
 * naming it.
 *
 * A `dynamic` field naming no Component in particular needs none, because
 * an empty list takes whatever the Project holds. A Component the Contract
 * itself does not hold is named in `unfilled`.
 */
export function contractComponentsNeeded(props: {
  fieldDefinitions: readonly FieldDefinitionOrGroup[];
  contract: Contract;
}): ContractComponentsNeeded {
  const held = new Map(
    props.contract.components.map((component) => [component.id, component])
  );
  const components: ComponentFile[] = [];
  const unfilled: UnfilledContractReference[] = [];
  const seen = new Set<Uuid>();

  const walk = (fieldDefinitions: readonly FieldDefinitionOrGroup[]): void => {
    for (const field of flattenFieldDefinitions([...fieldDefinitions])) {
      if (!('ofComponents' in field)) {
        continue;
      }
      for (const id of field.ofComponents) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        const component = held.get(id);
        if (component === undefined) {
          unfilled.push({
            objectType: 'component',
            id,
            fieldDefinitionId: field.id,
          });
          continue;
        }
        // Depth first, so a Component is created after the ones its own
        // dynamic fields name
        walk(component.fieldDefinitions);
        components.push(component);
      }
    }
  };
  walk(props.fieldDefinitions);

  return { components, unfilled };
}

/**
 * Field definitions of the Contract as the Project's own: a new id each, and
 * every Collection, Component and sibling field they point at translated
 * through what fills it.
 *
 * Ids are new, so a Collection created from the theme is the Project's own
 * rather than a copy carrying another Project's identity. A list naming
 * nothing in particular stays empty, which the Project reads as its own
 * Collections or Components.
 */
export function fieldDefinitionsFromContract(props: {
  fieldDefinitions: readonly FieldDefinitionOrGroup[];
  /** Which Collection of the Project fills each one of the Contract */
  collectionIds: ReadonlyMap<Uuid, Uuid>;
  /** Which Component of the Project each one of the Contract became */
  componentIds: ReadonlyMap<Uuid, Uuid>;
  /** Which field definition of the Project fills each one of the Contract */
  fieldDefinitionIds?: ReadonlyMap<Uuid, Uuid>;
}): FieldDefinitionsFromContract {
  const own = new Map<Uuid, Uuid>();
  for (const field of flattenFieldDefinitions([...props.fieldDefinitions])) {
    own.set(field.id, uuid());
  }
  const unfilled: UnfilledContractReference[] = [];
  const translate = (
    objectType: UnfilledContractReference['objectType'],
    ids: readonly Uuid[],
    through: ReadonlyMap<Uuid, Uuid>,
    fieldDefinitionId: Uuid
  ): Uuid[] => {
    return ids.flatMap((id) => {
      const filled = through.get(id);
      if (filled === undefined) {
        unfilled.push({ objectType, id, fieldDefinitionId });
        return [];
      }
      return [filled];
    });
  };
  const sources = new Map<Uuid, Uuid>([
    ...(props.fieldDefinitionIds ?? new Map<Uuid, Uuid>()),
    ...own,
  ]);

  const one = (field: FieldDefinition): FieldDefinition => {
    const id = own.get(field.id) ?? uuid();
    switch (field.fieldType) {
      case 'slug':
        return {
          ...field,
          id,
          ofFieldDefinitions: translate(
            'field',
            field.ofFieldDefinitions,
            sources,
            field.id
          ),
        };
      case 'entry':
      case 'markdown':
        return {
          ...field,
          id,
          ofCollections: translate(
            'collection',
            field.ofCollections,
            props.collectionIds,
            field.id
          ),
        };
      case 'dynamic':
        return {
          ...field,
          id,
          ofComponents: translate(
            'component',
            field.ofComponents,
            props.componentIds,
            field.id
          ),
        };
      default:
        return { ...field, id };
    }
  };

  const fieldDefinitions = props.fieldDefinitions.map((fieldOrGroup) => {
    if ('isGroup' in fieldOrGroup) {
      return {
        ...fieldOrGroup,
        id: uuid(),
        fieldDefinitions: fieldOrGroup.fieldDefinitions.map(one),
      };
    }
    return one(fieldOrGroup);
  });

  return { fieldDefinitions, fieldDefinitionIds: own, unfilled };
}

/** What creating from the theme refuses, in the words an editor reads */
export function unfilledMessage(
  unfilled: readonly UnfilledContractReference[]
): string {
  return unfilled
    .map((one) => {
      if (one.objectType === 'field') {
        return `the field "${one.id}", which no field definition of the Project fills`;
      }
      if (one.objectType === 'component') {
        return `the Component "${one.id}", which the Contract does not hold`;
      }
      return `the Collection "${one.id}", which no Collection of the Project fills`;
    })
    .join(', ');
}
