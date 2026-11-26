import {
  flattenFieldDefinitions,
  getValuesSchema,
  type CollectionFile,
  type CollectionMapping,
  type Contract,
  type EntryCondition,
  type EntryFile,
  type FieldDefinition,
  type FieldMapping,
  type Mapping,
  type MdAstRoot,
  type OptionMatch,
  type OptionValue,
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
  return mappingForVersion({ ...props, carryFrom: [] });
}

/**
 * The Mapping a version of a Contract starts out with: what the Mappings in
 * `carryFrom` already fill and the Project still holds, the first of them
 * that does per Collection, and otherwise what `mappingByMatchingIds` gives.
 *
 * So a version put beside the one in use keeps what the editor mapped, which
 * Entries the website takes included. An entry naming a Collection or field
 * definition that is gone is dropped rather than carried, while a condition
 * is carried whatever it reads, because a Mapping without one takes every
 * Entry of its Collection rather than leaving the check what to report.
 */
export function mappingForVersion(props: {
  contract: Contract;
  collections: readonly CollectionFile[];
  carryFrom: ReadonlyArray<Mapping>;
}): Mapping {
  const projectCollections = new Map(
    props.collections.map((collection) => [collection.id, collection])
  );
  const mapping: Mapping = { collections: {} };

  for (const contractCollection of props.contract.collections) {
    // Every carried entry for this Collection of the Contract whose source
    // the Project still holds, in the order they were given
    const carried: CollectionMapping[] = [];
    for (const one of props.carryFrom) {
      const entry = one.collections[contractCollection.id];
      if (
        entry !== undefined &&
        projectCollections.has(entry.from.collectionId)
      ) {
        carried.push(entry);
      }
    }
    const first = carried[0];
    const projectCollection =
      first === undefined
        ? projectCollections.get(contractCollection.id)
        : projectCollections.get(first.from.collectionId);
    if (projectCollection === undefined) {
      continue;
    }
    const contractFields = flattenFieldDefinitions(
      contractCollection.fieldDefinitions
    );
    const projectFieldIds = new Set(
      flattenFieldDefinitions(projectCollection.fieldDefinitions).map(
        ({ id }) => id
      )
    );
    const fields: Record<Uuid, FieldMapping> = {};
    for (const contractField of contractFields) {
      // What was mapped by hand wins over the matching id, and only where
      // it comes from the Collection this version reads through and every
      // field definition it reads is still there
      const fromCarried = carried
        .filter((one) => one.from.collectionId === projectCollection.id)
        .flatMap((one) => {
          const fieldMapping = one.fields[contractField.id];
          return fieldMapping === undefined ? [] : [fieldMapping];
        })
        .find((fieldMapping) => {
          return sourceFieldIdsOf(fieldMapping).every((id) => {
            return projectFieldIds.has(id);
          });
        });
      if (fromCarried !== undefined) {
        fields[contractField.id] = fromCarried;
      } else if (projectFieldIds.has(contractField.id)) {
        fields[contractField.id] = {
          fill: 'field',
          fieldDefinitionId: contractField.id,
        };
      }
    }
    mapping.collections[contractCollection.id] = {
      // A condition reading a field definition that is gone is carried as it
      // is, unlike a field mapping naming one, because dropping it would
      // take every Entry of the Collection rather than leave the check
      // something to report
      from: {
        collectionId: projectCollection.id,
        where: first?.from.where ?? [],
      },
      fields,
    };
  }

  return mapping;
}

/**
 * Everything about the Mapping itself: a Collection or required field of the
 * Contract nothing fills, a source that cannot fill what it is mapped onto,
 * an option without a match, and a mapped reference pointing at a Collection
 * of the Contract that is itself unmapped.
 *
 * Measured against `collections`, which is what the Project holds now, so an
 * entry of the Mapping naming a Collection or field definition that is gone
 * fills nothing and is reported rather than read as mapped. These hold
 * whatever the Entries say, so each is reported once per Destination and no
 * Entry is read to find them.
 */
