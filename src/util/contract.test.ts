import { describe, expect, it } from 'vitest';
import type {
  CollectionFile,
  ComponentFile,
  FieldDefinition,
} from '../schema/index.js';
import { missingContractReferences, referencedIdsOf } from './contract.js';

const ids = {
  cars: '00000000-0000-4000-8000-000000000001',
  dealers: '00000000-0000-4000-8000-000000000002',
  gone: '00000000-0000-4000-8000-00000000000f',
  hero: '00000000-0000-4000-8000-000000000003',
  dealerField: '00000000-0000-4000-8000-000000000011',
  blocksField: '00000000-0000-4000-8000-000000000012',
  titleField: '00000000-0000-4000-8000-000000000013',
};

function textField(id: string): FieldDefinition {
  return {
    id,
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

function entryField(id: string, ofCollections: string[]): FieldDefinition {
  return {
    id,
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

function dynamicField(id: string, ofComponents: string[]): FieldDefinition {
  return {
    id,
    slug: 'blocks',
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: 'Blocks' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofComponents,
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

function component(
  id: string,
  fieldDefinitions: FieldDefinition[]
): ComponentFile {
  return {
    objectType: 'component',
    id,
    coreVersion: '0.28.0',
    created: '2026-11-24T00:00:00.000Z',
    updated: null,
    name: { en: 'Hero' },
    slug: 'hero',
    description: null,
    fieldDefinitions,
  };
}

describe('referencedIdsOf', function () {
  it('names the Collections and Components a field definition points at', function () {
    const referenced = referencedIdsOf([
      entryField(ids.dealerField, [ids.dealers]),
      dynamicField(ids.blocksField, [ids.hero]),
    ]);

    expect([...referenced.collections]).toEqual([
      [ids.dealers, ids.dealerField],
    ]);
    expect([...referenced.components]).toEqual([[ids.hero, ids.blocksField]]);
  });

  it('names nothing for an empty list, which means every one of them', function () {
    const referenced = referencedIdsOf([
      entryField(ids.dealerField, []),
      dynamicField(ids.blocksField, []),
    ]);

    expect(referenced.collections.size).toEqual(0);
    expect(referenced.components.size).toEqual(0);
  });

  it('names nothing for a field that points at nothing', function () {
    const referenced = referencedIdsOf([textField(ids.titleField)]);

    expect(referenced.collections.size).toEqual(0);
    expect(referenced.components.size).toEqual(0);
  });
});

describe('missingContractReferences', function () {
  it('is empty when every reference is held', function () {
    expect(
      missingContractReferences({
        collections: [
          collection(ids.cars, [
            entryField(ids.dealerField, [ids.dealers]),
            dynamicField(ids.blocksField, [ids.hero]),
          ]),
          collection(ids.dealers, [textField(ids.titleField)]),
        ],
        components: [component(ids.hero, [textField(ids.titleField)])],
      })
    ).toEqual([]);
  });

  it('names a Collection a field definition points at and nothing holds', function () {
    expect(
      missingContractReferences({
        collections: [
          collection(ids.cars, [entryField(ids.dealerField, [ids.gone])]),
        ],
        components: [],
      })
    ).toEqual([
      {
        objectType: 'collection',
        id: ids.gone,
        referencedBy: ids.cars,
        fieldDefinitionId: ids.dealerField,
      },
    ]);
  });

  it('names a Component a field definition points at and nothing holds', function () {
    expect(
      missingContractReferences({
        collections: [
          collection(ids.cars, [dynamicField(ids.blocksField, [ids.gone])]),
        ],
        components: [],
      })
    ).toEqual([
      {
        objectType: 'component',
        id: ids.gone,
        referencedBy: ids.cars,
        fieldDefinitionId: ids.blocksField,
      },
    ]);
  });

  it("names one a Component's own field definition points at", function () {
    expect(
      missingContractReferences({
        collections: [],
        components: [
          component(ids.hero, [entryField(ids.dealerField, [ids.gone])]),
        ],
      })
    ).toEqual([
      {
        objectType: 'collection',
        id: ids.gone,
        referencedBy: ids.hero,
        fieldDefinitionId: ids.dealerField,
      },
    ]);
  });

  it('names one inside a group of field definitions', function () {
    const grouped = collection(ids.cars, []);
    grouped.fieldDefinitions = [
      {
        isGroup: true,
        id: '00000000-0000-4000-8000-0000000000a1',
        label: { en: 'Details' },
        description: null,
        fieldDefinitions: [entryField(ids.dealerField, [ids.gone])],
      },
    ];

    expect(
      missingContractReferences({ collections: [grouped], components: [] })
    ).toEqual([
      {
        objectType: 'collection',
        id: ids.gone,
        referencedBy: ids.cars,
        fieldDefinitionId: ids.dealerField,
      },
    ]);
  });
});
