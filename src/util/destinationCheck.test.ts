import { describe, expect, it } from 'vitest';
import type {
  CollectionFile,
  ComponentFile,
  Contract,
  EntryFile,
  FieldDefinition,
  FixedValue,
  Mapping,
  ProjectLanguages,
  Value,
} from '../schema/index.js';
import {
  conditionsBySource,
  contractValuesOf,
  entryIssuesOf,
  isValueIssue,
  mappingByMatchingIds,
  mappingForVersion,
  mappingIssuesOf,
  takesEntry,
} from './destinationCheck.js';

const ids = {
  destination: '00000000-0000-4000-8000-0000000000d0',
  cars: '00000000-0000-4000-8000-000000000001',
  dealers: '00000000-0000-4000-8000-000000000002',
  elsewhere: '00000000-0000-4000-8000-00000000000e',
  hero: '00000000-0000-4000-8000-000000000003',
  gallery: '00000000-0000-4000-8000-000000000004',
  dealerField: '00000000-0000-4000-8000-000000000011',
  blocksField: '00000000-0000-4000-8000-000000000012',
  titleField: '00000000-0000-4000-8000-000000000013',
  item: '00000000-0000-4000-8000-000000000021',
  entry: '00000000-0000-4000-8000-000000000031',
  other: '00000000-0000-4000-8000-000000000032',
};
const languages: ProjectLanguages = ['en'];

function entryField(ofCollections: string[]): FieldDefinition {
  return {
    id: ids.dealerField,
    slug: 'dealer',
    valueType: 'reference',
    fieldType: 'entry',
    label: { en: 'Dealer' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofCollections,
    min: null,
    max: null,
  };
}

function dynamicField(
  ofComponents: string[],
  bounds: {
    isRequired?: boolean;
    min?: number | null;
    max?: number | null;
  } = {}
): FieldDefinition {
  return {
    id: ids.blocksField,
    slug: 'blocks',
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: 'Blocks' },
    description: null,
    isRequired: bounds.isRequired ?? false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofComponents,
    min: bounds.min ?? null,
    max: bounds.max ?? null,
  };
}

function textField(): FieldDefinition {
  return {
    id: ids.titleField,
    slug: 'title',
    valueType: 'string',
    fieldType: 'text',
    label: { en: 'Title' },
    description: null,
    defaultValue: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
  };
}

function collection(
  id: string,
  fieldDefinitions: FieldDefinition[]
): CollectionFile {
  return {
    objectType: 'collection',
    id,
    coreVersion: '0.28.0',
    created: '2026-11-24T00:00:00.000Z',
    updated: null,
    name: { singular: { en: 'Car' }, plural: { en: 'Cars' } },
    slug: { singular: 'car', plural: 'cars' },
    description: { en: 'Cars' },
    icon: 'car',
    isSingleEntry: false,
    fieldDefinitions,
  };
}

function component(id: string): ComponentFile {
  return {
    objectType: 'component',
    id,
    coreVersion: '0.28.0',
    created: '2026-11-24T00:00:00.000Z',
    updated: null,
    name: { en: 'Hero' },
    slug: 'hero',
    description: null,
    fieldDefinitions: [],
  };
}

function contractOf(props: {
  collections: CollectionFile[];
  components?: ComponentFile[];
}): Contract {
  return {
    name: '@acme/dealer-site',
    version: '1.0.0',
    languages: 'any',
    collections: props.collections,
    components: props.components ?? [],
  };
}

function entryOf(values: Record<string, Value>): EntryFile {
  return {
    objectType: 'entry',
    id: ids.entry,
    coreVersion: '0.28.0',
    created: '2026-11-24T00:00:00.000Z',
    updated: null,
    values,
  };
}

function mappingOf(
  collections: Record<string, { from: string; fields: string[] }>
): Mapping {
  return {
    collections: Object.fromEntries(
      Object.entries(collections).map(([id, mapped]) => [
        id,
        {
          from: { collectionId: mapped.from, where: [] },
          fields: Object.fromEntries(
            mapped.fields.map((fieldId) => [
              fieldId,
              { fill: 'field', fieldDefinitionId: fieldId },
            ])
          ),
        },
      ])
    ),
  };
}

describe('mappingByMatchingIds', function () {
  it('maps every Collection and field whose id the Project carries', function () {
    const cars = collection(ids.cars, [textField()]);

    expect(
      mappingByMatchingIds({
        contract: contractOf({ collections: [cars] }),
        collections: [cars],
      })
    ).toEqual(
      mappingOf({ [ids.cars]: { from: ids.cars, fields: [ids.titleField] } })
    );
  });

  it('leaves a Collection the Project does not hold unmapped', function () {
    expect(
      mappingByMatchingIds({
        contract: contractOf({
          collections: [collection(ids.cars, [textField()])],
        }),
        collections: [],
      })
    ).toEqual({ collections: {} });
  });

  it('leaves a field the Project does not hold unmapped', function () {
    expect(
      mappingByMatchingIds({
        contract: contractOf({
          collections: [collection(ids.cars, [textField(), entryField([])])],
        }),
        collections: [collection(ids.cars, [textField()])],
      })
    ).toEqual(
      mappingOf({ [ids.cars]: { from: ids.cars, fields: [ids.titleField] } })
    );
  });
});

