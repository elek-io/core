import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  Contract,
  FieldDefinition,
  FieldDefinitionOrGroup,
  Uuid,
} from '../schema/index.js';
import { flattenFieldDefinitions } from '../schema/index.js';
import {
  contractComponentsNeeded,
  fieldDefinitionsFromContract,
} from './contractCreate.js';

const ids = {
  cars: '00000000-0000-4000-8000-000000000001',
  dealers: '00000000-0000-4000-8000-000000000002',
  hero: '00000000-0000-4000-8000-000000000003',
  gallery: '00000000-0000-4000-8000-000000000004',
  ownCars: '00000000-0000-4000-8000-00000000000a',
  ownDealers: '00000000-0000-4000-8000-00000000000b',
  ownHero: '00000000-0000-4000-8000-00000000000c',
  title: '00000000-0000-4000-8000-000000000011',
  dealer: '00000000-0000-4000-8000-000000000012',
  blocks: '00000000-0000-4000-8000-000000000013',
  slug: '00000000-0000-4000-8000-000000000014',
  group: '00000000-0000-4000-8000-000000000015',
};

function textField(id: Uuid, slug: string): FieldDefinition {
  return {
    id,
    slug,
    valueType: 'string',
    fieldType: 'text',
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

function entryField(id: Uuid, ofCollections: Uuid[]): FieldDefinition {
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

function dynamicField(id: Uuid, ofComponents: Uuid[]): FieldDefinition {
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

function slugField(id: Uuid, ofFieldDefinitions: Uuid[]): FieldDefinition {
  return {
    id,
    slug: 'url',
    valueType: 'string',
    fieldType: 'slug',
    label: { en: 'Url' },
    description: null,
    defaultValue: null,
    isRequired: false,
    isDisabled: false,
    isUnique: true,
    inputWidth: '12',
    separator: '-',
    lowercase: true,
    decamelize: true,
    ofFieldDefinitions,
  };
}

function component(id: Uuid, slug: string, fields: FieldDefinition[]) {
  const file: ComponentFile = {
    objectType: 'component',
    id,
    coreVersion: '0.28.0',
    created: '2026-11-26T00:00:00.000Z',
    updated: null,
    name: { en: slug },
    slug,
    description: null,
    fieldDefinitions: fields,
  };
  return file;
}

function contractOf(components: ComponentFile[]): Contract {
  return {
    name: '@acme/dealer-site',
    version: '1.0.0',
    languages: 'any',
    collections: [],
    components,
  };
}

/** Which Project Collection fills which Collection of the Contract */
const collectionIds = new Map<Uuid, Uuid>([
  [ids.cars, ids.ownCars],
  [ids.dealers, ids.ownDealers],
]);

describe('fieldDefinitionsFromContract', function () {
  it('gives every field and group an id of the Project', function () {
    const group: FieldDefinitionOrGroup = {
      isGroup: true,
      id: ids.group,
      label: { en: 'Details' },
      description: null,
      fieldDefinitions: [textField(ids.title, 'title')],
    };

    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [group],
      collectionIds,
      componentIds: new Map(),
    });

    const [first] = created.fieldDefinitions;
    if (first === undefined || 'isGroup' in first === false) {
      throw new Error('The group is gone');
    }
    expect(first.id).not.toEqual(ids.group);
    const inside = flattenFieldDefinitions(created.fieldDefinitions);
    expect(inside.map(({ slug }) => slug)).toEqual(['title']);
    expect(inside[0]?.id).not.toEqual(ids.title);
    expect(created.fieldDefinitionIds.get(ids.title)).toEqual(inside[0]?.id);
    expect(created.unfilled).toEqual([]);
  });

  it('points a reference at the Collection of the Project filling it', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [entryField(ids.dealer, [ids.dealers])],
      collectionIds,
      componentIds: new Map(),
    });

    expect(created.fieldDefinitions).toMatchObject([
      { ofCollections: [ids.ownDealers] },
    ]);
  });

  it('names a Collection of the Contract nothing fills', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [entryField(ids.dealer, [ids.gallery])],
      collectionIds,
      componentIds: new Map(),
    });

    expect(created.unfilled).toEqual([
      {
        objectType: 'collection',
        id: ids.gallery,
        fieldDefinitionId: ids.dealer,
      },
    ]);
  });

  it('keeps a list naming nothing in particular empty', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [
        entryField(ids.dealer, []),
        dynamicField(ids.blocks, []),
      ],
      collectionIds,
      componentIds: new Map(),
    });

    expect(created.fieldDefinitions).toMatchObject([
      { ofCollections: [] },
      { ofComponents: [] },
    ]);
    expect(created.unfilled).toEqual([]);
  });

  it('points a dynamic field at the Component of the Project it became', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [dynamicField(ids.blocks, [ids.hero])],
      collectionIds,
      componentIds: new Map([[ids.hero, ids.ownHero]]),
    });

    expect(created.fieldDefinitions).toMatchObject([
      { ofComponents: [ids.ownHero] },
    ]);
  });

  it('points a slug field at the new ids of its own sources', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [
        textField(ids.title, 'title'),
        slugField(ids.slug, [ids.title]),
      ],
      collectionIds,
      componentIds: new Map(),
    });

    const own = created.fieldDefinitionIds.get(ids.title);
    expect(created.fieldDefinitions[1]).toMatchObject({
      ofFieldDefinitions: [own],
    });
  });

  it('points a slug field at the field definition of the Project filling its source', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [slugField(ids.slug, [ids.title])],
      collectionIds,
      componentIds: new Map(),
      fieldDefinitionIds: new Map([[ids.title, ids.dealer]]),
    });

    expect(created.fieldDefinitions).toMatchObject([
      { ofFieldDefinitions: [ids.dealer] },
    ]);
    expect(created.unfilled).toEqual([]);
  });

  it('names a field of the Contract no field definition fills', function () {
    const created = fieldDefinitionsFromContract({
      fieldDefinitions: [slugField(ids.slug, [ids.title])],
      collectionIds,
      componentIds: new Map(),
    });

    expect(created.unfilled).toEqual([
      { objectType: 'field', id: ids.title, fieldDefinitionId: ids.slug },
    ]);
  });
});

