import {
  flattenFieldDefinitions,
  getValuesSchema,
  type CollectionFile,
  type Contract,
  type EntryFile,
  type FieldDefinition,
  type Mapping,
  type MdAstRoot,
  type ProjectLanguages,
  type SupportedLanguage,
  type Uuid,
  type Value,
  type ValueContentReference,
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
 * Measured against `collections`, which is what the Project holds now, so an
 * entry of the Mapping naming a Collection or field definition that is gone
 * fills nothing and is reported rather than read as mapped. These hold
 * whatever the Entries say, so each is reported once per Destination.
 */
export function mappingIssuesOf(props: {
  destinationId: Uuid;
  contract: Contract;
  mapping: Mapping;
  collections: readonly CollectionFile[];
}): DestinationMappingIssue[] {
  const issues: DestinationMappingIssue[] = [];
  const projectCollections = new Map(
    props.collections.map((collection) => [collection.id, collection])
  );

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
    const projectCollection = projectCollections.get(
      collectionMapping.from.collectionId
    );
    if (projectCollection === undefined) {
      issues.push({
        issue: 'collection_not_mapped',
        destinationId: props.destinationId,
        contractCollectionId: contractCollection.id,
        message: `The Mapping fills "${contractCollection.slug.plural}" from the Collection "${collectionMapping.from.collectionId}", which the Project does not hold, so nothing fills it`,
      });
      continue;
    }
    const projectFieldIds = new Set(
      flattenFieldDefinitions(projectCollection.fieldDefinitions).map(
        ({ id }) => id
      )
    );

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
      if (projectFieldIds.has(fieldMapping.fieldDefinitionId) === false) {
        if (contractField.isRequired === true) {
          issues.push({
            issue: 'field_not_mapped',
            destinationId: props.destinationId,
            contractCollectionId: contractCollection.id,
            contractFieldDefinitionId: contractField.id,
            message: `The Mapping fills the required field "${contractField.slug}" of "${contractCollection.slug.plural}" from the field definition "${fieldMapping.fieldDefinitionId}", which the Collection "${projectCollection.id}" does not hold, so nothing fills it`,
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
 * and whether one is there at all, never inside an item. A field filled
 * from a field definition this Collection no longer holds is left to
 * `mappingIssuesOf`, which reports it once rather than once per Entry.
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
  const contractCollectionsOf = contractCollectionsBySource(props.mapping);

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
    ).filter((field) => {
      const fieldMapping = collectionMapping.fields[field.id];
      return (
        fieldMapping !== undefined &&
        projectFields.has(fieldMapping.fieldDefinitionId)
      );
    });
    const sourceOf = new Map<string, FieldDefinition>();
    const values: Record<string, Value> = {};
    const unfilledReferences: Array<{
      field: FieldDefinition;
      collectionId: Uuid;
    }> = [];

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
        const moved = onContractCollections(
          value,
          contractField,
          contractCollectionsOf
        );
        values[contractField.slug] = moved.value;
        for (const collectionId of moved.unfilled) {
          unfilledReferences.push({ field: contractField, collectionId });
        }
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

    // A reference is checked here rather than through the Contract's own
    // `ofCollections`, which takes any Collection when the list is empty and
    // cannot tell a translated id from one that was left as it was
    for (const { field, collectionId } of unfilledReferences) {
      place(
        field,
        'constraint_violation',
        `The field "${field.slug}" points at an Entry of the Collection "${collectionId}" of the Project, which fills no Collection of the Contract`
      );
    }

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

/**
 * One Entry's Values keyed by the field slugs of one Collection of the
 * Contract, which is the shape a site built on that Contract reads.
 *
 * Each Value comes from the Project field definition the Mapping names, with
 * every Entry reference moved onto the Contract's Collection ids. A field of
 * the Contract nothing fills, and one whose Project field holds no Value, is
 * empty rather than absent, so the shape is the Contract's whatever the
 * Project holds. A field of the Project the Contract does not name is left
 * out.
 */
export function contractValuesOf(props: {
  contract: Contract;
  mapping: Mapping;
  contractCollectionId: Uuid;
  collection: CollectionFile;
  entry: EntryFile;
  languages: ProjectLanguages;
}): Record<string, Value> {
  const contractCollection = props.contract.collections.find(({ id }) => {
    return id === props.contractCollectionId;
  });
  if (contractCollection === undefined) {
    return {};
  }
  const collectionMapping =
    props.mapping.collections[props.contractCollectionId];
  const projectFields = new Map(
    flattenFieldDefinitions(props.collection.fieldDefinitions).map((field) => [
      field.id,
      field,
    ])
  );
  const contractCollectionsOf = contractCollectionsBySource(props.mapping);

  const values: Record<string, Value> = {};
  for (const contractField of flattenFieldDefinitions(
    contractCollection.fieldDefinitions
  )) {
    const fieldMapping = collectionMapping?.fields[contractField.id];
    const projectField =
      fieldMapping === undefined
        ? undefined
        : projectFields.get(fieldMapping.fieldDefinitionId);
    const value =
      projectField === undefined
        ? undefined
        : props.entry.values[projectField.slug];
    values[contractField.slug] =
      value === undefined
        ? emptyValueOf(contractField, props.languages)
        : onContractCollections(value, contractField, contractCollectionsOf)
            .value;
  }
  return values;
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
 * The Collections of the Contract each Collection of the Project fills. A
 * Mapping may fill two Collections of the Contract from one of the Project,
 * so a reference into it is deliverable as either of them.
 */
function contractCollectionsBySource(mapping: Mapping): Map<Uuid, Uuid[]> {
  const bySource = new Map<Uuid, Uuid[]>();
  for (const [contractCollectionId, collectionMapping] of Object.entries(
    mapping.collections
  )) {
    const source = collectionMapping.from.collectionId;
    bySource.set(source, [
      ...(bySource.get(source) ?? []),
      contractCollectionId,
    ]);
  }
  return bySource;
}

/**
 * The Value with every Entry reference moved from the Collection of the
 * Project holding it onto the Collection of the Contract that Collection
 * fills, so the Contract's own `ofCollections` can be read against it, and
 * the Collections of the Project it points at that fill nothing.
 *
 * Where two Collections of the Contract are filled from one of the Project,
 * the reference becomes the one its field allows. A reference that fills
 * nothing is named in `unfilled` and takes a Collection the field allows, so
 * the one issue reported for it is the one these words can explain rather
 * than the Contract's own refusal of an id it never saw.
 */
function onContractCollections(
  value: Value,
  field: FieldDefinition,
  contractCollectionsOf: ReadonlyMap<Uuid, Uuid[]>
): { value: Value; unfilled: Uuid[] } {
  if (value.valueType !== 'reference') {
    return { value, unfilled: [] };
  }
  const allowed = 'ofCollections' in field ? field.ofCollections : [];
  const unfilled: Uuid[] = [];
  const content = Object.fromEntries(
    Object.entries(value.content).map(([language, references]) => [
      language,
      references?.map((reference) => {
        if (reference.objectType !== 'entry') {
          return reference;
        }
        const targets = contractCollectionsOf.get(reference.collectionId) ?? [];
        const onContract =
          targets.find((id) => allowed.includes(id)) ?? targets[0];
        if (onContract === undefined) {
          unfilled.push(reference.collectionId);
          const substitute = allowed[0];
          return substitute === undefined
            ? reference
            : { ...reference, collectionId: substitute };
        }
        return { ...reference, collectionId: onContract };
      }),
    ])
  );
  return { value: { ...value, content }, unfilled };
}

/**
 * What a `dynamic` field of the Contract refuses about the Value filling it:
 * a missing one, a Value holding something other than Component items, a
 * count outside `min` and `max`, and an item naming a Component the field
 * does not allow or the Contract does not hold.
 *
 * A Value of another kind is refused whether the field is required or not,
 * because the field is left out of the value schema and nothing else would
 * read it.
 */
function componentProblemsOf(
  field: FieldDefinition,
  value: Value | undefined,
  contract: Contract
): Array<{ issue: DestinationValueIssue['issue']; message: string }> {
  if (value === undefined) {
    return field.isRequired === true
      ? [
          {
            issue: 'missing_required',
            message: `The field "${field.slug}" needs Component items and the Entry holds none`,
          },
        ]
      : [];
  }
  if (value.valueType !== 'component') {
    return [
      {
        issue: 'constraint_violation',
        message: `The field "${field.slug}" takes Component items and the Entry holds a Value of type "${value.valueType}"`,
      },
    ];
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

/** One empty slot per language of the Project, which is what a Value keys by */
function perLanguage<T>(
  languages: ProjectLanguages,
  empty: T
): Partial<Record<SupportedLanguage, T>> {
  const content: Partial<Record<SupportedLanguage, T>> = {};
  for (const language of languages) {
    content[language] = empty;
  }
  return content;
}

/**
 * The Value a field of the Contract holds while nothing fills it: `null` in
 * every language, or an empty list. It is the same Value an editor who left
 * the field empty produces, so a site reads one as the other.
 *
 * A boolean field is always required, so nothing filling it is a Mapping the
 * check reports rather than a Value anything reads.
 */
function emptyValueOf(
  field: FieldDefinition,
  languages: ProjectLanguages
): Value {
  switch (field.valueType) {
    case 'component':
      return { objectType: 'value', valueType: 'component', content: [] };
    case 'reference':
      return {
        objectType: 'value',
        valueType: 'reference',
        content: perLanguage<ValueContentReference[]>(languages, []),
      };
    case 'boolean':
      return { objectType: 'value', valueType: 'boolean', content: {} };
    case 'number':
      return {
        objectType: 'value',
        valueType: 'number',
        content: perLanguage<number | null>(languages, null),
      };
    case 'string':
      return {
        objectType: 'value',
        valueType: 'string',
        content: perLanguage<string | null>(languages, null),
      };
    case 'mdast':
      return {
        objectType: 'value',
        valueType: 'mdast',
        content: perLanguage<MdAstRoot | null>(languages, null),
      };
  }
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
