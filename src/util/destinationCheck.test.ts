import { describe, expect, it } from 'vitest';
import type {
  CollectionFile,
  ComponentFile,
  Contract,
  EntryFile,
  FieldDefinition,
  Mapping,
  ProjectLanguages,
  Value,
} from '../schema/index.js';
import {
  entryIssuesOf,
  isValueIssue,
  mappingByMatchingIds,
  mappingIssuesOf,
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
          from: { collectionId: mapped.from },
          fields: Object.fromEntries(
            mapped.fields.map((fieldId) => [
              fieldId,
              { fieldDefinitionId: fieldId },
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