describe('mappingIssuesOf', function () {
  it('is empty when every Collection and required field is filled', function () {
    const cars = collection(ids.cars, [textField()]);

    expect(
      mappingIssuesOf({
        languages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [cars] }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.cars, fields: [ids.titleField] },
        }),
        collections: [cars],
      })
    ).toEqual([]);
  });

  it('names a Collection no Collection of the Project fills', function () {
    const cars = collection(ids.cars, [textField()]);

    expect(
      mappingIssuesOf({
        languages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [cars] }),
        mapping: { collections: {} },
        collections: [cars],
      })
    ).toMatchObject([
      { issue: 'collection_not_mapped', contractCollectionId: ids.cars },
    ]);
  });

  it('leaves an unmapped optional field alone', function () {
    const cars = collection(ids.cars, [entryField([])]);

    expect(
      mappingIssuesOf({
        languages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [cars] }),
        mapping: mappingOf({ [ids.cars]: { from: ids.cars, fields: [] } }),
        collections: [cars],
      })
    ).toEqual([]);
  });

  it('names a Collection the Mapping fills from one the Project no longer holds', function () {
    const cars = collection(ids.cars, [textField()]);

    const issues = mappingIssuesOf({
      languages,
      destinationId: ids.destination,
      contract: contractOf({ collections: [cars] }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.elsewhere, fields: [ids.titleField] },
      }),
      collections: [cars],
    });

    expect(issues).toMatchObject([
      { issue: 'collection_not_mapped', contractCollectionId: ids.cars },
    ]);
    expect(issues[0]?.message).toContain(ids.elsewhere);
  });

  it('names a required field the Mapping fills from a field definition the Collection no longer holds', function () {
    const cars = collection(ids.cars, [textField()]);

    const issues = mappingIssuesOf({
      languages,
      destinationId: ids.destination,
      contract: contractOf({ collections: [cars] }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [ids.titleField] },
      }),
      collections: [collection(ids.cars, [])],
    });

    expect(issues).toMatchObject([
      {
        issue: 'field_not_mapped',
        contractCollectionId: ids.cars,
        contractFieldDefinitionId: ids.titleField,
      },
    ]);
    expect(issues[0]?.message).toContain(ids.titleField);
  });

  it('leaves an optional field whose field definition is gone alone', function () {
    const cars = collection(ids.cars, [entryField([])]);

    expect(
      mappingIssuesOf({
        languages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [cars] }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
        }),
        collections: [collection(ids.cars, [])],
      })
    ).toEqual([]);
  });

  it('names a mapped reference pointing at an unmapped Collection', function () {
    const cars = collection(ids.cars, [entryField([ids.dealers])]);
    const issues = mappingIssuesOf({
      languages,
      destinationId: ids.destination,
      contract: contractOf({ collections: [cars] }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
      }),
      collections: [cars],
    });

    expect(issues).toMatchObject([
      {
        issue: 'reference_not_mapped',
        contractCollectionId: ids.cars,
        contractFieldDefinitionId: ids.dealerField,
      },
    ]);
  });

  it('leaves a reference that points at anything alone', function () {
    const cars = collection(ids.cars, [entryField([])]);

    expect(
      mappingIssuesOf({
        languages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [cars] }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
        }),
        collections: [cars],
      })
    ).toEqual([]);
  });

  it('says nothing about a reference of a field nothing fills', function () {
    const cars = collection(ids.cars, [entryField([ids.dealers])]);
    const issues = mappingIssuesOf({
      languages,
      destinationId: ids.destination,
      contract: contractOf({ collections: [cars] }),
      mapping: mappingOf({ [ids.cars]: { from: ids.cars, fields: [] } }),
      collections: [cars],
    });

    expect(issues).toEqual([]);
  });
});

