import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import type {
  DirectBooleanValue,
  DirectNumberValue,
  DirectStringValue,
  Entry,
  ReferencedValue} from '../test/setup.js';
import {
  entrySchema,
  uuid,
} from '../test/setup.js';
import { getValueSchemaFromFieldDefinition } from './schemaFromFieldDefinition.js';

describe('Dynamic zod schema from field definition', () => {
  const defaultBooleanValue: DirectBooleanValue = {
    objectType: 'value',
    fieldDefinitionId: uuid(),
    valueType: 'boolean',
    content: {},
  };
  const defaultNumberValue: DirectNumberValue = {
    objectType: 'value',
    fieldDefinitionId: uuid(),
    valueType: 'number',
    content: {},
  };
  const defaultStringValue: DirectStringValue = {
    objectType: 'value',
    fieldDefinitionId: uuid(),
    valueType: 'string',
    content: {},
  };
  const defaultReferenceValue: ReferencedValue = {
    objectType: 'value',
    fieldDefinitionId: uuid(),
    valueType: 'reference',
    content: {},
  };

  it('from toggle Field definition can be generated and parsed with', () => {
    const booleanValueschema = getValueSchemaFromFieldDefinition({
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

    booleanValueschema.parse({
      ...defaultBooleanValue,
      content: { en: true },
    });
    booleanValueschema.parse({
      ...defaultBooleanValue,
      content: { en: false },
    });

    expect(() =>
      booleanValueschema.parse({
        ...defaultBooleanValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      booleanValueschema.parse({
        ...defaultBooleanValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      booleanValueschema.parse({
        ...defaultBooleanValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      booleanValueschema.parse({
        ...defaultBooleanValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      booleanValueschema.parse({
        ...defaultBooleanValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      booleanValueschema.parse({
        ...defaultBooleanValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required number Field type definition can be generated and parsed with', () => {
    const requiredNumberValueschema = getValueSchemaFromFieldDefinition({
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

    requiredNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: 5 },
    });
    requiredNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: 10 },
    });
    requiredNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: 7.5 },
    });

    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: 4 },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: 11 },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from optional number Field type definition can be generated and parsed with', () => {
    const optionalNumberValueschema = getValueSchemaFromFieldDefinition({
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

    optionalNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: 5 },
    });
    optionalNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: 10 },
    });
    optionalNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: 7.5 },
    });
    optionalNumberValueschema.parse({
      ...defaultNumberValue,
      content: { en: null },
    });

    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: 4 },
      })
    ).toThrow();
    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: 11 },
      })
    ).toThrow();
    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      optionalNumberValueschema.parse({
        ...defaultNumberValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required range Field type definition can be generated and parsed with', () => {
    const requiredRangeValueschema = getValueSchemaFromFieldDefinition({
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

    requiredRangeValueschema.parse({
      ...defaultNumberValue,
      content: { en: 5 },
    });
    requiredRangeValueschema.parse({
      ...defaultNumberValue,
      content: { en: 10 },
    });
    requiredRangeValueschema.parse({
      ...defaultNumberValue,
      content: { en: 7.5 },
    });

    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: 4 },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: 11 },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredRangeValueschema.parse({
        ...defaultNumberValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required text Field type definition can be generated and parsed with', () => {
    const requiredTextValueschema = getValueSchemaFromFieldDefinition({
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

    requiredTextValueschema.parse({
      ...defaultStringValue,
      content: { en: '123456' },
    });

    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: 4 },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: 11 },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: '1234' },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: '123456789' },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: '        ' },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredTextValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from optional text Field type definition can be generated and parsed with', () => {
    const optionalTextValueschema = getValueSchemaFromFieldDefinition({
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

    optionalTextValueschema.parse({
      ...defaultStringValue,
      content: { en: '123456' },
    });
    optionalTextValueschema.parse({
      ...defaultStringValue,
      content: { en: null },
    });

    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: 6 },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: 123456 },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: '        ' },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      optionalTextValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required email Field type definition can be generated and parsed with', () => {
    const requiredEmailValueschema = getValueSchemaFromFieldDefinition({
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

    requiredEmailValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.internet.email() },
    });

    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: 4 },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: 11 },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '1234' },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '123456789' },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '        ' },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from optional email Field type definition can be generated and parsed with', () => {
    const optionalEmailValueschema = getValueSchemaFromFieldDefinition({
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

    optionalEmailValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.internet.email() },
    });
    optionalEmailValueschema.parse({
      ...defaultStringValue,
      content: { en: null },
    });

    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: 4 },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: 11 },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '1234' },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '123456789' },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: '        ' },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      optionalEmailValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required url Field type definition can be generated and parsed with', () => {
    const requiredUrlValueschema = getValueSchemaFromFieldDefinition({
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

    requiredUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.internet.url({ protocol: 'http' }) },
    });
    requiredUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.internet.url({ protocol: 'https' }) },
    });
    requiredUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.internet.url({ appendSlash: true }) },
    });
    requiredUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: 'http://localhost/' },
    });
    requiredUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: 'https://localhost/' },
    });

    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: 'example.com' },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: 'https//example.com/' },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: 'https:' },
      })
    ).toThrow();

    // @todo The following (and possible more) URLs are passing although they should not. Zod v4 should provide better parsing
    // @see https://github.com/colinhacks/zod/issues/2236 and https://github.com/colinhacks/zod/pull/3049

    // expect(() =>
    //   requiredUrlValueschema.parse({...defaultStringValue, content: { en: 'https:/example.com/' } })
    // ).toThrow();
    // expect(() => requiredUrlValueschema.parse({...defaultStringValue, content: { en: 'https:example.com/' } })).toThrow();
    // expect(() =>
    //   requiredUrlValueschema.parse({...defaultStringValue, content: { en: 'https:.....///example.com/' } })
    // ).toThrow();

    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from optional url Field type definition can be generated and parsed with', () => {
    const optionalUrlValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'url',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });
    optionalUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: 'http://example.com' },
    });
    optionalUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: 'https://example.com' },
    });
    optionalUrlValueschema.parse({
      ...defaultStringValue,
      content: { en: null },
    });
    expect(() =>
      optionalUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      optionalUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      optionalUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      optionalUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      optionalUrlValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required ipv4 Field type definition can be generated and parsed with', () => {
    const requiredIpValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'ipv4',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredIpValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.internet.ipv4() },
    });
    expect(() =>
      requiredIpValueschema.parse({
        ...defaultStringValue,
        content: { en: faker.internet.ipv6() },
      })
    ).toThrow();
    expect(() =>
      requiredIpValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredIpValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredIpValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredIpValueschema.parse({ ...defaultStringValue, content: { en: 0 } })
    ).toThrow();
    expect(() =>
      requiredIpValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredIpValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required date Field type definition can be generated and parsed with', () => {
    const requiredDateValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'date',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    const date = faker.date.anytime().toISOString().split('T')[0];
    requiredDateValueschema.parse({
      ...defaultStringValue,
      content: { en: date },
    });
    expect(() =>
      requiredDateValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredDateValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredDateValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredDateValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredDateValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredDateValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required time Field type definition can be generated and parsed with', () => {
    const requiredTimeValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'time',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredTimeValueschema.parse({
      ...defaultStringValue,
      content: { en: '00:00:00' },
    });
    requiredTimeValueschema.parse({
      ...defaultStringValue,
      content: { en: '09:52:31' },
    });
    requiredTimeValueschema.parse({
      ...defaultStringValue,
      content: { en: '23:59:59.9999999' },
    });
    expect(() =>
      requiredTimeValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredTimeValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredTimeValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredTimeValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredTimeValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredTimeValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required datetime Field type definition can be generated and parsed with', () => {
    const requiredDatetimeValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'datetime',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    const datetime = faker.date.anytime().toISOString();
    requiredDatetimeValueschema.parse({
      ...defaultStringValue,
      content: { en: datetime },
    });
    expect(() =>
      requiredDatetimeValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredDatetimeValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredDatetimeValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredDatetimeValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredDatetimeValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredDatetimeValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required telephone Field type definition can be generated and parsed with', () => {
    const requiredTelephoneValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'string',
      fieldType: 'telephone',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      defaultValue: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredTelephoneValueschema.parse({
      ...defaultStringValue,
      content: { en: faker.phone.number({ style: 'international' }) },
    });
    expect(() =>
      requiredTelephoneValueschema.parse({
        ...defaultStringValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredTelephoneValueschema.parse({
        ...defaultStringValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredTelephoneValueschema.parse({
        ...defaultStringValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredTelephoneValueschema.parse({
        ...defaultStringValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredTelephoneValueschema.parse({
        ...defaultStringValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredTelephoneValueschema.parse({
        ...defaultStringValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required Asset Field type definition can be generated and parsed with', () => {
    const requiredAssetValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'asset',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      min: null,
      max: null,
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredAssetValueschema.parse({
      ...defaultReferenceValue,
      content: {
        en: [
          {
            objectType: 'asset',
            id: uuid(),
            language: 'en',
          },
        ],
      },
    });
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: [{ objectType: 'entry', id: uuid() }] },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from optional Asset Field type definition can be generated and parsed with', () => {
    const optionalAssetValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'asset',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      min: null,
      max: null,
      isDisabled: false,
      isRequired: false,
      isUnique: false,
    });
    optionalAssetValueschema.parse({
      ...defaultReferenceValue,
      content: { en: [{ objectType: 'asset', id: uuid(), language: 'en' }] },
    });
    optionalAssetValueschema.parse({
      ...defaultReferenceValue,
      content: { en: [] },
    });
    expect(() =>
      optionalAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      optionalAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      optionalAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      optionalAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      optionalAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required Asset Field type definition with a min and max can be generated and parsed with', () => {
    const requiredAssetValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'asset',
      label: { en: 'Test' },
      description: { en: 'Test' },
      min: 2,
      max: 3,
      inputWidth: '12',
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredAssetValueschema.parse({
      ...defaultReferenceValue,
      content: {
        en: [
          { objectType: 'asset', id: uuid(), language: 'en' },
          { objectType: 'asset', id: uuid(), language: 'en' },
        ],
      },
    });
    requiredAssetValueschema.parse({
      ...defaultReferenceValue,
      content: {
        en: [
          { objectType: 'asset', id: uuid(), language: 'en' },
          { objectType: 'asset', id: uuid(), language: 'en' },
          { objectType: 'asset', id: uuid(), language: 'en' },
        ],
      },
    });
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: [{ objectType: 'asset', id: uuid(), language: 'en' }] },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: {
          en: [
            { objectType: 'asset', id: uuid(), language: 'en' },
            { objectType: 'asset', id: uuid(), language: 'en' },
            { objectType: 'asset', id: uuid(), language: 'en' },
            { objectType: 'asset', id: uuid(), language: 'en' },
          ],
        },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredAssetValueschema.parse({
        ...defaultReferenceValue,
        content: { en: {} },
      })
    ).toThrow();
  });

  it('from required Entry Field type definition can be generated and parsed with', () => {
    const requiredEntryValueschema = getValueSchemaFromFieldDefinition({
      id: uuid(),
      valueType: 'reference',
      fieldType: 'entry',
      label: { en: 'Test' },
      description: { en: 'Test' },
      inputWidth: '12',
      min: null,
      max: null,
      ofCollections: [uuid()],
      isDisabled: false,
      isRequired: true,
      isUnique: false,
    });
    requiredEntryValueschema.parse({
      ...defaultReferenceValue,
      content: { en: [{ objectType: 'entry', id: uuid() }] },
    });
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: [] },
      })
    ).toThrow();
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: [{ objectType: 'asset', id: uuid() }] },
      })
    ).toThrow();
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: '' },
      })
    ).toThrow();
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: undefined },
      })
    ).toThrow();
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: null },
      })
    ).toThrow();
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: 0 },
      })
    ).toThrow();
    expect(() =>
      requiredEntryValueschema.parse({
        ...defaultReferenceValue,
        content: { en: {} },
      })
    ).toThrow();
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
                objectType: 'asset',
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
                objectType: 'entry',
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
