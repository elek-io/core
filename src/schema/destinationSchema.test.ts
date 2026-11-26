import { describe, expect, it } from 'vitest';
import { destinationFileSchema, fieldMappingSchema } from './index.js';

const ids = {
  destination: '00000000-0000-4000-8000-0000000000d0',
  contract: '00000000-0000-4000-8000-0000000000c0',
  cars: '00000000-0000-4000-8000-000000000001',
  ownCars: '00000000-0000-4000-8000-00000000000a',
  title: '00000000-0000-4000-8000-000000000011',
  headline: '00000000-0000-4000-8000-000000000012',
};

/** A `destination.json` as Core wrote one before a field had ways of filling */
const before = {
  objectType: 'destination',
  id: ids.destination,
  coreVersion: '0.28.0',
  created: '2026-11-24T00:00:00.000Z',
  updated: null,
  name: 'autohaus-ebersfelde.de',
  kind: 'website',
  contract: { id: ids.contract, version: '1.0.0' },
  mapping: {
    collections: {
      [ids.cars]: {
        from: { collectionId: ids.ownCars },
        fields: { [ids.title]: { fieldDefinitionId: ids.headline } },
      },
    },
  },
};

describe('destinationFileSchema', function () {
  it('reads a Destination written before a field had ways of filling', function () {
    const parsed = destinationFileSchema.parse(before);

    expect(parsed.mapping.collections[ids.cars]).toEqual({
      from: { collectionId: ids.ownCars, where: [] },
      fields: {
        [ids.title]: { fill: 'field', fieldDefinitionId: ids.headline },
      },
    });
    expect(parsed.waiting).toEqual(null);
    expect(parsed.createdFromTheme).toEqual({
      collectionIds: [],
      componentIds: [],
    });
  });

  it('reads the Mapping of a version that waits the same way', function () {
    const parsed = destinationFileSchema.parse({
      ...before,
      waiting: { version: '1.1.0', mapping: before.mapping },
    });

    expect(parsed.waiting?.mapping.collections[ids.cars]?.fields).toEqual({
      [ids.title]: { fill: 'field', fieldDefinitionId: ids.headline },
    });
  });
});

describe('fieldMappingSchema', function () {
  it('takes a fixed Value of every kind an editor types', function () {
    expect(
      fieldMappingSchema.parse({
        fill: 'fixed',
        value: {
          objectType: 'value',
          valueType: 'string',
          content: { en: 'Aus Ebersfelde' },
        },
      }).fill
    ).toEqual('fixed');
  });

  it('refuses a fixed reference, which carries ids of one Project', function () {
    expect(
      fieldMappingSchema.safeParse({
        fill: 'fixed',
        value: {
          objectType: 'value',
          valueType: 'reference',
          content: { en: [{ objectType: 'asset', id: ids.headline }] },
        },
      }).success
    ).toEqual(false);
  });

  it('joins two fields or more, with a space between them by default', function () {
    expect(
      fieldMappingSchema.parse({
        fill: 'combined',
        fieldDefinitionIds: [ids.headline, ids.title],
      })
    ).toEqual({
      fill: 'combined',
      fieldDefinitionIds: [ids.headline, ids.title],
      separator: ' ',
    });
    expect(
      fieldMappingSchema.safeParse({
        fill: 'combined',
        fieldDefinitionIds: [ids.headline],
      }).success
    ).toEqual(false);
  });

  it('refuses a language order holding no language', function () {
    expect(
      fieldMappingSchema.safeParse({
        fill: 'field',
        fieldDefinitionId: ids.headline,
        language: { order: [] },
      }).success
    ).toEqual(false);
  });
});