describe('entryIssuesOf, references through the Mapping', function () {
  const cars = collection(ids.cars, [entryField([ids.dealers])]);
  const projectCars = collection(ids.cars, [entryField([ids.elsewhere])]);

  /** A reference Value pointing at one Entry of one Project Collection */
  function referenceTo(collectionId: string): Value {
    return {
      objectType: 'value',
      valueType: 'reference',
      content: {
        en: [{ objectType: 'entry', id: ids.other, collectionId }],
      },
    };
  }

  it('takes a reference into a Collection the Mapping fills', function () {
    expect(
      entryIssuesOf({
        destinationId: ids.destination,
        contract: contractOf({
          collections: [cars, collection(ids.dealers, [])],
        }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
          [ids.dealers]: { from: ids.elsewhere, fields: [] },
        }),
        collection: projectCars,
        entry: entryOf({ dealer: referenceTo(ids.elsewhere) }),
        languages,
      })
    ).toEqual([]);
  });

  it('refuses a reference into a Collection the Mapping does not fill', function () {
    const issues = entryIssuesOf({
      destinationId: ids.destination,
      contract: contractOf({
        collections: [cars, collection(ids.dealers, [])],
      }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
        [ids.dealers]: { from: ids.elsewhere, fields: [] },
      }),
      collection: projectCars,
      entry: entryOf({ dealer: referenceTo(ids.gallery) }),
      languages,
    });

    expect(issues).toMatchObject([
      {
        issue: 'constraint_violation',
        contractFieldDefinitionId: ids.dealerField,
        fieldSlug: 'dealer',
        entryId: ids.entry,
      },
    ]);
  });

  it('refuses a reference whose Collection carries the id of a Contract Collection the field allows', function () {
    const issues = entryIssuesOf({
      destinationId: ids.destination,
      contract: contractOf({
        collections: [cars, collection(ids.dealers, [])],
      }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
        [ids.dealers]: { from: ids.elsewhere, fields: [] },
      }),
      collection: projectCars,
      // A Collection of the Project carrying the id the Contract gave its own
      // "dealers", which no Mapping entry fills from
      entry: entryOf({ dealer: referenceTo(ids.dealers) }),
      languages,
    });

    expect(issues).toMatchObject([
      {
        issue: 'constraint_violation',
        contractFieldDefinitionId: ids.dealerField,
      },
    ]);
    expect(issues[0]?.message).toContain(ids.dealers);
  });

  it('refuses a reference into an unfilled Collection even where the field takes any', function () {
    const anyCollection = collection(ids.cars, [entryField([])]);
    const issues = entryIssuesOf({
      destinationId: ids.destination,
      contract: contractOf({ collections: [anyCollection] }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
      }),
      collection: anyCollection,
      entry: entryOf({ dealer: referenceTo(ids.gallery) }),
      languages,
    });

    expect(issues).toMatchObject([
      {
        issue: 'constraint_violation',
        contractFieldDefinitionId: ids.dealerField,
      },
    ]);
  });

  it('takes a reference the field allows where two Contract Collections share one source', function () {
    expect(
      entryIssuesOf({
        destinationId: ids.destination,
        contract: contractOf({
          collections: [
            cars,
            collection(ids.dealers, []),
            collection(ids.gallery, []),
          ],
        }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
          [ids.gallery]: { from: ids.elsewhere, fields: [] },
          [ids.dealers]: { from: ids.elsewhere, fields: [] },
        }),
        collection: projectCars,
        entry: entryOf({ dealer: referenceTo(ids.elsewhere) }),
        languages,
      })
    ).toEqual([]);
  });

  it('says nothing about an Entry whose Collection fills nothing', function () {
    expect(
      entryIssuesOf({
        destinationId: ids.destination,
        contract: contractOf({ collections: [cars] }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.elsewhere, fields: [ids.dealerField] },
        }),
        collection: projectCars,
        entry: entryOf({ dealer: referenceTo(ids.elsewhere) }),
        languages,
      })
    ).toEqual([]);
  });

  it('leaves a field whose field definition the Collection no longer holds to the Mapping', function () {
    const required = collection(ids.cars, [textField()]);

    expect(
      entryIssuesOf({
        destinationId: ids.destination,
        contract: contractOf({ collections: [required] }),
        mapping: mappingOf({
          [ids.cars]: { from: ids.cars, fields: [ids.titleField] },
        }),
        collection: collection(ids.cars, []),
        entry: entryOf({}),
        languages,
      })
    ).toEqual([]);
  });
});

describe('entryIssuesOf, a dynamic field by the Components its items name', function () {
  /** A component Value holding one item of one Component */
  function itemsOf(componentIds: string[]): Value {
    return {
      objectType: 'value',
      valueType: 'component',
      content: componentIds.map((componentId, index) => ({
        id: `00000000-0000-4000-8000-00000000002${index}`,
        componentId,
        values: {
          anything: {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'kept' },
          },
        },
      })),
    };
  }

  function check(field: FieldDefinition, value: Value | undefined) {
    const cars = collection(ids.cars, [field]);
    return entryIssuesOf({
      destinationId: ids.destination,
      contract: contractOf({
        collections: [cars],
        components: [component(ids.hero)],
      }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [field.id] },
      }),
      collection: cars,
      entry: entryOf(value === undefined ? {} : { blocks: value }),
      languages,
    });
  }

  it('takes an item whose Component the field allows', function () {
    expect(check(dynamicField([ids.hero]), itemsOf([ids.hero]))).toEqual([]);
  });

  it("never reads a Component item's own Values", function () {
    expect(check(dynamicField([]), itemsOf([ids.hero]))).toEqual([]);
  });

  it('refuses an item whose Component the field does not allow', function () {
    expect(
      check(dynamicField([ids.hero]), itemsOf([ids.gallery]))
    ).toMatchObject([
      { issue: 'constraint_violation', contractFieldSlug: 'blocks' },
    ]);
  });

  it('refuses an item whose Component the Contract does not hold at all', function () {
    expect(check(dynamicField([]), itemsOf([ids.gallery]))).toMatchObject([
      { issue: 'constraint_violation', contractFieldSlug: 'blocks' },
    ]);
  });

  it('names a required field the Entry holds no item for', function () {
    expect(
      check(dynamicField([ids.hero], { isRequired: true }), itemsOf([]))
    ).toMatchObject([{ issue: 'missing_required' }]);
  });

  it('names a required field the Entry holds no Value for', function () {
    expect(
      check(dynamicField([ids.hero], { isRequired: true }), undefined)
    ).toMatchObject([{ issue: 'missing_required' }]);
  });

  it('leaves an optional field the Entry holds no Value for alone', function () {
    expect(check(dynamicField([ids.hero]), undefined)).toEqual([]);
  });

  it('refuses a Value that holds no Component items at all', function () {
    const text: Value = {
      objectType: 'value',
      valueType: 'string',
      content: { en: 'not an item' },
    };

    const issues = check(dynamicField([ids.hero]), text);

    expect(issues).toMatchObject([
      { issue: 'constraint_violation', contractFieldSlug: 'blocks' },
    ]);
    expect(issues[0]?.message).toContain('"string"');
    expect(
      check(dynamicField([ids.hero], { isRequired: true }), text)
    ).toMatchObject([{ issue: 'constraint_violation' }]);
  });

  it('refuses fewer items than min', function () {
    expect(
      check(dynamicField([ids.hero], { min: 2 }), itemsOf([ids.hero]))
    ).toMatchObject([
      { issue: 'constraint_violation', contractFieldSlug: 'blocks' },
    ]);
  });

  it('refuses more items than max', function () {
    expect(
      check(dynamicField([ids.hero], { max: 1 }), itemsOf([ids.hero, ids.hero]))
    ).toMatchObject([
      { issue: 'constraint_violation', contractFieldSlug: 'blocks' },
    ]);
  });

  it('takes a count between min and max', function () {
    expect(
      check(
        dynamicField([ids.hero], { min: 1, max: 2 }),
        itemsOf([ids.hero, ids.hero])
      )
    ).toEqual([]);
  });
});