describe('contractComponentsNeeded', function () {
  it('names every Component needed, the ones it needs itself first', function () {
    const gallery = component(ids.gallery, 'gallery', []);
    const hero = component(ids.hero, 'hero', [
      dynamicField(ids.blocks, [ids.gallery]),
    ]);

    expect(
      contractComponentsNeeded({
        fieldDefinitions: [dynamicField(ids.blocks, [ids.hero])],
        contract: contractOf([hero, gallery]),
      })
    ).toEqual({ components: [gallery, hero], unfilled: [], cyclic: [] });
  });

  it('needs none for a field naming no Component in particular', function () {
    expect(
      contractComponentsNeeded({
        fieldDefinitions: [dynamicField(ids.blocks, [])],
        contract: contractOf([component(ids.hero, 'hero', [])]),
      })
    ).toEqual({ components: [], unfilled: [], cyclic: [] });
  });

  it('names a Component the Contract does not hold', function () {
    expect(
      contractComponentsNeeded({
        fieldDefinitions: [dynamicField(ids.blocks, [ids.hero])],
        contract: contractOf([]),
      })
    ).toEqual({
      components: [],
      unfilled: [
        {
          objectType: 'component',
          id: ids.hero,
          fieldDefinitionId: ids.blocks,
        },
      ],
      cyclic: [],
    });
  });

  it('names Components pointing at each other', function () {
    const hero = component(ids.hero, 'hero', [
      dynamicField(ids.blocks, [ids.gallery]),
    ]);
    const gallery = component(ids.gallery, 'gallery', [
      dynamicField(ids.blocks, [ids.hero]),
    ]);

    // No order writes the two with the lists they name, so they are named
    // rather than written with a list short of one
    expect(
      contractComponentsNeeded({
        fieldDefinitions: [dynamicField(ids.blocks, [ids.hero])],
        contract: contractOf([hero, gallery]),
      })
    ).toEqual({
      components: [gallery, hero],
      unfilled: [],
      cyclic: ['hero'],
    });
  });

  it('names a Component naming itself', function () {
    const hero = component(ids.hero, 'hero', [
      dynamicField(ids.blocks, [ids.hero]),
    ]);

    expect(
      contractComponentsNeeded({
        fieldDefinitions: [dynamicField(ids.blocks, [ids.hero])],
        contract: contractOf([hero]),
      }).cyclic
    ).toEqual(['hero']);
  });
});