export function mappingIssuesOf(props: {
  destinationId: Uuid;
  contract: Contract;
  mapping: Mapping;
  collections: readonly CollectionFile[];
  languages: ProjectLanguages;
}): DestinationMappingIssue[] {
  const issues: DestinationMappingIssue[] = [];
  const projectCollections = new Map(
    props.collections.map((collection) => [collection.id, collection])
  );

  for (const contractCollection of props.contract.collections) {
    const of = (
      issue: DestinationMappingIssue['issue'],
      message: string,
      contractFieldDefinitionId?: Uuid
    ): DestinationMappingIssue => {
      return {
        issue,
        destinationId: props.destinationId,
        contractCollectionId: contractCollection.id,
        ...(contractFieldDefinitionId === undefined
          ? {}
          : { contractFieldDefinitionId }),
        message,
      };
    };
    const collectionMapping = props.mapping.collections[contractCollection.id];
    if (collectionMapping === undefined) {
      issues.push(
        of(
          'collection_not_mapped',
          `No Collection of the Project fills "${contractCollection.slug.plural}"`
        )
      );
      continue;
    }
    const projectCollection = projectCollections.get(
      collectionMapping.from.collectionId
    );
    if (projectCollection === undefined) {
      issues.push(
        of(
          'collection_not_mapped',
          `The Mapping fills "${contractCollection.slug.plural}" from the Collection "${collectionMapping.from.collectionId}", which the Project does not hold, so nothing fills it`
        )
      );
      continue;
    }
    const projectFields = new Map(
      flattenFieldDefinitions(projectCollection.fieldDefinitions).map(
        (field) => [field.id, field]
      )
    );
    // The Contract states how many Entries a Collection holds as well as
    // what they hold, so a Collection holding a list fills no Single Entry
    // of it, whichever of its Entries the website would read
    if (contractCollection.isSingleEntry && !projectCollection.isSingleEntry) {
      issues.push(
        of(
          'does_not_fit',
          `The Single Entry "${contractCollection.slug.plural}" of the Contract is filled from the Collection "${projectCollection.slug.plural}", which holds a list. Fill it from a Single Entry, or create it from the theme.`
        )
      );
    }
    for (const condition of collectionMapping.from.where) {
      const problem = conditionProblemOf(
        condition,
        projectCollection,
        projectFields
      );
      if (problem !== undefined) {
        issues.push(of('does_not_fit', problem));
      }
    }

    for (const contractField of flattenFieldDefinitions(
      contractCollection.fieldDefinitions
    )) {
      const named = `"${contractField.slug}" of "${contractCollection.slug.plural}"`;
      const fieldMapping = collectionMapping.fields[contractField.id];
      if (fieldMapping === undefined) {
        if (contractField.isRequired === true) {
          issues.push(
            of(
              'field_not_mapped',
              `No field of the Project fills the required field ${named}`,
              contractField.id
            )
          );
        }
        continue;
      }
      const missing = sourceFieldIdsOf(fieldMapping).filter((id) => {
        return projectFields.has(id) === false;
      });
      if (missing.length > 0) {
        if (contractField.isRequired === true) {
          issues.push(
            of(
              'field_not_mapped',
              `The Mapping fills the required field ${named} from the field definition "${missing[0]}", which the Collection "${projectCollection.id}" does not hold, so nothing fills it`,
              contractField.id
            )
          );
        }
        continue;
      }
      const problem = fitProblemOf({
        fieldMapping,
        contractField,
        projectFields,
        languages: props.languages,
      });
      if (problem !== undefined) {
        issues.push(of('does_not_fit', problem, contractField.id));
        continue;
      }
      for (const unmatched of optionProblemsOf({
        fieldMapping,
        contractField,
        projectFields,
      })) {
        issues.push(of('option_not_matched', unmatched, contractField.id));
      }
      // A mapped reference is only deliverable when what it points at is
      // mapped too, so the Mapping is closed over its references
      const unmapped = referencedCollectionIdsOf(contractField).filter((id) => {
        return props.mapping.collections[id] === undefined;
      });
      for (const id of unmapped) {
        issues.push(
          of(
            'reference_not_mapped',
            `The field ${named} points at the Collection "${id}" of the Contract, which no Collection of the Project fills`,
            contractField.id
          )
        );
      }
    }
  }

  return issues;
}

/**
 * The conditions each Collection of the Project is read through, one list
 * per Collection of the Contract it fills, so its keys are the Collections
 * whose Entries a caller has to read to tell which ones the website takes.
 *
 * A Collection one entry of the Mapping reads without a condition is left
 * out, because the website then takes every Entry of it whatever the other
 * entries ask for.
 */