describe('isValueIssue', function () {
  it('is true for what an Entry raised and false for what the Mapping did', function () {
    const base = {
      destinationId: ids.destination,
      contractCollectionId: ids.cars,
      message: 'something',
    };

    expect(isValueIssue({ ...base, issue: 'collection_not_mapped' })).toEqual(
      false
    );
    expect(isValueIssue({ ...base, issue: 'field_not_mapped' })).toEqual(false);
    expect(isValueIssue({ ...base, issue: 'reference_not_mapped' })).toEqual(
      false
    );
    expect(
      isValueIssue({
        ...base,
        issue: 'missing_required',
        contractFieldDefinitionId: ids.titleField,
        contractFieldSlug: 'title',
        entryId: ids.entry,
        collectionId: ids.cars,
        fieldDefinitionId: ids.titleField,
        fieldSlug: 'title',
      })
    ).toEqual(true);
  });
});

const more = {
  makeField: '00000000-0000-4000-8000-000000000041',
  modelField: '00000000-0000-4000-8000-000000000042',
  statusField: '00000000-0000-4000-8000-000000000043',
  seatsField: '00000000-0000-4000-8000-000000000044',
  priceField: '00000000-0000-4000-8000-000000000045',
};
const twoLanguages: ProjectLanguages = ['en', 'de'];

function textFieldOf(
  id: string,
  slug: string,
  max: number | null = null
): FieldDefinition {
  return {
    ...textField(),
    fieldType: 'text',
    valueType: 'string',
    defaultValue: null,
    id,
    slug,
    isRequired: false,
    min: null,
    max,
  };
}

function numberFieldOf(id: string, slug: string): FieldDefinition {
  return {
    id,
    slug,
    valueType: 'number',
    fieldType: 'number',
    label: { en: slug },
    description: null,
    defaultValue: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
  };
}

function selectFieldOf(
  id: string,
  slug: string,
  options: string[]
): FieldDefinition {
  return {
    id,
    slug,
    valueType: 'string',
    fieldType: 'select',
    label: { en: slug },
    description: null,
    defaultValue: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    options: options.map((value) => ({ value, label: { en: value } })),
  };
}

function numberSelectFieldOf(
  id: string,
  slug: string,
  options: number[]
): FieldDefinition {
  return {
    id,
    slug,
    valueType: 'number',
    fieldType: 'select',
    label: { en: slug },
    description: null,
    defaultValue: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    options: options.map((value) => ({
      value,
      label: { en: String(value) },
    })),
  };
}

/** A string Value, one language at a time */
function stringValue(
  content: Partial<Record<'en' | 'de', string | null>>
): FixedValue {
  return { objectType: 'value', valueType: 'string', content };
}

/** A number Value, one language at a time */
function numberValue(
  content: Partial<Record<'en' | 'de', number | null>>
): FixedValue {
  return { objectType: 'value', valueType: 'number', content };
}

/** One Collection of the Contract filled the way `fields` says */
function mappingFilling(props: {
  from?: string;
  where?: Mapping['collections'][string]['from']['where'];
  fields: Mapping['collections'][string]['fields'];
}): Mapping {
  return {
    collections: {
      [ids.cars]: {
        from: {
          collectionId: props.from ?? ids.cars,
          where: props.where ?? [],
        },
        fields: props.fields,
      },
    },
  };
}

