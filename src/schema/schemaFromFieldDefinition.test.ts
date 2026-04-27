import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import type {
  ComponentValue,
  DirectBooleanValue,
  DirectNumberValue,
  DirectStringValue,
  Entry,
  ReferencedValue,
} from '../test/setup.js';
import {
  dynamicFieldDefinitionSchema,
  entrySchema,
  uuid,
} from '../test/setup.js';
import type { ProjectLanguages } from './projectSchema.js';
import { getValueSchemaFromFieldDefinition } from './schemaFromFieldDefinition.js';

const languages: ProjectLanguages = ['en'];

describe('Dynamic zod schema from field definition', () => {
  const defaultBooleanValue: DirectBooleanValue = {
    objectType: 'value',
    valueType: 'boolean',
    content: {},
  };
  const defaultNumberValue: DirectNumberValue = {
    objectType: 'value',
    valueType: 'number',
    content: {},
  };
  const defaultStringValue: DirectStringValue = {
    objectType: 'value',
    valueType: 'string',
    content: {},
  };
  const defaultReferenceValue: ReferencedValue = {
    objectType: 'value',
    valueType: 'reference',
    content: {},
  };

  it('from toggle Field definition can be generated and parsed with', () => {
    const booleanValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const requiredNumberValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const optionalNumberValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const requiredRangeValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const requiredTextValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const optionalTextValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const requiredEmailValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const optionalEmailValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const requiredUrlValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );

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
    const optionalUrlValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'string',
        fieldType: 'url',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: false,
        isUnique: false,
      },
      languages
    );
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
    const requiredIpValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'string',
        fieldType: 'ipv4',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      },
      languages
    );
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
    const requiredDateValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'string',
        fieldType: 'date',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      },
      languages
    );
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
    const requiredTimeValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'string',
        fieldType: 'time',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      },
      languages
    );
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
    const requiredDatetimeValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'string',
        fieldType: 'datetime',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      },
      languages
    );
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
    const requiredTelephoneValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'string',
        fieldType: 'telephone',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        defaultValue: null,
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      },
      languages
    );
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
    const requiredAssetValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );
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
    const optionalAssetValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );
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
    const requiredAssetValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
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
      },
      languages
    );
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
    const allowedCollectionId = uuid();
    const requiredEntryValueschema = getValueSchemaFromFieldDefinition(
      {
        id: uuid(),
        slug: 'test-field',
        valueType: 'reference',
        fieldType: 'entry',
        label: { en: 'Test' },
        description: { en: 'Test' },
        inputWidth: '12',
        min: null,
        max: null,
        ofCollections: [allowedCollectionId],
        isDisabled: false,
        isRequired: true,
        isUnique: false,
      },
      languages
    );
    requiredEntryValueschema.parse({
      ...defaultReferenceValue,
      content: {
        en: [
          {
            objectType: 'entry',
            id: uuid(),
            collectionId: allowedCollectionId,
          },
        ],
      },
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
      coreVersion: '0.16.2',
      values: {
        title: {
          objectType: 'value',
          valueType: 'string',
          content: {
            en: 'Bacon',
          },
        },
        image: {
          objectType: 'value',
          valueType: 'reference',
          content: {
            en: [
              {
                id: '6e40e9b2-6393-46a4-be0c-1e151a947373',
                objectType: 'asset',
              },
            ],
          },
        },
        'related-entries': {
          objectType: 'value',
          valueType: 'reference',
          content: {
            en: [
              {
                id: 'ea6a7da3-9cb4-4dd5-aa81-83b6f657106f',
                objectType: 'entry',
                collectionId: 'a1b2c3d4-5678-4abc-8ef0-123456789abc',
              },
            ],
          },
        },
      },
      created: '2024-07-16T12:42:27.897Z',
      updated: null,
    };

    entrySchema.parse(entry);
  });

  describe('from dynamic (component) Field definition', () => {
    const componentId1 = uuid();
    const componentId2 = uuid();

    const componentResolver = (id: string) => {
      if (id === componentId1) {
        return [
          {
            id: uuid(),
            slug: 'title',
            fieldType: 'text' as const,
            valueType: 'string' as const,
            label: { en: 'Title' },
            description: null,
            defaultValue: null,
            isRequired: true,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12' as const,
            min: null,
            max: null,
          },
          {
            id: uuid(),
            slug: 'image',
            fieldType: 'asset' as const,
            valueType: 'reference' as const,
            label: { en: 'Image' },
            description: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false as const,
            inputWidth: '12' as const,
            min: null,
            max: null,
          },
        ];
      }
      if (id === componentId2) {
        return [
          {
            id: uuid(),
            slug: 'count',
            fieldType: 'number' as const,
            valueType: 'number' as const,
            label: { en: 'Count' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false as const,
            inputWidth: '12' as const,
            min: null,
            max: null,
          },
        ];
      }
      throw new Error(`Unknown component: ${id}`);
    };

    const dynamicFieldDef = {
      id: uuid(),
      slug: 'blocks',
      fieldType: 'dynamic' as const,
      valueType: 'component' as const,
      label: { en: 'Blocks' },
      description: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false as const,
      inputWidth: '12' as const,
      ofComponents: [componentId1],
      min: null,
      max: null,
    };

    const validComponentValue: ComponentValue = {
      objectType: 'value',
      valueType: 'component',
      content: [
        {
          id: uuid(),
          componentId: componentId1,
          values: {
            title: {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'Block 1' },
            },
            image: {
              objectType: 'value',
              valueType: 'reference',
              content: { en: [{ id: uuid(), objectType: 'asset' }] },
            },
          },
        },
      ],
    };

    it('can be generated and parsed with a valid component value', () => {
      const schema = getValueSchemaFromFieldDefinition(
        dynamicFieldDef,
        languages,
        componentResolver
      );
      schema.parse(validComponentValue);
    });

    it('accepts an empty content array when not required', () => {
      const schema = getValueSchemaFromFieldDefinition(
        dynamicFieldDef,
        languages,
        componentResolver
      );
      schema.parse({ ...validComponentValue, content: [] });
    });

    it('rejects an empty array when isRequired is true', () => {
      const requiredDef = { ...dynamicFieldDef, isRequired: true };
      const schema = getValueSchemaFromFieldDefinition(
        requiredDef,
        languages,
        componentResolver
      );
      expect(() =>
        schema.parse({ ...validComponentValue, content: [] })
      ).toThrow();
    });

    it('rejects fewer items than min', () => {
      const minDef = { ...dynamicFieldDef, min: 2 };
      const schema = getValueSchemaFromFieldDefinition(
        minDef,
        languages,
        componentResolver
      );
      expect(() => schema.parse(validComponentValue)).toThrow();
    });

    it('rejects more items than max', () => {
      const maxDef = { ...dynamicFieldDef, max: 1 };
      const schema = getValueSchemaFromFieldDefinition(
        maxDef,
        languages,
        componentResolver
      );
      const twoItemValue: ComponentValue = {
        ...validComponentValue,
        content: [
          validComponentValue.content[0]!,
          validComponentValue.content[0]!,
        ],
      };
      expect(() => schema.parse(twoItemValue)).toThrow();
    });

    it('rejects an item where a required sub-field has an empty string content', () => {
      const schema = getValueSchemaFromFieldDefinition(
        dynamicFieldDef,
        languages,
        componentResolver
      );
      const invalidValue: ComponentValue = {
        ...validComponentValue,
        content: [
          {
            id: uuid(),
            componentId: componentId1,
            values: {
              title: {
                objectType: 'value',
                valueType: 'string',
                content: { en: '' },
              },
              image: validComponentValue.content[0]!.values['image']!,
            },
          },
        ],
      };
      expect(() => schema.parse(invalidValue)).toThrow();
    });

    it('works with multiple components (discriminated union)', () => {
      const multiDef = {
        ...dynamicFieldDef,
        ofComponents: [componentId1, componentId2],
      };
      const schema = getValueSchemaFromFieldDefinition(
        multiDef,
        languages,
        componentResolver
      );
      const mixedValue: ComponentValue = {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: uuid(),
            componentId: componentId1,
            values: {
              title: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Hello' },
              },
              image: {
                objectType: 'value',
                valueType: 'reference',
                content: { en: [{ id: uuid(), objectType: 'asset' }] },
              },
            },
          },
          {
            id: uuid(),
            componentId: componentId2,
            values: {
              count: {
                objectType: 'value',
                valueType: 'number',
                content: { en: 42 },
              },
            },
          },
        ],
      };
      schema.parse(mixedValue);
    });

    it('detects circular component references during schema generation', () => {
      const circularId = uuid();
      const circularResolver = (id: string) => {
        if (id === circularId) {
          return [
            {
              id: uuid(),
              slug: 'nested',
              fieldType: 'dynamic' as const,
              valueType: 'component' as const,
              label: { en: 'Nested' },
              description: null,
              isRequired: false,
              isDisabled: false,
              isUnique: false as const,
              inputWidth: '12' as const,
              ofComponents: [circularId],
              min: null,
              max: null,
            },
          ];
        }
        throw new Error(`Unknown component: ${id}`);
      };
      const circularDef = {
        ...dynamicFieldDef,
        ofComponents: [circularId],
      };
      expect(() =>
        getValueSchemaFromFieldDefinition(
          circularDef,
          languages,
          circularResolver
        )
      ).toThrow(/[Cc]ircular/);
    });
  });
});