export function conditionsBySource(
  mapping: Mapping
): Map<Uuid, EntryCondition[][]> {
  const bySource = new Map<Uuid, EntryCondition[][]>();
  for (const collectionMapping of Object.values(mapping.collections)) {
    const source = collectionMapping.from.collectionId;
    bySource.set(source, [
      ...(bySource.get(source) ?? []),
      collectionMapping.from.where,
    ]);
  }
  for (const [source, lists] of bySource) {
    if (lists.some((where) => where.length === 0)) {
      bySource.delete(source);
    }
  }
  return bySource;
}

/**
 * Whether the website takes one Entry of a Collection, which it does while
 * the Entry meets every condition of the Mapping.
 *
 * A condition is met by a Value that is one of the ones it lists, in any
 * language of the Project. One naming a field definition the Collection does
 * not hold is met by no Entry, and is reported by `mappingIssuesOf` rather
 * than quietly taking everything.
 */
export function takesEntry(props: {
  where: readonly EntryCondition[];
  collection: CollectionFile;
  entry: EntryFile;
}): boolean {
  const projectFields = new Map(
    flattenFieldDefinitions(props.collection.fieldDefinitions).map((field) => [
      field.id,
      field,
    ])
  );
  return props.where.every((condition) => {
    const field = projectFields.get(condition.fieldDefinitionId);
    if (field === undefined) {
      return false;
    }
    const value = props.entry.values[field.slug];
    if (value === undefined) {
      return false;
    }
    return condition.equals.some((wanted) => {
      return contentsOf(value).includes(wanted);
    });
  });
}

/**
 * Whether one Entry fits every Collection of the Contract its own
 * Collection fills, through the Mapping.
 *
 * Its Values are read the way the Mapping fills them and against the
 * Contract's own field definitions, with every Entry reference moved onto
 * the Contract's Collection ids. A Collection of the Contract whose
 * conditions this Entry does not meet raises nothing. A `dynamic` field is
 * checked by the Components its items name, their count and whether one is
 * there at all, never inside an item. What the Mapping itself is wrong about
 * is left to `mappingIssuesOf`, which reports it once.
 */