describe('contractValuesOf, the ways one field is filled', function () {
  it('fills a field from a fixed Value', function () {
    const contractCars = collection(ids.cars, [
      textFieldOf(ids.titleField, 'title'),
    ]);

    expect(
      contractValuesOf({
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'fixed',
              value: stringValue({ en: 'Aus Ebersfelde' }),
            },
          },
        }),
        contractCollectionId: ids.cars,
        collection: collection(ids.cars, []),
        entry: entryOf({}),
        languages,
      })
    ).toEqual({ title: stringValue({ en: 'Aus Ebersfelde' }) });
  });

  it('joins several fields into one, leaving out what holds nothing', function () {
    const contractCars = collection(ids.cars, [
      textFieldOf(ids.titleField, 'title'),
    ]);
    const projectCars = collection(ids.cars, [
      textFieldOf(more.makeField, 'make'),
      numberFieldOf(more.seatsField, 'seats'),
    ]);
    const values = (entry: EntryFile) =>
      contractValuesOf({
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'combined',
              fieldDefinitionIds: [more.makeField, more.seatsField],
              separator: ', ',
            },
          },
        }),
        contractCollectionId: ids.cars,
        collection: projectCars,
        entry,
        languages,
      });

    expect(
      values(
        entryOf({
          make: stringValue({ en: 'VW Golf' }),
          seats: numberValue({ en: 5 }),
        })
      )
    ).toEqual({ title: stringValue({ en: 'VW Golf, 5' }) });
    expect(
      values(
        entryOf({
          make: stringValue({ en: 'VW Golf' }),
          seats: numberValue({ en: null }),
        })
      )
    ).toEqual({ title: stringValue({ en: 'VW Golf' }) });
    expect(values(entryOf({}))).toEqual({
      title: stringValue({ en: null }),
    });
  });

  it('matches an option onto the one the Contract offers', function () {
    const contractCars = collection(ids.cars, [
      selectFieldOf(ids.titleField, 'status', ['available', 'sold']),
    ]);
    const projectCars = collection(ids.cars, [
      selectFieldOf(more.statusField, 'zustand', ['frei', 'verkauft']),
    ]);
    const values = (entry: EntryFile) =>
      contractValuesOf({
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'options',
              fieldDefinitionId: more.statusField,
              options: [{ from: 'frei', to: 'available' }],
            },
          },
        }),
        contractCollectionId: ids.cars,
        collection: projectCars,
        entry,
        languages,
      });

    expect(values(entryOf({ zustand: stringValue({ en: 'frei' }) }))).toEqual({
      status: stringValue({ en: 'available' }),
    });
    // The option nothing matches fills nothing, rather than reaching a site
    // as a Value the Contract never offered
    expect(
      values(entryOf({ zustand: stringValue({ en: 'verkauft' }) }))
    ).toEqual({ status: stringValue({ en: null }) });
  });

  it('matches an option onto a number the Contract offers', function () {
    const contractCars = collection(ids.cars, [
      numberSelectFieldOf(ids.titleField, 'seats', [2, 5]),
    ]);
    const projectCars = collection(ids.cars, [
      selectFieldOf(more.seatsField, 'sitze', ['zwei', 'fuenf']),
    ]);

    expect(
      contractValuesOf({
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'options',
              fieldDefinitionId: more.seatsField,
              options: [
                { from: 'zwei', to: 2 },
                { from: 'fuenf', to: 5 },
              ],
            },
          },
        }),
        contractCollectionId: ids.cars,
        collection: projectCars,
        entry: entryOf({ sitze: stringValue({ en: 'fuenf' }) }),
        languages,
      })
    ).toEqual({ seats: numberValue({ en: 5 }) });
  });

  it('takes the first language of the order that holds something', function () {
    const contractCars = collection(ids.cars, [
      textFieldOf(ids.titleField, 'title'),
    ]);
    const projectCars = collection(ids.cars, [
      textFieldOf(more.makeField, 'make'),
    ]);
    const values = (entry: EntryFile, order: ProjectLanguages = ['en', 'de']) =>
      contractValuesOf({
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'field',
              fieldDefinitionId: more.makeField,
              language: { order },
            },
          },
        }),
        contractCollectionId: ids.cars,
        collection: projectCars,
        entry,
        languages: twoLanguages,
      });

    // English is empty, so German fills both languages
    expect(
      values(entryOf({ make: stringValue({ en: null, de: 'Gebraucht' }) }))
    ).toEqual({ title: stringValue({ en: 'Gebraucht', de: 'Gebraucht' }) });
    // The order decides, so German fills English even where English has one
    expect(
      values(entryOf({ make: stringValue({ en: 'Used', de: 'Gebraucht' }) }), [
        'de',
      ])
    ).toEqual({ title: stringValue({ en: 'Gebraucht', de: 'Gebraucht' }) });
    // Nothing in either language leaves the field empty
    expect(
      values(entryOf({ make: stringValue({ en: null, de: null }) }))
    ).toEqual({ title: stringValue({ en: null, de: null }) });
  });
});