describe('dynamicFieldDefinitionSchema validation', () => {
  const baseDynamicDef = {
    id: uuid(),
    slug: 'blocks',
    fieldType: 'dynamic' as const,
    valueType: 'component' as const,
    label: { en: 'Blocks' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false as const,
    inputWidth: '12' as const,
    ofComponents: [uuid()],
    min: null,
    max: null,
  };

  it('accepts a valid dynamic field definition', () => {
    dynamicFieldDefinitionSchema.parse(baseDynamicDef);
  });

  it('rejects isUnique: true', () => {
    expect(() =>
      dynamicFieldDefinitionSchema.parse({ ...baseDynamicDef, isUnique: true })
    ).toThrow();
  });

  it('accepts empty ofComponents array (means all components allowed)', () => {
    dynamicFieldDefinitionSchema.parse({
      ...baseDynamicDef,
      ofComponents: [],
    });
  });

  it('rejects min > max', () => {
    expect(() =>
      dynamicFieldDefinitionSchema.parse({ ...baseDynamicDef, min: 5, max: 3 })
    ).toThrow();
  });

  it('accepts min === max', () => {
    dynamicFieldDefinitionSchema.parse({ ...baseDynamicDef, min: 2, max: 2 });
  });

  it('accepts min < max', () => {
    dynamicFieldDefinitionSchema.parse({ ...baseDynamicDef, min: 1, max: 5 });
  });
});

describe('getValueSchemaFromFieldDefinition with empty ofComponents', () => {
  // A no-op resolver - with empty ofComponents the resolver is never called,
  // but the function signature still requires one.
  const noopResolver = () => {
    throw new Error('Should not be called');
  };

  it('generates a permissive schema when ofComponents is empty', () => {
    const dynamicFieldDef = {
      id: uuid(),
      slug: 'blocks',
      fieldType: 'dynamic' as const,
      valueType: 'component' as const,
      label: { en: 'Blocks' },
      description: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false as const,
      inputWidth: '12' as const,
      ofComponents: [] as string[],
      min: null,
      max: null,
    };

    // Should not throw - empty ofComponents means "all allowed"
    const schema = getValueSchemaFromFieldDefinition(
      dynamicFieldDef,
      languages,
      noopResolver
    );
    schema.parse({
      objectType: 'value',
      valueType: 'component',
      content: [
        {
          id: uuid(),
          componentId: uuid(),
          values: {
            title: {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'Hello' },
            },
          },
        },
      ],
    });
  });

  it('throws when componentResolver is missing for component valueType', () => {
    const dynamicFieldDef = {
      id: uuid(),
      slug: 'blocks',
      fieldType: 'dynamic' as const,
      valueType: 'component' as const,
      label: { en: 'Blocks' },
      description: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false as const,
      inputWidth: '12' as const,
      ofComponents: [uuid()],
      min: null,
      max: null,
    };

    expect(() =>
      getValueSchemaFromFieldDefinition(dynamicFieldDef, languages)
    ).toThrow(
      'componentResolver is required for dynamic (component) field definitions'
    );
  });

  it('accepts empty content array with empty ofComponents', () => {
    const dynamicFieldDef = {
      id: uuid(),
      slug: 'blocks',
      fieldType: 'dynamic' as const,
      valueType: 'component' as const,
      label: { en: 'Blocks' },
      description: null,
      isRequired: false,
      isDisabled: false,
      isUnique: false as const,
      inputWidth: '12' as const,
      ofComponents: [] as string[],
      min: null,
      max: null,
    };

    const schema = getValueSchemaFromFieldDefinition(
      dynamicFieldDef,
      languages,
      noopResolver
    );
    schema.parse({
      objectType: 'value',
      valueType: 'component',
      content: [],
    });
  });
});