export function entryIssuesOf(props: {
  destinationId: Uuid;
  contract: Contract;
  mapping: Mapping;
  collection: CollectionFile;
  entry: EntryFile;
  languages: ProjectLanguages;
  /** The Entries of the Project the website does not take, by id */
  entryIdsNotTaken?: ReadonlySet<Uuid>;
}): DestinationValueIssue[] {
  const issues: DestinationValueIssue[] = [];
  const projectFields = new Map(
    flattenFieldDefinitions(props.collection.fieldDefinitions).map((field) => [
      field.id,
      field,
    ])
  );
  const contractCollectionsOf = contractCollectionsBySource(
    props.mapping,
    props.contract
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
    // The website leaves the Entry out, so none of its Values is the
    // website's to refuse
    if (
      takesEntry({
        where: collectionMapping.from.where,
        collection: props.collection,
        entry: props.entry,
      }) === false
    ) {
      continue;
    }

    const contractFields = flattenFieldDefinitions(
      contractCollection.fieldDefinitions
    ).filter((field) => {
      const fieldMapping = collectionMapping.fields[field.id];
      return (
        fieldMapping !== undefined &&
        isFillable({
          fieldMapping,
          contractField: field,
          projectFields,
          languages: props.languages,
        })
      );
    });
    const sourceOf = new Map<string, FieldDefinition>();
    const values: Record<string, Value> = {};
    const unfilledReferences: Array<{
      field: FieldDefinition;
      collectionId: Uuid;
    }> = [];
    const referencesNotTaken: Array<{
      field: FieldDefinition;
      entryId: Uuid;
      collectionId: Uuid;
      language: string;
    }> = [];

    for (const contractField of contractFields) {
      const fieldMapping = collectionMapping.fields[contractField.id];
      if (fieldMapping === undefined) {
        continue;
      }
      // Where several fields fill one, the first of them stands for the
      // Project's side of an issue, because one issue names one field
      const projectField = projectFields.get(
        sourceFieldIdsOf(fieldMapping)[0] ?? contractField.id
      );
      sourceOf.set(contractField.slug, projectField ?? contractField);
      const filled = filledFieldOf({
        fieldMapping,
        contractField,
        projectFields,
        entry: props.entry,
        languages: props.languages,
        contractCollectionsOf,
      });
      if (filled.value !== undefined) {
        values[contractField.slug] = filled.value;
      }
      for (const collectionId of filled.unfilled) {
        unfilledReferences.push({ field: contractField, collectionId });
      }
      for (const reference of filled.references) {
        if (props.entryIdsNotTaken?.has(reference.entryId) === true) {
          referencesNotTaken.push({ field: contractField, ...reference });
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

    // The website leaves the Entry out, so a page of it would have nothing
    // to link to. Named here rather than dropped, because which Entries a
    // website takes is the editor's choice and this one contradicts it
    for (const {
      field,
      entryId,
      collectionId,
      language,
    } of referencesNotTaken) {
      place(
        field,
        'reference_not_taken',
        `The field "${field.slug}" points at the Entry "${entryId}" of the Collection "${collectionId}" of the Project, which the website does not take`,
        props.languages.find((supported) => supported === language)
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
 * Each Value comes from what the Mapping fills the field with, be that one
 * field definition, a fixed Value, several fields joined or matched options,
 * with every Entry reference moved onto the Contract's Collection ids. A
 * field of the Contract nothing fills, and one whose source holds no Value,
 * is empty rather than absent, so the shape is the Contract's whatever the
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
  const contractCollectionsOf = contractCollectionsBySource(
    props.mapping,
    props.contract
  );

  const values: Record<string, Value> = {};
  for (const contractField of flattenFieldDefinitions(
    contractCollection.fieldDefinitions
  )) {
    const fieldMapping = collectionMapping?.fields[contractField.id];
    const filled =
      fieldMapping === undefined
        ? undefined
        : filledFieldOf({
            fieldMapping,
            contractField,
            projectFields,
            entry: props.entry,
            languages: props.languages,
            contractCollectionsOf,
          }).value;
    values[contractField.slug] =
      filled ?? emptyValueOf(contractField, props.languages);
  }
  return values;
}

/**
 * What is left before a Destination takes the Project: how much of its
 * Mapping does not fill, and how many Entries do not fit.
 *
 * An Entry is counted once however many of its Values are refused, because
 * one Entry is one thing to open.
 */
export function issueCountsOf(issues: readonly DestinationIssue[]): {
  unmapped: number;
  entries: number;
} {
  const values = issues.filter(isValueIssue);
  return {
    unmapped: issues.length - values.length,
    entries: new Set(values.map((issue) => issue.entryId)).size,
  };
}

/** Every issue of `issues` that is about an Entry rather than the Mapping */
export function isValueIssue(
  issue: DestinationIssue
): issue is DestinationValueIssue {
  return (
    issue.issue === 'missing_required' ||
    issue.issue === 'constraint_violation' ||
    issue.issue === 'reference_not_taken'
  );
}

/** What fills one field of the Contract, and where it points */
interface FilledField {
  /** Undefined where nothing fills it, which reads as a missing Value */
  value: Value | undefined;
  /** The Collections of the Project it points at that fill nothing */
  unfilled: Uuid[];
  /**
   * The Entries of the Project it points at, as the Project names them, with
   * the language of the Value pointing at each, so an issue about one names
   * the translation to open
   */
  references: Array<{
    entryId: Uuid;
    collectionId: Uuid;
    language: string;
  }>;
}

/** The field definitions of the Project one field mapping reads */
function sourceFieldIdsOf(fieldMapping: FieldMapping): Uuid[] {
  switch (fieldMapping.fill) {
    case 'field':
    case 'options':
      return [fieldMapping.fieldDefinitionId];
    case 'combined':
      return fieldMapping.fieldDefinitionIds;
    case 'fixed':
      return [];
  }
}

/**
 * The Value one field of the Contract takes from one Entry, the way the
 * Mapping fills it: the Value of one field definition, a fixed Value, the
 * Values of several fields joined, or one field's options matched onto the
 * Contract's own. A language order is applied to the result, so the first
 * language holding something fills every language.
 */
function filledFieldOf(props: {
  fieldMapping: FieldMapping;
  contractField: FieldDefinition;
  projectFields: ReadonlyMap<Uuid, FieldDefinition>;
  entry: EntryFile;
  languages: ProjectLanguages;
  contractCollectionsOf: ReadonlyMap<Uuid, Uuid[]>;
}): FilledField {
  const sourceFields = sourceFieldIdsOf(props.fieldMapping).flatMap((id) => {
    const field = props.projectFields.get(id);
    return field === undefined ? [] : [field];
  });
  const source = sourceValueOf({ ...props, sourceFields });
  if (source === undefined) {
    return { value: undefined, unfilled: [], references: [] };
  }
  const language =
    'language' in props.fieldMapping && props.fieldMapping.language;
  const ordered = language
    ? withLanguageOrder(source, props.languages, language.order)
    : source;
  const moved = onContractCollections(
    ordered,
    props.contractField,
    props.contractCollectionsOf
  );
  return {
    value: moved.value,
    unfilled: moved.unfilled,
    references: moved.references,
  };
}

/** The Value a field mapping reads, before a language order moves it */
function sourceValueOf(props: {
  fieldMapping: FieldMapping;
  contractField: FieldDefinition;
  sourceFields: readonly FieldDefinition[];
  entry: EntryFile;
  languages: ProjectLanguages;
}): Value | undefined {
  switch (props.fieldMapping.fill) {
    case 'fixed':
      return props.fieldMapping.value;
    case 'field':
      return props.sourceFields[0] === undefined
        ? undefined
        : props.entry.values[props.sourceFields[0].slug];
    case 'combined':
      return combinedValueOf(props);
    case 'options':
      return matchedValueOf({ ...props, matches: props.fieldMapping.options });
  }
}

/**
 * The Values of several field definitions joined into one string per
 * language, the separator between them. A source holding nothing in a
 * language is left out there, and a language where none of them holds
 * anything is null.
 */
function combinedValueOf(props: {
  sourceFields: readonly FieldDefinition[];
  entry: EntryFile;
  languages: ProjectLanguages;
  fieldMapping: FieldMapping;
}): Value {
  const separator =
    props.fieldMapping.fill === 'combined' ? props.fieldMapping.separator : ' ';
  const content: Partial<Record<SupportedLanguage, string | null>> = {};
  for (const language of props.languages) {
    const parts = props.sourceFields.flatMap((field) => {
      const text = textOf(props.entry.values[field.slug], language);
      return text === undefined ? [] : [text];
    });
    content[language] = parts.length === 0 ? null : parts.join(separator);
  }
  return { objectType: 'value', valueType: 'string', content };
}

/** What one language of a Value reads as where fields are joined */
function textOf(
  value: Value | undefined,
  language: SupportedLanguage
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.valueType === 'string') {
    return value.content[language] ?? undefined;
  }
  if (value.valueType === 'number') {
    const content = value.content[language];
    return content === null || content === undefined
      ? undefined
      : String(content);
  }
  return undefined;
}

/**
 * The Value one field's options become once they are matched onto the
 * Contract's own, in the Contract field's own type. An option without a
 * match is null here and is named by `mappingIssuesOf`, so no Entry carries
 * a Value the Contract never offered.
 */
function matchedValueOf(props: {
  contractField: FieldDefinition;
  sourceFields: readonly FieldDefinition[];
  matches: readonly OptionMatch[];
  entry: EntryFile;
  languages: ProjectLanguages;
}): Value | undefined {
  const sourceField = props.sourceFields[0];
  if (sourceField === undefined) {
    return undefined;
  }
  const value = props.entry.values[sourceField.slug];
  const wanted = props.contractField.valueType;
  if (wanted !== 'string' && wanted !== 'number') {
    return undefined;
  }
  const matched = (language: SupportedLanguage): OptionValue | undefined => {
    const option = optionOf(value, language);
    if (option === undefined) {
      return undefined;
    }
    return props.matches.find((match) => match.from === option)?.to;
  };
  if (wanted === 'number') {
    const content: Partial<Record<SupportedLanguage, number | null>> = {};
    for (const language of props.languages) {
      const to = matched(language);
      content[language] = typeof to === 'number' ? to : null;
    }
    return { objectType: 'value', valueType: 'number', content };
  }
  const content: Partial<Record<SupportedLanguage, string | null>> = {};
  for (const language of props.languages) {
    const to = matched(language);
    content[language] = typeof to === 'string' ? to : null;
  }
  return { objectType: 'value', valueType: 'string', content };
}

/** The option one language of a `select` field's Value holds */
function optionOf(
  value: Value | undefined,
  language: SupportedLanguage
): OptionValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.valueType === 'string' || value.valueType === 'number') {
    return value.content[language] ?? undefined;
  }
  return undefined;
}

/**
 * The Value with the first language of `order` holding something put into
 * every language of the Project, which is what a theme serving one language
 * reads. Component items are not kept per language and come back as they are.
 */
function withLanguageOrder(
  value: Value,
  languages: ProjectLanguages,
  order: readonly SupportedLanguage[]
): Value {
  if (value.valueType === 'component') {
    return value;
  }
  const from = order.find((language) => hasContentIn(value, language));
  switch (value.valueType) {
    case 'reference': {
      const content = from === undefined ? [] : (value.content[from] ?? []);
      return { ...value, content: perLanguage(languages, content) };
    }
    case 'boolean': {
      const content = from === undefined ? undefined : value.content[from];
      return {
        ...value,
        content: content === undefined ? {} : perLanguage(languages, content),
      };
    }
    case 'number': {
      const content = from === undefined ? null : (value.content[from] ?? null);
      return { ...value, content: perLanguage(languages, content) };
    }
    case 'string': {
      const content = from === undefined ? null : (value.content[from] ?? null);
      return { ...value, content: perLanguage(languages, content) };
    }
    case 'mdast': {
      const content = from === undefined ? null : (value.content[from] ?? null);
      return { ...value, content: perLanguage(languages, content) };
    }
  }
}

/** Whether a Value holds anything in one language */
function hasContentIn(value: Value, language: SupportedLanguage): boolean {
  switch (value.valueType) {
    case 'component':
      return value.content.length > 0;
    case 'reference':
      return (value.content[language] ?? []).length > 0;
    default: {
      const content = value.content[language];
      return content !== null && content !== undefined;
    }
  }
}

/** Every option or Value one direct Value holds, over all languages */
function contentsOf(value: Value): Array<string | number | boolean> {
  if (value.valueType === 'string') {
    return whatIsThere(Object.values(value.content));
  }
  if (value.valueType === 'number') {
    return whatIsThere(Object.values(value.content));
  }
  if (value.valueType === 'boolean') {
    return whatIsThere(Object.values(value.content));
  }
  return [];
}

/** What is there of a Value's content, with every empty language left out */
function whatIsThere<T>(contents: ReadonlyArray<T | null | undefined>): T[] {
  return contents.flatMap((content) => {
    return content === null || content === undefined ? [] : [content];
  });
}

/**
 * Why one field mapping cannot fill the field of the Contract it is mapped
 * onto, or undefined where it can. A source of another type, a fixed Value
 * the field refuses and a way of filling the field's own type rules out are
 * each reported once, before any Entry is read.
 */
function fitProblemOf(props: {
  fieldMapping: FieldMapping;
  contractField: FieldDefinition;
  projectFields: ReadonlyMap<Uuid, FieldDefinition>;
  languages: ProjectLanguages;
}): string | undefined {
  const named = `"${props.contractField.slug}"`;
  const sourceFields = sourceFieldIdsOf(props.fieldMapping).flatMap((id) => {
    const field = props.projectFields.get(id);
    return field === undefined ? [] : [field];
  });
  switch (props.fieldMapping.fill) {
    case 'fixed':
      return fixedProblemOf({
        value: props.fieldMapping.value,
        contractField: props.contractField,
        languages: props.languages,
      });
    case 'combined': {
      if (props.contractField.valueType !== 'string') {
        return `The field ${named} takes a Value of type "${props.contractField.valueType}", which fields joined into one text cannot fill. Fill it from one field instead.`;
      }
      const other = sourceFields.find((field) => {
        return field.valueType !== 'string' && field.valueType !== 'number';
      });
      return other === undefined
        ? undefined
        : `The field ${named} is filled from the field "${other.slug}" of the Project among others, whose Value of type "${other.valueType}" has no text to join. Join fields whose Value is text or a number.`;
    }
    case 'options': {
      const source = sourceFields[0];
      if (source === undefined || !('options' in source)) {
        return `The field ${named} matches the options of the field "${source?.slug ?? ''}" of the Project, which has none. Match the options of a select field.`;
      }
      return 'options' in props.contractField
        ? undefined
        : `The field ${named} is no select field, so it has no options to match onto. Fill it from one field instead.`;
    }
    case 'field': {
      const source = sourceFields[0];
      if (source === undefined) {
        return undefined;
      }
      if (source.valueType !== props.contractField.valueType) {
        return `The field ${named} takes a Value of type "${props.contractField.valueType}" and the field "${source.slug}" of the Project holds one of type "${source.valueType}"`;
      }
      return source.valueType === 'reference' &&
        source.fieldType !== props.contractField.fieldType
        ? `The field ${named} references ${referenceWord(props.contractField)} and the field "${source.slug}" of the Project references ${referenceWord(source)}`
        : undefined;
    }
  }
}

/** Whether a field mapping can fill the field it is mapped onto at all */
function isFillable(props: {
  fieldMapping: FieldMapping;
  contractField: FieldDefinition;
  projectFields: ReadonlyMap<Uuid, FieldDefinition>;
  languages: ProjectLanguages;
}): boolean {
  const sources = sourceFieldIdsOf(props.fieldMapping);
  return (
    sources.every((id) => props.projectFields.has(id)) &&
    fitProblemOf(props) === undefined
  );
}

/** What a reference field points at, in the words an editor reads */
function referenceWord(field: FieldDefinition): string {
  return field.fieldType === 'asset' ? 'an Asset' : 'an Entry';
}

/**
 * Why a fixed Value cannot fill the field of the Contract it is typed into,
 * or undefined where it can. Read against the field's own definition, so a
 * Value of another type, one the field's rules refuse and a language it
 * leaves empty are all named while the Mapping is made.
 */
function fixedProblemOf(props: {
  value: Value;
  contractField: FieldDefinition;
  languages: ProjectLanguages;
}): string | undefined {
  const named = `"${props.contractField.slug}"`;
  if (props.value.valueType !== props.contractField.valueType) {
    return `The field ${named} takes a Value of type "${props.contractField.valueType}" and the fixed Value is one of type "${props.value.valueType}"`;
  }
  const parsed = getValuesSchema(
    [props.contractField],
    props.languages
  ).safeParse({ [props.contractField.slug]: props.value });
  if (parsed.success) {
    return undefined;
  }
  const first = parsed.error.issues[0];
  return `The fixed Value of the field ${named} does not fit it: ${first?.message ?? 'it is refused'}`;
}

/**
 * Every option of the Project's field that becomes no option of the
 * Contract's: one without a match, a match onto an option the Contract's
 * field does not offer, and a match from an option the Project's field no
 * longer holds.
 */
function optionProblemsOf(props: {
  fieldMapping: FieldMapping;
  contractField: FieldDefinition;
  projectFields: ReadonlyMap<Uuid, FieldDefinition>;
}): string[] {
  const { fieldMapping, contractField } = props;
  if (fieldMapping.fill !== 'field' && fieldMapping.fill !== 'options') {
    return [];
  }
  const source = props.projectFields.get(fieldMapping.fieldDefinitionId);
  if (
    source === undefined ||
    !('options' in source) ||
    !('options' in contractField)
  ) {
    return [];
  }
  const named = `"${contractField.slug}"`;
  const offered = new Set<OptionValue>(
    contractField.options.map(({ value }) => value)
  );
  const held = new Set<OptionValue>(source.options.map(({ value }) => value));
  // Without matches the Values pass through, so every option of the
  // Project's field has to be one the Contract's field offers
  if (fieldMapping.fill === 'field') {
    return source.options
      .filter(({ value }) => offered.has(value) === false)
      .map(({ value }) => {
        return `The option "${value}" of the field "${source.slug}" of the Project matches no option of the field ${named}. Match the options, or pick another field.`;
      });
  }
  const problems = source.options
    .filter(({ value }) => {
      return (
        fieldMapping.options.some((match) => match.from === value) === false
      );
    })
    .map(({ value }) => {
      return `The option "${value}" of the field "${source.slug}" of the Project is matched onto no option of the field ${named}`;
    });
  for (const match of fieldMapping.options) {
    if (held.has(match.from) === false) {
      problems.push(
        `The field ${named} matches the option "${match.from}", which the field "${source.slug}" of the Project does not hold`
      );
    }
    if (offered.has(match.to) === false) {
      problems.push(
        `The field ${named} is matched onto the option "${match.to}", which it does not offer`
      );
    }
  }
  return problems;
}

/**
 * Why one condition on which Entries the website takes cannot be met, or
 * undefined where it can. A condition reads one Value of the Project, so a
 * field definition that is gone, a Value that is no text, number or toggle
 * however the field is typed,
 * and a listed Value of another type each stop it.
 */
function conditionProblemOf(
  condition: EntryCondition,
  projectCollection: CollectionFile,
  projectFields: ReadonlyMap<Uuid, FieldDefinition>
): string | undefined {
  const named = `the Collection "${projectCollection.slug.plural}"`;
  const field = projectFields.get(condition.fieldDefinitionId);
  if (field === undefined) {
    return `Which Entries the website takes of ${named} is read from the field definition "${condition.fieldDefinitionId}", which the Collection does not hold, so it takes none`;
  }
  if (
    field.valueType !== 'string' &&
    field.valueType !== 'number' &&
    field.valueType !== 'boolean'
  ) {
    return `Which Entries the website takes of ${named} is read from its field "${field.slug}", whose Value of type "${field.valueType}" is nothing to compare. Read a field whose Value is text, a number or a toggle.`;
  }
  const other = condition.equals.find((wanted) => {
    return (
      typeof wanted !==
      (field.valueType === 'string' ? 'string' : field.valueType)
    );
  });
  return other === undefined
    ? undefined
    : `Which Entries the website takes of ${named} is read from its field "${field.slug}" of type "${field.valueType}", which never holds "${String(other)}"`;
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
 *
 * A key the Contract does not hold fills nothing, so it is left out rather
 * than becoming a Collection a reference could be moved onto.
 */
function contractCollectionsBySource(
  mapping: Mapping,
  contract: Contract
): Map<Uuid, Uuid[]> {
  const held = new Set(contract.collections.map(({ id }) => id));
  const bySource = new Map<Uuid, Uuid[]>();
  for (const [contractCollectionId, collectionMapping] of Object.entries(
    mapping.collections
  )) {
    if (held.has(contractCollectionId) === false) {
      continue;
    }
    const source = collectionMapping.from.collectionId;
    bySource.set(source, [
      ...(bySource.get(source) ?? []),
      contractCollectionId,
    ]);
  }
  return bySource;
}

/**
 * The Value with every Entry reference moved onto the Collection of the
 * Contract its own Collection fills, so the Contract's own `ofCollections`
 * can be read against it, the Collections of the Project it points at that
 * fill nothing, and the Entries it points at as the Project names them.
 *
 * Where two Collections of the Contract are filled from one of the Project,
 * the reference becomes the one its field allows. A reference that fills
 * nothing is named in `unfilled` and takes a Collection the field allows, so
 * the issue reported for it is the one these words can explain.
 */
function onContractCollections(
  value: Value,
  field: FieldDefinition,
  contractCollectionsOf: ReadonlyMap<Uuid, Uuid[]>
): {
  value: Value;
  unfilled: Uuid[];
  references: Array<{ entryId: Uuid; collectionId: Uuid; language: string }>;
} {
  if (value.valueType !== 'reference') {
    return { value, unfilled: [], references: [] };
  }
  const allowed = 'ofCollections' in field ? field.ofCollections : [];
  const unfilled: Uuid[] = [];
  const references: Array<{
    entryId: Uuid;
    collectionId: Uuid;
    language: string;
  }> = [];
  const content = Object.fromEntries(
    Object.entries(value.content).map(([language, entries]) => [
      language,
      entries?.map((reference) => {
        if (reference.objectType !== 'entry') {
          return reference;
        }
        references.push({
          entryId: reference.id,
          collectionId: reference.collectionId,
          language,
        });
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
  return { value: { ...value, content }, unfilled, references };
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