describe('mappingIssuesOf, a Mapping that cannot fill', function () {
  /** The issues of one Mapping over one Collection, with no Entry anywhere */
  function issuesOf(props: {
    contractFields: FieldDefinition[];
    projectFields: FieldDefinition[];
    mapping: Mapping;
    isSingleEntry?: boolean;
  }) {
    const contractCars = {
      ...collection(ids.cars, props.contractFields),
      isSingleEntry: props.isSingleEntry ?? false,
    };
    return mappingIssuesOf({
      languages,
      destinationId: ids.destination,
      contract: contractOf({ collections: [contractCars] }),
      mapping: props.mapping,
      collections: [collection(ids.cars, props.projectFields)],
    });
  }

  it('names a field whose Value is of another type', function () {
    expect(
      issuesOf({
        contractFields: [textFieldOf(ids.titleField, 'title')],
        projectFields: [numberFieldOf(more.priceField, 'price')],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'field',
              fieldDefinitionId: more.priceField,
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        contractFieldDefinitionId: ids.titleField,
        message:
          'The field "title" takes a Value of type "string" and the field "price" of the Project holds one of type "number"',
      },
    ]);
  });

  it('names a fixed Value the field refuses', function () {
    const refused = issuesOf({
      contractFields: [textFieldOf(ids.titleField, 'title', 3)],
      projectFields: [],
      mapping: mappingFilling({
        fields: {
          [ids.titleField]: {
            fill: 'fixed',
            value: stringValue({ en: 'Aus Ebersfelde' }),
          },
        },
      }),
    });

    expect(refused).toMatchObject([
      { issue: 'does_not_fit', contractFieldDefinitionId: ids.titleField },
    ]);
    expect(refused[0]?.message).toContain('The fixed Value of the field');
    expect(
      issuesOf({
        contractFields: [textFieldOf(ids.titleField, 'title')],
        projectFields: [],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'fixed',
              value: numberValue({ en: 4 }),
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message:
          'The field "title" takes a Value of type "string" and the fixed Value is one of type "number"',
      },
    ]);
  });

  it('names a fixed Value leaving a language of the Project empty', function () {
    const contractCars = collection(ids.cars, [
      { ...textFieldOf(ids.titleField, 'title'), isRequired: true },
    ]);

    expect(
      mappingIssuesOf({
        languages: twoLanguages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'fixed',
              value: stringValue({ en: 'Aus Ebersfelde' }),
            },
          },
        }),
        collections: [collection(ids.cars, [])],
      })
    ).toMatchObject([
      { issue: 'does_not_fit', contractFieldDefinitionId: ids.titleField },
    ]);
  });

  it('names fields joined into a field that takes no text', function () {
    expect(
      issuesOf({
        contractFields: [numberFieldOf(ids.titleField, 'price')],
        projectFields: [
          textFieldOf(more.makeField, 'make'),
          textFieldOf(more.modelField, 'model'),
        ],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'combined',
              fieldDefinitionIds: [more.makeField, more.modelField],
              separator: ' ',
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message:
          'The field "price" takes a Value of type "number", which fields joined into one text cannot fill. Fill it from one field instead.',
      },
    ]);
  });

  it('names a field joined in that has no text to join', function () {
    expect(
      issuesOf({
        contractFields: [textFieldOf(ids.titleField, 'title')],
        projectFields: [
          textFieldOf(more.makeField, 'make'),
          entryField([ids.cars]),
        ],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'combined',
              fieldDefinitionIds: [more.makeField, ids.dealerField],
              separator: ' ',
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message:
          'The field "title" is filled from the field "dealer" of the Project among others, whose Value of type "reference" has no text to join. Join fields whose Value is text or a number.',
      },
    ]);
  });

  it('names an option without a match', function () {
    expect(
      issuesOf({
        contractFields: [
          selectFieldOf(ids.titleField, 'status', ['available', 'sold']),
        ],
        projectFields: [
          selectFieldOf(more.statusField, 'zustand', ['frei', 'verkauft']),
        ],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'options',
              fieldDefinitionId: more.statusField,
              options: [{ from: 'frei', to: 'available' }],
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'option_not_matched',
        contractFieldDefinitionId: ids.titleField,
        message:
          'The option "verkauft" of the field "zustand" of the Project is matched onto no option of the field "status"',
      },
    ]);
  });

  it('names a match onto an option the Contract does not offer', function () {
    expect(
      issuesOf({
        contractFields: [
          selectFieldOf(ids.titleField, 'status', ['available']),
        ],
        projectFields: [selectFieldOf(more.statusField, 'zustand', ['frei'])],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'options',
              fieldDefinitionId: more.statusField,
              options: [
                { from: 'frei', to: 'reserved' },
                { from: 'gone', to: 'available' },
              ],
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'option_not_matched',
        message:
          'The field "status" is matched onto the option "reserved", which it does not offer',
      },
      {
        issue: 'option_not_matched',
        message:
          'The field "status" matches the option "gone", which the field "zustand" of the Project does not hold',
      },
    ]);
  });

  it('names an option of a field filled without matching', function () {
    expect(
      issuesOf({
        contractFields: [
          selectFieldOf(ids.titleField, 'status', ['available', 'sold']),
        ],
        projectFields: [
          selectFieldOf(more.statusField, 'status', ['available', 'reserved']),
        ],
        mapping: mappingFilling({
          fields: {
            [ids.titleField]: {
              fill: 'field',
              fieldDefinitionId: more.statusField,
            },
          },
        }),
      })
    ).toMatchObject([
      {
        issue: 'option_not_matched',
        message:
          'The option "reserved" of the field "status" of the Project matches no option of the field "status". Match the options, or pick another field.',
      },
    ]);
  });

  it('names a condition on a field the Collection does not hold', function () {
    expect(
      issuesOf({
        contractFields: [],
        projectFields: [],
        mapping: mappingFilling({
          where: [{ fieldDefinitionId: more.statusField, equals: ['frei'] }],
          fields: {},
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message: `Which Entries the website takes of the Collection "cars" is read from the field definition "${more.statusField}", which the Collection does not hold, so it takes none`,
      },
    ]);
  });

  it('names a condition on a Value there is nothing to compare', function () {
    expect(
      issuesOf({
        contractFields: [],
        projectFields: [entryField([ids.cars])],
        mapping: mappingFilling({
          where: [{ fieldDefinitionId: ids.dealerField, equals: ['frei'] }],
          fields: {},
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message:
          'Which Entries the website takes of the Collection "cars" is read from its field "dealer", whose Value of type "reference" is nothing to compare. Read a field whose Value is text, a number or a toggle.',
      },
    ]);
  });

  it('takes a condition on a select field, whose Value is text', function () {
    // The Value decides, not the kind of field, so only the cars for sale
    // reads a select field
    expect(
      issuesOf({
        contractFields: [],
        projectFields: [
          selectFieldOf(more.statusField, 'status', ['frei', 'verkauft']),
        ],
        mapping: mappingFilling({
          where: [{ fieldDefinitionId: more.statusField, equals: ['frei'] }],
          fields: {},
        }),
      })
    ).toEqual([]);
  });

  it('names a condition listing a Value of another type', function () {
    expect(
      issuesOf({
        contractFields: [],
        projectFields: [numberFieldOf(more.priceField, 'price')],
        mapping: mappingFilling({
          where: [{ fieldDefinitionId: more.priceField, equals: ['cheap'] }],
          fields: {},
        }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message:
          'Which Entries the website takes of the Collection "cars" is read from its field "price" of type "number", which never holds "cheap"',
      },
    ]);
  });

  it('names a Single Entry of the Contract filled from a list', function () {
    expect(
      issuesOf({
        isSingleEntry: true,
        contractFields: [],
        projectFields: [],
        mapping: mappingFilling({ fields: {} }),
      })
    ).toMatchObject([
      {
        issue: 'does_not_fit',
        message:
          'The Single Entry "cars" of the Contract is filled from the Collection "cars", which holds a list. Fill it from a Single Entry, or create it from the theme.',
      },
    ]);
  });

  it('takes a Single Entry of the Contract filled from a Single Entry', function () {
    const contractCars = {
      ...collection(ids.cars, []),
      isSingleEntry: true,
    };

    expect(
      mappingIssuesOf({
        languages,
        destinationId: ids.destination,
        contract: contractOf({ collections: [contractCars] }),
        mapping: mappingFilling({ fields: {} }),
        collections: [{ ...collection(ids.cars, []), isSingleEntry: true }],
      })
    ).toEqual([]);
  });

  it('names a required field nothing fills at all', function () {
    expect(
      issuesOf({
        contractFields: [textField()],
        projectFields: [],
        mapping: mappingFilling({ fields: {} }),
      })
    ).toMatchObject([
      {
        issue: 'field_not_mapped',
        message:
          'No field of the Project fills the required field "title" of "cars"',
      },
    ]);
  });
});

describe('which Entries a website takes', function () {
  const projectCars = collection(ids.cars, [
    selectFieldOf(more.statusField, 'status', ['frei', 'verkauft']),
    textFieldOf(ids.titleField, 'title'),
  ]);
  const forSale = [{ fieldDefinitionId: more.statusField, equals: ['frei'] }];

  it('takes an Entry meeting every condition in any language', function () {
    expect(
      takesEntry({
        where: forSale,
        collection: projectCars,
        entry: entryOf({ status: stringValue({ en: 'verkauft', de: 'frei' }) }),
      })
    ).toEqual(true);
    expect(
      takesEntry({
        where: forSale,
        collection: projectCars,
        entry: entryOf({ status: stringValue({ en: 'verkauft' }) }),
      })
    ).toEqual(false);
    expect(
      takesEntry({
        where: forSale,
        collection: projectCars,
        entry: entryOf({}),
      })
    ).toEqual(false);
  });

  it('takes an Entry only while every condition holds', function () {
    const entry = entryOf({
      status: stringValue({ en: 'frei' }),
      title: stringValue({ en: 'Golf' }),
    });

    expect(
      takesEntry({
        where: [
          ...forSale,
          { fieldDefinitionId: ids.titleField, equals: ['Golf'] },
        ],
        collection: projectCars,
        entry,
      })
    ).toEqual(true);
    expect(
      takesEntry({
        where: [
          ...forSale,
          { fieldDefinitionId: ids.titleField, equals: ['Polo'] },
        ],
        collection: projectCars,
        entry,
      })
    ).toEqual(false);
  });

  it('takes an Entry by what a toggle or a number holds', function () {
    const toggle: FieldDefinition = {
      id: more.priceField,
      slug: 'is-published',
      valueType: 'boolean',
      fieldType: 'toggle',
      label: { en: 'Published' },
      description: null,
      defaultValue: false,
      isRequired: true,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
    };
    const published = collection(ids.cars, [
      toggle,
      numberFieldOf(more.seatsField, 'seats'),
    ]);
    const entry = entryOf({
      'is-published': {
        objectType: 'value',
        valueType: 'boolean',
        content: { en: true },
      },
      seats: numberValue({ en: 5 }),
    });

    expect(
      takesEntry({
        where: [
          { fieldDefinitionId: more.priceField, equals: [true] },
          { fieldDefinitionId: more.seatsField, equals: [5, 7] },
        ],
        collection: published,
        entry,
      })
    ).toEqual(true);
    expect(
      takesEntry({
        where: [{ fieldDefinitionId: more.priceField, equals: [false] }],
        collection: published,
        entry,
      })
    ).toEqual(false);
  });

  it('takes none of a Collection whose condition cannot be read', function () {
    expect(
      takesEntry({
        where: [{ fieldDefinitionId: more.priceField, equals: [1] }],
        collection: projectCars,
        entry: entryOf({ status: stringValue({ en: 'frei' }) }),
      })
    ).toEqual(false);
  });

  it('names the Collections whose Entries have to be read', function () {
    expect(
      conditionsBySource({
        collections: {
          [ids.cars]: {
            from: { collectionId: ids.cars, where: forSale },
            fields: {},
          },
        },
      })
    ).toEqual(new Map([[ids.cars, [forSale]]]));
    // One Collection of the Contract reading it without a condition takes
    // every Entry of it, so nothing has to be read
    expect(
      conditionsBySource({
        collections: {
          [ids.cars]: {
            from: { collectionId: ids.cars, where: forSale },
            fields: {},
          },
          [ids.dealers]: {
            from: { collectionId: ids.cars, where: [] },
            fields: {},
          },
        },
      })
    ).toEqual(new Map());
  });

  it('raises nothing about an Entry the website does not take', function () {
    const contractCars = collection(ids.cars, [textField()]);
    const issues = (where: Mapping['collections'][string]['from']['where']) =>
      entryIssuesOf({
        destinationId: ids.destination,
        contract: contractOf({ collections: [contractCars] }),
        mapping: {
          collections: {
            [ids.cars]: {
              from: { collectionId: ids.cars, where },
              fields: {
                [ids.titleField]: {
                  fill: 'field',
                  fieldDefinitionId: ids.titleField,
                },
              },
            },
          },
        },
        collection: projectCars,
        entry: entryOf({ status: stringValue({ en: 'verkauft' }) }),
        languages,
      });

    // The required title is empty, which only matters while the website
    // takes the Entry
    expect(issues([])).toMatchObject([{ issue: 'missing_required' }]);
    expect(issues(forSale)).toEqual([]);
  });

  it('names a reference pointing at an Entry the website does not take', function () {
    const contractCars = collection(ids.cars, [entryField([ids.cars])]);
    const issues = entryIssuesOf({
      destinationId: ids.destination,
      contract: contractOf({ collections: [contractCars] }),
      mapping: mappingOf({
        [ids.cars]: { from: ids.cars, fields: [ids.dealerField] },
      }),
      collection: collection(ids.cars, [entryField([ids.cars])]),
      entry: entryOf({
        dealer: {
          objectType: 'value',
          valueType: 'reference',
          content: {
            en: [
              { objectType: 'entry', id: ids.other, collectionId: ids.cars },
            ],
          },
        },
      }),
      languages,
      entryIdsNotTaken: new Set([ids.other]),
    });

    expect(issues).toMatchObject([
      {
        issue: 'reference_not_taken',
        entryId: ids.entry,
        contractFieldDefinitionId: ids.dealerField,
        message: `The field "dealer" points at the Entry "${ids.other}" of the Collection "${ids.cars}" of the Project, which the website does not take`,
      },
    ]);
    const first = issues[0];
    expect(first !== undefined && isValueIssue(first)).toEqual(true);
  });
});

describe('mappingForVersion, what a new version carries over', function () {
  const contractCars = collection(ids.cars, [
    textFieldOf(ids.titleField, 'title'),
  ]);
  const projectCars = collection(ids.cars, [
    textFieldOf(more.makeField, 'make'),
    textFieldOf(more.modelField, 'model'),
  ]);
  const forSale = [
    { fieldDefinitionId: more.makeField, equals: ['VW'] },
    { fieldDefinitionId: more.statusField, equals: ['frei'] },
  ];

  it('carries a field filled another way, and which Entries are taken', function () {
    const carried = mappingForVersion({
      contract: contractOf({ collections: [contractCars] }),
      collections: [projectCars],
      carryFrom: [
        {
          collections: {
            [ids.cars]: {
              from: { collectionId: ids.cars, where: forSale },
              fields: {
                [ids.titleField]: {
                  fill: 'combined',
                  fieldDefinitionIds: [more.makeField, more.modelField],
                  separator: ' ',
                },
              },
            },
          },
        },
      ],
    });

    expect(carried.collections[ids.cars]?.fields[ids.titleField]).toEqual({
      fill: 'combined',
      fieldDefinitionIds: [more.makeField, more.modelField],
      separator: ' ',
    });
    // Both conditions are carried, the one reading a field definition that
    // is gone included, because a Mapping without it would take every Entry
    expect(carried.collections[ids.cars]?.from.where).toEqual(forSale);
  });

  it('carries a condition the Project leaves nothing to read, so it is reported', function () {
    const carried = mappingForVersion({
      contract: contractOf({ collections: [contractCars] }),
      collections: [projectCars],
      carryFrom: [
        {
          collections: {
            [ids.cars]: {
              from: {
                collectionId: ids.cars,
                where: [
                  { fieldDefinitionId: more.statusField, equals: ['frei'] },
                ],
              },
              fields: {},
            },
          },
        },
      ],
    });

    expect(
      mappingIssuesOf({
        destinationId: ids.destination,
        contract: contractOf({ collections: [contractCars] }),
        mapping: carried,
        collections: [projectCars],
        languages,
      })
    ).toMatchObject([{ issue: 'does_not_fit' }]);
  });

  it('drops a field whose source the Project no longer holds', function () {
    const carried = mappingForVersion({
      contract: contractOf({ collections: [contractCars] }),
      collections: [
        collection(ids.cars, [textFieldOf(more.makeField, 'make')]),
      ],
      carryFrom: [
        {
          collections: {
            [ids.cars]: {
              from: { collectionId: ids.cars, where: [] },
              fields: {
                [ids.titleField]: {
                  fill: 'combined',
                  fieldDefinitionIds: [more.makeField, more.modelField],
                  separator: ' ',
                },
              },
            },
          },
        },
      ],
    });

    expect(carried.collections[ids.cars]?.fields).toEqual({});
  });

  it('carries a fixed Value, which reads no field of the Project at all', function () {
    const fixed = {
      fill: 'fixed' as const,
      value: stringValue({ en: 'Aus Ebersfelde' }),
    };
    const carried = mappingForVersion({
      contract: contractOf({ collections: [contractCars] }),
      collections: [collection(ids.cars, [])],
      carryFrom: [
        {
          collections: {
            [ids.cars]: {
              from: { collectionId: ids.cars, where: [] },
              fields: { [ids.titleField]: fixed },
            },
          },
        },
      ],
    });

    expect(carried.collections[ids.cars]?.fields[ids.titleField]).toEqual(
      fixed
    );
  });
});
