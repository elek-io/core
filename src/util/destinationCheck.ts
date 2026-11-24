import {
  flattenFieldDefinitions,
  getValuesSchema,
  type CollectionFile,
  type Contract,
  type EntryFile,
  type FieldDefinition,
  type Mapping,
  type ProjectLanguages,
  type SupportedLanguage,
  type Uuid,
  type Value,
} from '../schema/index.js';
import type {
  DestinationIssue,
  DestinationMappingIssue,
  DestinationValueIssue,
} from './destinationIssue.js';

/**
 * A Mapping that fills every field of the Contract whose id one of the
 * Project's own field definitions carries, which is what a Contract
 * generated from this Project gives.
 *
 * Nothing is guessed: a Collection or field whose id the Project does not
 * hold stays unmapped, and the check reports it.
 */
export function mappingByMatchingIds(props: {
  contract: Contract;
  collections: readonly CollectionFile[];
}): Mapping {
  const projectCollections = new Map(
    props.collections.map((collection) => [collection.id, collection])
  );
  const mapping: Mapping = { collections: {} };

  for (const contractCollection of props.contract.collections) {
    const projectCollection = projectCollections.get(contractCollection.id);
    if (projectCollection === undefined) {
      continue;
    }
    const projectFieldIds = new Set(
      flattenFieldDefinitions(projectCollection.fieldDefinitions).map(
        ({ id }) => id
      )
    );
    const fields: Record<Uuid, { fieldDefinitionId: Uuid }> = {};
    for (const contractField of flattenFieldDefinitions(
      contractCollection.fieldDefinitions
    )) {
      if (projectFieldIds.has(contractField.id)) {
        fields[contractField.id] = { fieldDefinitionId: contractField.id };
      }
    }
    mapping.collections[contractCollection.id] = {
      from: { collectionId: projectCollection.id },
      fields,
    };
  }

  return mapping;
}

/**
 * Every Collection of the Contract the Mapping leaves without a Project
 * Collection, every required field it leaves without a Project field
 * definition, and every mapped reference field pointing at a Collection of
 * the Contract that is itself unmapped.
 *
 * These hold whatever the Entries say, so they are reported once per
 * Destination rather than per Entry.
 */
export function mappingIssuesOf(props: {
  destinationId: Uuid;
  contract: Contract;
  mapping: Mapping;
}): DestinationMappingIssue[] {
  const issues: DestinationMappingIssue[] = [];

  for (const contractCollection of props.contract.collections) {
    const collectionMapping = props.mapping.collections[contractCollection.id];
    if (collectionMapping === undefined) {
      issues.push({
        issue: 'collection_not_mapped',
        destinationId: props.destinationId,
        contractCollectionId: contractCollection.id,
        message: `No Collection of the Project fills "${contractCollection.slug.plural}"`,
      });
      continue;
    }

    for (const contractField of flattenFieldDefinitions(
      contractCollection.fieldDefinitions
    )) {
      const fieldMapping = collectionMapping.fields[contractField.id];
      if (fieldMapping === undefined) {
        if (contractField.isRequired === true) {
          issues.push({
            issue: 'field_not_mapped',
            destinationId: props.destinationId,
            contractCollectionId: contractCollection.id,
            contractFieldDefinitionId: contractField.id,
            message: `No field of the Project fills the required field "${contractField.slug}" of "${contractCollection.slug.plural}"`,
          });
        }
        continue;
      }
      // A mapped reference is only deliverable when what it points at is
      // mapped too, so the Mapping is closed over its references
      const unmapped = referencedCollectionIdsOf(contractField).filter((id) => {
        return props.mapping.collections[id] === undefined;
      });
      for (const id of unmapped) {
        issues.push({
          issue: 'reference_not_mapped',
          destinationId: props.destinationId,
          contractCollectionId: contractCollection.id,
          contractFieldDefinitionId: contractField.id,
          message: `The field "${contractField.slug}" of "${contractCollection.slug.plural}" points at the Collection "${id}" of the Contract, which no Collection of the Project fills`,
        });
      }
    }
  }

  return issues;
}

