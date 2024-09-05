import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { entrySchema, uuid, type Entry } from '../test/setup.js';
import { getValueContentSchemaFromFieldDefinition } from './fieldSchema.js';

describe('Dynamic zod schema', () => {
  it('from toggle Field type definition can be generated and parsed with', () => {
    const booleanValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'boolean',
      fieldType: 'toggle',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      defaultValue: true,
      inputWidth: '12',
      isRequired: true,
      isDisabled: false,
      isUnique: false,
    });

    booleanValueschema.parse(true);
    booleanValueschema.parse(false);

    expect(() => booleanValueschema.parse('')).toThrow();
    expect(() => booleanValueschema.parse(0)).toThrow();
    expect(() => booleanValueschema.parse(undefined)).toThrow();
    expect(() => booleanValueschema.parse(null)).toThrow();
    expect(() => booleanValueschema.parse([])).toThrow();
    expect(() => booleanValueschema.parse({})).toThrow();
  });

  it('from required number Field type definition can be generated and parsed with', () => {
    const requiredNumberValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'number',
      fieldType: 'number',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      min: 5,
      max: 10,
      defaultValue: 7,
      inputWidth: '12',
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredNumberValueschema.parse(5);
    requiredNumberValueschema.parse(10);
    requiredNumberValueschema.parse(7.5);

    expect(() => requiredNumberValueschema.parse(4)).toThrow();
    expect(() => requiredNumberValueschema.parse(11)).toThrow();
    expect(() => requiredNumberValueschema.parse('')).toThrow();
    expect(() => requiredNumberValueschema.parse(0)).toThrow();
    expect(() => requiredNumberValueschema.parse(undefined)).toThrow();
    expect(() => requiredNumberValueschema.parse(null)).toThrow();
    expect(() => requiredNumberValueschema.parse([])).toThrow();
    expect(() => requiredNumberValueschema.parse({})).toThrow();
  });

  it('from optional number Field type definition can be generated and parsed with', () => {
    const optionalNumberValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'number',
      fieldType: 'number',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      min: 5,
      max: 10,
      defaultValue: 7,
      inputWidth: '12',
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });

    optionalNumberValueschema.parse(5);
    optionalNumberValueschema.parse(10);
    optionalNumberValueschema.parse(7.5);
    optionalNumberValueschema.parse(null);

    expect(() => optionalNumberValueschema.parse(4)).toThrow();
    expect(() => optionalNumberValueschema.parse(11)).toThrow();
    expect(() => optionalNumberValueschema.parse('')).toThrow();
    expect(() => optionalNumberValueschema.parse(undefined)).toThrow();
    expect(() => optionalNumberValueschema.parse(0)).toThrow();
    expect(() => optionalNumberValueschema.parse([])).toThrow();
    expect(() => optionalNumberValueschema.parse({})).toThrow();
  });

  it('from required range Field type definition can be generated and parsed with', () => {
    const requiredRangeValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'number',
      fieldType: 'range',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      min: 5,
      max: 10,
      defaultValue: 7,
      inputWidth: '12',
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredRangeValueschema.parse(5);
    requiredRangeValueschema.parse(10);
    requiredRangeValueschema.parse(7.5);

    expect(() => requiredRangeValueschema.parse(4)).toThrow();
    expect(() => requiredRangeValueschema.parse(11)).toThrow();
    expect(() => requiredRangeValueschema.parse('')).toThrow();
    expect(() => requiredRangeValueschema.parse(undefined)).toThrow();
    expect(() => requiredRangeValueschema.parse(null)).toThrow();
    expect(() => requiredRangeValueschema.parse(0)).toThrow();
    expect(() => requiredRangeValueschema.parse([])).toThrow();
    expect(() => requiredRangeValueschema.parse({})).toThrow();
  });

  it('from required text Field type definition can be generated and parsed with', () => {
    const requiredTextValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'text',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      min: 5,
      max: 8,
      defaultValue: 'Test',
      inputWidth: '12',
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredTextValueschema.parse('123456');

    expect(() => requiredTextValueschema.parse(4)).toThrow();
    expect(() => requiredTextValueschema.parse(11)).toThrow();
    expect(() => requiredTextValueschema.parse('')).toThrow();
    expect(() => requiredTextValueschema.parse('1234')).toThrow();
    expect(() => requiredTextValueschema.parse('123456789')).toThrow();
    expect(() => requiredTextValueschema.parse('        ')).toThrow();
    expect(() => requiredTextValueschema.parse(undefined)).toThrow();
    expect(() => requiredTextValueschema.parse(null)).toThrow();
    expect(() => requiredTextValueschema.parse(0)).toThrow();
    expect(() => requiredTextValueschema.parse([])).toThrow();
    expect(() => requiredTextValueschema.parse({})).toThrow();
  });

  it('from optional text Field type definition can be generated and parsed with', () => {
    const optionalTextValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'text',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      min: 5,
      max: 8,
      defaultValue: 'Test',
      inputWidth: '12',
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });

    optionalTextValueschema.parse('123456');
    optionalTextValueschema.parse(null);

    expect(() => optionalTextValueschema.parse(6)).toThrow();
    expect(() => optionalTextValueschema.parse(123456)).toThrow();
    expect(() => optionalTextValueschema.parse('')).toThrow();
    expect(() => optionalTextValueschema.parse('        ')).toThrow();
    expect(() => optionalTextValueschema.parse(undefined)).toThrow();
    expect(() => optionalTextValueschema.parse(0)).toThrow();
    expect(() => optionalTextValueschema.parse([])).toThrow();
    expect(() => optionalTextValueschema.parse({})).toThrow();
  });

  it('from required email Field type definition can be generated and parsed with', () => {
    const requiredEmailValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'email',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      defaultValue: null,
      inputWidth: '12',
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredEmailValueschema.parse(faker.internet.email());

    expect(() => requiredEmailValueschema.parse(4)).toThrow();
    expect(() => requiredEmailValueschema.parse(11)).toThrow();
    expect(() => requiredEmailValueschema.parse('')).toThrow();
    expect(() => requiredEmailValueschema.parse('1234')).toThrow();
    expect(() => requiredEmailValueschema.parse('123456789')).toThrow();
    expect(() => requiredEmailValueschema.parse('        ')).toThrow();
    expect(() => requiredEmailValueschema.parse(undefined)).toThrow();
    expect(() => requiredEmailValueschema.parse(null)).toThrow();
    expect(() => requiredEmailValueschema.parse(0)).toThrow();
    expect(() => requiredEmailValueschema.parse([])).toThrow();
    expect(() => requiredEmailValueschema.parse({})).toThrow();
  });

  it('from optional email Field type definition can be generated and parsed with', () => {
    const optionalEmailValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'email',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });

    optionalEmailValueschema.parse(faker.internet.email());
    optionalEmailValueschema.parse(null);

    expect(() => optionalEmailValueschema.parse(6)).toThrow();
    expect(() => optionalEmailValueschema.parse(123456)).toThrow();
    expect(() => optionalEmailValueschema.parse('')).toThrow();
    expect(() => optionalEmailValueschema.parse('        ')).toThrow();
    expect(() => optionalEmailValueschema.parse(undefined)).toThrow();
    expect(() => optionalEmailValueschema.parse(0)).toThrow();
    expect(() => optionalEmailValueschema.parse([])).toThrow();
    expect(() => optionalEmailValueschema.parse({})).toThrow();
  });

  it('from required url Field type definition can be generated and parsed with', () => {
    const requiredUrlValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'url',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredUrlValueschema.parse(faker.internet.url({ protocol: 'http' }));
    requiredUrlValueschema.parse(faker.internet.url({ protocol: 'https' }));
    requiredUrlValueschema.parse(faker.internet.url({ appendSlash: true }));
    requiredUrlValueschema.parse('http://localhost/');
    requiredUrlValueschema.parse('https://localhost/');

    expect(() => requiredUrlValueschema.parse('')).toThrow();
    expect(() => requiredUrlValueschema.parse('example.com')).toThrow();
    expect(() => requiredUrlValueschema.parse('https//example.com/')).toThrow();
    expect(() => requiredUrlValueschema.parse('https:')).toThrow();

    // @todo The following (and possible more) URLs are passing although they should not. Zod v4 should provide better parsing
    // @see https://github.com/colinhacks/zod/issues/2236 and https://github.com/colinhacks/zod/pull/3049

    // expect(() =>
    //   requiredUrlValueschema.parse('https:/example.com/')
    // ).toThrow();
    // expect(() => requiredUrlValueschema.parse('https:example.com/')).toBe(
    //   false
    // );
    // expect(() =>
    //   requiredUrlValueschema.parse('https:.....///example.com/')
    // ).toThrow();

    expect(() => requiredUrlValueschema.parse(undefined)).toThrow();
    expect(() => requiredUrlValueschema.parse(null)).toThrow();
    expect(() => requiredUrlValueschema.parse(0)).toThrow();
    expect(() => requiredUrlValueschema.parse([])).toThrow();
    expect(() => requiredUrlValueschema.parse({})).toThrow();
  });

  it('from optional url Field type definition can be generated and parsed with', () => {
    const optionalUrlValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'url',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });

    optionalUrlValueschema.parse('http://example.com');
    optionalUrlValueschema.parse('https://example.com');
    optionalUrlValueschema.parse(null);

    expect(() => optionalUrlValueschema.parse('')).toThrow();
    expect(() => optionalUrlValueschema.parse(undefined)).toThrow();
    expect(() => optionalUrlValueschema.parse(0)).toThrow();
    expect(() => optionalUrlValueschema.parse([])).toThrow();
    expect(() => optionalUrlValueschema.parse({})).toThrow();
  });

  it('from required ip Field type definition can be generated and parsed with', () => {
    const requiredIpValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'ip',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredIpValueschema.parse(faker.internet.ipv4());
    requiredIpValueschema.parse(faker.internet.ipv6());

    expect(() => requiredIpValueschema.parse('')).toThrow();
    expect(() => requiredIpValueschema.parse(undefined)).toThrow();
    expect(() => requiredIpValueschema.parse(null)).toThrow();
    expect(() => requiredIpValueschema.parse(0)).toThrow();
    expect(() => requiredIpValueschema.parse([])).toThrow();
    expect(() => requiredIpValueschema.parse({})).toThrow();
  });

  it('from required date Field type definition can be generated and parsed with', () => {
    const requiredDateValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'date',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    const date = faker.date.anytime().toISOString().split('T')[0];

    requiredDateValueschema.parse(date);

    expect(() => requiredDateValueschema.parse('')).toThrow();
    expect(() => requiredDateValueschema.parse(undefined)).toThrow();
    expect(() => requiredDateValueschema.parse(null)).toThrow();
    expect(() => requiredDateValueschema.parse(0)).toThrow();
    expect(() => requiredDateValueschema.parse([])).toThrow();
    expect(() => requiredDateValueschema.parse({})).toThrow();
  });

  it('from required time Field type definition can be generated and parsed with', () => {
    const requiredTimeValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'time',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredTimeValueschema.parse('00:00:00');
    requiredTimeValueschema.parse('09:52:31');
    requiredTimeValueschema.parse('23:59:59.9999999');

    expect(() => requiredTimeValueschema.parse('')).toThrow();
    expect(() => requiredTimeValueschema.parse(undefined)).toThrow();
    expect(() => requiredTimeValueschema.parse(null)).toThrow();
    expect(() => requiredTimeValueschema.parse(0)).toThrow();
    expect(() => requiredTimeValueschema.parse([])).toThrow();
    expect(() => requiredTimeValueschema.parse({})).toThrow();
  });

  it('from required datetime Field type definition can be generated and parsed with', () => {
    const requiredDatetimeValueschema =
      getValueContentSchemaFromFieldDefinition({
        id: uuid(),
        valueType: 'string',
        fieldType: 'datetime',
        label: {
          en: 'Test',
        },
        description: {
          en: 'Test',
        },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      });
    const datetime = faker.date.anytime().toISOString();

    requiredDatetimeValueschema.parse(datetime);

    expect(() => requiredDatetimeValueschema.parse('')).toThrow();
    expect(() => requiredDatetimeValueschema.parse(undefined)).toThrow();
    expect(() => requiredDatetimeValueschema.parse(null)).toThrow();
    expect(() => requiredDatetimeValueschema.parse(0)).toThrow();
    expect(() => requiredDatetimeValueschema.parse([])).toThrow();
    expect(() => requiredDatetimeValueschema.parse({})).toThrow();
  });

  it('from required telephone Field type definition can be generated and parsed with', () => {
    const requiredDatetimeValueschema =
      getValueContentSchemaFromFieldDefinition({
        id: uuid(),
        valueType: 'string',
        fieldType: 'telephone',
        label: {
          en: 'Test',
        },
        description: {
          en: 'Test',
        },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      });

    requiredDatetimeValueschema.parse(faker.phone.number());

    expect(() => requiredDatetimeValueschema.parse('')).toThrow();
    expect(() => requiredDatetimeValueschema.parse(undefined)).toThrow();
    expect(() => requiredDatetimeValueschema.parse(null)).toThrow();
    expect(() => requiredDatetimeValueschema.parse(0)).toThrow();
    expect(() => requiredDatetimeValueschema.parse([])).toThrow();
    expect(() => requiredDatetimeValueschema.parse({})).toThrow();
  });

  it('from required Asset Field type definition can be generated and parsed with', () => {
    const requiredAssetValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'asset',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      min: null,
      max: null,
      allowedMimeTypes: ['image/png'],
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredAssetValueschema.parse([
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
    ]);

    expect(() => requiredAssetValueschema.parse([])).toThrow();
    expect(() =>
      requiredAssetValueschema.parse([
        {
          objectType: 'entry',
          id: uuid(),
        },
      ])
    ).toThrow();
    expect(() => requiredAssetValueschema.parse('')).toThrow();
    expect(() => requiredAssetValueschema.parse(undefined)).toThrow();
    expect(() => requiredAssetValueschema.parse(null)).toThrow();
    expect(() => requiredAssetValueschema.parse(0)).toThrow();
    expect(() => requiredAssetValueschema.parse({})).toThrow();
  });

  it('from optional Asset Field type definition can be generated and parsed with', () => {
    const optionalAssetValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'asset',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      min: null,
      max: null,
      allowedMimeTypes: ['image/png'],
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });

    optionalAssetValueschema.parse([
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
    ]);

    optionalAssetValueschema.parse([]);

    expect(() => optionalAssetValueschema.parse('')).toThrow();
    expect(() => optionalAssetValueschema.parse(undefined)).toThrow();
    expect(() => optionalAssetValueschema.parse(null)).toThrow();
    expect(() => optionalAssetValueschema.parse(0)).toThrow();
    expect(() => optionalAssetValueschema.parse({})).toThrow();
  });

  it('from required Asset Field type definition with a min and max can be generated and parsed with', () => {
    const requiredAssetValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'asset',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      min: 2,
      max: 3,
      allowedMimeTypes: ['image/png'],
      inputWidth: '12',
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredAssetValueschema.parse([
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
    ]);

    requiredAssetValueschema.parse([
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
      {
        objectType: 'asset',
        id: uuid(),
        language: 'en',
      },
    ]);

    expect(() => requiredAssetValueschema.parse([])).toThrow();
    expect(() =>
      requiredAssetValueschema.parse([
        {
          objectType: 'asset',
          id: uuid(),
          language: 'en',
        },
      ])
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse([
        {
          objectType: 'asset',
          id: uuid(),
          language: 'en',
        },
        {
          objectType: 'asset',
          id: uuid(),
          language: 'en',
        },
        {
          objectType: 'asset',
          id: uuid(),
          language: 'en',
        },
        {
          objectType: 'asset',
          id: uuid(),
          language: 'en',
        },
      ])
    ).toThrow();
    expect(() => requiredAssetValueschema.parse('')).toThrow();
    expect(() => requiredAssetValueschema.parse(undefined)).toThrow();
    expect(() => requiredAssetValueschema.parse(null)).toThrow();
    expect(() => requiredAssetValueschema.parse(0)).toThrow();
    expect(() => requiredAssetValueschema.parse({})).toThrow();
  });

  it('from required Entry Field type definition can be generated and parsed with', () => {
    const requiredEntryValueschema = getValueContentSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'entry',
      label: {
        en: 'Test',
      },
      description: {
        en: 'Test',
      },
      inputWidth: '12',
      min: null,
      max: null,
      ofCollections: [uuid()],
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });

    requiredEntryValueschema.parse([
      {
        objectType: 'entry',
        id: uuid(),
      },
    ]);

    expect(() => requiredEntryValueschema.parse([])).toThrow();
    expect(() =>
      requiredEntryValueschema.parse([
        {
          objectType: 'asset',
          id: uuid(),
        },
      ])
    ).toThrow();
    expect(() => requiredEntryValueschema.parse('')).toThrow();
    expect(() => requiredEntryValueschema.parse(undefined)).toThrow();
    expect(() => requiredEntryValueschema.parse(null)).toThrow();
    expect(() => requiredEntryValueschema.parse(0)).toThrow();
    expect(() => requiredEntryValueschema.parse({})).toThrow();
  });

  it('circular dependencies / recursive types can be handled', () => {
    const entry: Entry = {
      objectType: 'entry',
      id: 'f405301c-3c31-4edd-ab6b-1735d2757044',
      values: [
        {
          objectType: 'value',
          valueType: 'string',
          fieldDefinitionId: 'e9da15ab-28e2-40fe-be78-de09bf1790b3',
          content: {
            en: 'Bacon',
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: '9a317f2c-db60-4929-8110-79905490aef3',
          content: {
            en: [
              {
                id: '6e40e9b2-6393-46a4-be0c-1e151a947373',
                created: '2024-07-16T12:42:27.897Z',
                updated: null,
                objectType: 'asset',
                name: 'elek.io',
                description: 'A 150x150 image of the text "elek.ioo"',
                extension: 'png',
                mimeType: 'image/png',
                size: 369,
                absolutePath:
                  '/Users/nkl/elek.io/projects/a6bb8e5a-b2f2-4304-9ab9-9822600115aa/lfs/6e40e9b2-6393-46a4-be0c-1e151a947373.en.png',
                history: [],
              },
            ],
          },
        },
        {
          objectType: 'value',
          valueType: 'reference',
          fieldDefinitionId: 'a7e3d49c-8565-4e79-9428-233968b73b27',
          content: {
            en: [
              {
                id: 'ea6a7da3-9cb4-4dd5-aa81-83b6f657106f',
                created: '2024-07-16T12:42:27.897Z',
                updated: null,
                objectType: 'entry',
                values: [
                  {
                    objectType: 'value',
                    fieldDefinitionId: 'e9da15ab-28e2-40fe-be78-de09bf1790b3',
                    valueType: 'string',
                    content: {
                      en: 'Cheese',
                    },
                  },
                  {
                    objectType: 'value',
                    fieldDefinitionId: '9a317f2c-db60-4929-8110-79905490aef3',
                    valueType: 'reference',
                    content: {
                      en: [
                        {
                          id: '6e40e9b2-6393-46a4-be0c-1e151a947373',
                          created: '2024-07-16T12:42:27.897Z',
                          updated: null,
                          objectType: 'asset',
                          name: 'elek.io',
                          description: 'A 150x150 image of the text "elek.ioo"',
                          extension: 'png',
                          mimeType: 'image/png',
                          size: 369,
                          absolutePath:
                            '/Users/nkl/elek.io/projects/a6bb8e5a-b2f2-4304-9ab9-9822600115aa/lfs/6e40e9b2-6393-46a4-be0c-1e151a947373.en.png',
                          history: [],
                        },
                      ],
                    },
                  },
                  {
                    objectType: 'value',
                    fieldDefinitionId: 'a7e3d49c-8565-4e79-9428-233968b73b27',
                    valueType: 'reference',
                    content: {
                      en: [],
                    },
                  },
                ],
                history: [],
              },
            ],
          },
        },
      ],
      history: [],
      created: '2024-07-16T12:42:27.897Z',
      updated: null,
    };

    entrySchema.parse(entry);
  });
});