/**
 * Whether one Entry fits every Collection of the Contract its own
 * Collection fills, through the Mapping.
 *
 * Its Values are read against the Contract's own field definitions, with
 * every Entry reference moved onto the Contract's Collection ids. A
 * `dynamic` field is checked by the Components its items name, their count
 * and whether one is there at all, and never inside an item, because no
 * Mapping maps a Component's own fields yet.
 */
export function entryIssuesOf(props: {
  destinationId: Uuid;
  contract: Contract;
  mapping: Mapping;
  collection: CollectionFile;
  entry: EntryFile;
  languages: ProjectLanguages;
}): DestinationValueIssue[] {
  const issues: DestinationValueIssue[] = [];
  const projectFields = new Map(
    flattenFieldDefinitions(props.collection.fieldDefinitions).map((field) => [
      field.id,
      field,
    ])
  );
  const contractCollectionIdOf = new Map(
    Object.entries(props.mapping.collections).map(([id, collectionMapping]) => [
      collectionMapping.from.collectionId,
      id,
    ])
  );

  for (const [contractCollectionId, collectionMapping] of Object.entries(
    props.mapping.collections
  )) {
    if (collectionMapping.from.collectionId !== props.collection.id) {
      continue;
    }
    const contractCollection = props.contract.collections.find(
      ({ id }) => id === contractCollectionId
    );
    if (contractCollection === undefined) {
      continue;
    }

    const contractFields = flattenFieldDefinitions(
      contractCollection.fieldDefinitions
    ).filter((field) => collectionMapping.fields[field.id] !== undefined);
    const sourceOf = new Map<string, FieldDefinition>();
    const values: Record<string, Value> = {};

    for (const contractField of contractFields) {
      const fieldMapping = collectionMapping.fields[contractField.id];
      const projectField =
        fieldMapping === undefined
          ? undefined
          : projectFields.get(fieldMapping.fieldDefinitionId);
      if (projectField === undefined) {
        continue;
      }
      sourceOf.set(contractField.slug, projectField);
      const value = props.entry.values[projectField.slug];
      if (value !== undefined) {
        values[contractField.slug] = onContractCollections(
          value,
          contractCollectionIdOf
        );
      }
    }

    const place = (
      field: FieldDefinition,
      issue: DestinationValueIssue['issue'],
      message: string,
      language?: SupportedLanguage
    ) => {
      const projectField = sourceOf.get(field.slug);
      if (projectField === undefined) {
        return;
      }
      issues.push({
        issue,
        destinationId: props.destinationId,
        contractCollectionId,
        contractFieldDefinitionId: field.id,
        contractFieldSlug: field.slug,
        entryId: props.entry.id,
        collectionId: props.collection.id,
        fieldDefinitionId: projectField.id,
        fieldSlug: projectField.slug,
        ...(language === undefined ? {} : { language }),
        message,
      });
    };

    // A dynamic field is checked here rather than through the value schema,
    // which would read a Component item's own Values against the Contract
    // and report what no Mapping can answer for yet
    const dynamicFields = contractFields.filter((field) => {
      return field.valueType === 'component';
    });
    for (const field of dynamicFields) {
      for (const problem of componentProblemsOf(
        field,
        values[field.slug],
        props.contract
      )) {
        place(field, problem.issue, problem.message);
      }
    }

    const plainFields = contractFields.filter((field) => {
      return field.valueType !== 'component';
    });
    const parsed = getValuesSchema(plainFields, props.languages).safeParse(
      values
    );
    if (parsed.success === false) {
      for (const issue of parsed.error.issues) {
        const [slug, , language] = issue.path;
        const field = plainFields.find((candidate) => {
          return candidate.slug === slug;
        });
        if (field === undefined) {
          continue;
        }
        const isMissing =
          valueAtPath(values, issue.path) === null ||
          valueAtPath(values, issue.path) === undefined;
        place(
          field,
          isMissing ? 'missing_required' : 'constraint_violation',
          issue.message,
          props.languages.find((supported) => supported === language)
        );
      }
    }
  }

  return issues;
}

/** Every issue of `issues` that is about an Entry rather than the Mapping */
export function isValueIssue(
  issue: DestinationIssue
): issue is DestinationValueIssue {
  return (
    issue.issue === 'missing_required' || issue.issue === 'constraint_violation'
  );
}

/** The Collections of the Contract a reference field points at */
function referencedCollectionIdsOf(field: FieldDefinition): Uuid[] {
  if ('ofCollections' in field) {
    return [...new Set(field.ofCollections)];
  }
  return [];
}

/**
 * The Value with every Entry reference moved from the Collection of the
 * Project holding it onto the Collection of the Contract that Collection
 * fills, so the Contract's own `ofCollections` can be read against it.
 *
 * A reference into a Collection no Mapping holds keeps its id, which the
 * Contract's field then refuses.
 */
function onContractCollections(
  value: Value,
  contractCollectionIdOf: ReadonlyMap<Uuid, Uuid>
): Value {
  if (value.valueType !== 'reference') {
    return value;
  }
  return {
    ...value,
    content: Object.fromEntries(
      Object.entries(value.content).map(([language, references]) => [
        language,
        references?.map((reference) => {
          if (reference.objectType !== 'entry') {
            return reference;
          }
          const onContract = contractCollectionIdOf.get(reference.collectionId);
          return onContract === undefined
            ? reference
            : { ...reference, collectionId: onContract };
        }),
      ])
    ),
  };
}

/**
 * What a `dynamic` field of the Contract refuses about the Value filling it:
 * a missing one, a count outside `min` and `max`, and an item naming a
 * Component the field does not allow or the Contract does not hold.
 */
function componentProblemsOf(
  field: FieldDefinition,
  value: Value | undefined,
  contract: Contract
): Array<{ issue: DestinationValueIssue['issue']; message: string }> {
  if (value === undefined || value.valueType !== 'component') {
    return field.isRequired === true
      ? [
          {
            issue: 'missing_required',
            message: `The field "${field.slug}" needs Component items and the Entry holds none`,
          },
        ]
      : [];
  }
  if (!('ofComponents' in field)) {
    return [];
  }

  const problems: Array<{
    issue: DestinationValueIssue['issue'];
    message: string;
  }> = [];
  const items = value.content;
  if (field.isRequired === true && items.length === 0) {
    problems.push({
      issue: 'missing_required',
      message: `The field "${field.slug}" needs Component items and the Entry holds none`,
    });
  }
  if (field.min !== null && items.length > 0 && items.length < field.min) {
    problems.push({
      issue: 'constraint_violation',
      message: `The field "${field.slug}" takes at least ${field.min} Component items and the Entry holds ${items.length}`,
    });
  }
  if (field.max !== null && items.length > field.max) {
    problems.push({
      issue: 'constraint_violation',
      message: `The field "${field.slug}" takes at most ${field.max} Component items and the Entry holds ${items.length}`,
    });
  }

  // An empty list allows every Component of the Contract, never every
  // Component of the Project, so an item the Contract does not hold is
  // refused either way
  const allowed = new Set(
    field.ofComponents.length > 0
      ? field.ofComponents
      : contract.components.map(({ id }) => id)
  );
  for (const item of items) {
    if (allowed.has(item.componentId) === false) {
      problems.push({
        issue: 'constraint_violation',
        message: `The field "${field.slug}" does not take the Component "${item.componentId}" that item "${item.id}" holds`,
      });
    }
  }

  return problems;
}

/**
 * What sits at a zod issue's path in the values that were parsed, so a
 * missing Value is told from one that is there and does not fit, without
 * reading zod's own issue shapes.
 */
function valueAtPath(
  values: Record<string, Value>,
  path: ReadonlyArray<PropertyKey>
): unknown {
  let found: unknown = values;
  for (const segment of path) {
    if (typeof found !== 'object' || found === null) {
      return undefined;
    }
    found = Reflect.get(found, segment);
  }
  return found;
}
