import { describe, expect, it } from 'vitest';
import { z } from '@hono/zod-openapi';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import { assetSchema } from '../schema/assetSchema.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
} from './schema.js';

describe('buildEntryValuesSchema', () => {
  it('generates schema for a text field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    const valid = { 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { en: 'Hello' } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for a number field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Price' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: 0,
        max: 1000,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    const valid = { '11111111-2222-3333-4444-555555555555': { en: 50 } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects number outside of min/max range', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Price' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: 0,
        max: 100,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    expect(() =>
      schema.parse({ '11111111-2222-3333-4444-555555555555': { en: 200 } })
    ).toThrow();
  });

  it('generates schema for a boolean (toggle) field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: '22222222-3333-4444-5555-666666666666',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Active' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        defaultValue: false,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    const valid = { '22222222-3333-4444-5555-666666666666': { en: true } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects non-boolean for toggle field', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: '22222222-3333-4444-5555-666666666666',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Active' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        defaultValue: false,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    expect(() =>
      schema.parse({
        '22222222-3333-4444-5555-666666666666': { en: 'not-boolean' },
      })
    ).toThrow();
  });

  it('generates schema for an asset reference field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: '33333333-4444-5555-6666-777777777777',
        valueType: 'reference',
        fieldType: 'asset',
        label: { en: 'Image' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    const valid = {
      '33333333-4444-5555-6666-777777777777': {
        en: [
          { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', objectType: 'asset' },
        ],
      },
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for multiple field definitions', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: 'aaaaaaaa-1111-1111-1111-111111111111',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Name' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: 'bbbbbbbb-2222-2222-2222-222222222222',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Published' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '6',
        defaultValue: false,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    const valid = {
      'aaaaaaaa-1111-1111-1111-111111111111': { en: 'Test' },
      'bbbbbbbb-2222-2222-2222-222222222222': { en: true },
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('returns empty object schema for empty field definitions', () => {
    const schema = buildEntryValuesSchema([]);
    expect(schema.parse({})).toEqual({});
  });
});

describe('z.toJSONSchema() compatibility', () => {
  it('produces valid JSON Schema for entry values schema', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: '11111111-2222-3333-4444-555555555555',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Count' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs);
    const jsonSchema = z.toJSONSchema(schema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toHaveProperty(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    );
    expect(jsonSchema.properties).toHaveProperty(
      '11111111-2222-3333-4444-555555555555'
    );
  });

  it('produces valid JSON Schema for assetSchema with .openapi() metadata', () => {
    const jsonSchema = z.toJSONSchema(assetSchema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('id');
    expect(properties).toHaveProperty('extension');
    expect(properties).toHaveProperty('absolutePath');
    expect(properties).toHaveProperty('history');
  });

  it('produces valid JSON Schema for empty entry values schema', () => {
    const schema = buildEntryValuesSchema([]);
    const jsonSchema = z.toJSONSchema(schema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
  });
});

describe('buildEntryValuesTypeString', () => {
  it('generates TypeScript type string for field definitions', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: '11111111-2222-3333-4444-555555555555',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Count' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: '22222222-3333-4444-5555-666666666666',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Active' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        defaultValue: false,
      },
      {
        id: '33333333-4444-5555-6666-777777777777',
        valueType: 'reference',
        fieldType: 'asset',
        label: { en: 'Image' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
      },
    ];

    const types = buildEntryValuesTypeString(fieldDefs);

    expect(types).toContain('export type Entry');
    expect(types).toContain('"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"');
    expect(types).toContain('"11111111-2222-3333-4444-555555555555"');
    expect(types).toContain('"22222222-3333-4444-5555-666666666666"');
    expect(types).toContain('"33333333-4444-5555-6666-777777777777"');
    expect(types).toContain('string');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
    expect(types).toContain('Array<{ id: string; objectType: string }>');
    expect(types).toContain('SupportedLanguage');
  });

  it('returns empty Record type for empty field definitions', () => {
    const types = buildEntryValuesTypeString([]);
    expect(types).toBe('export type Entry = Record<string, never>;');
  });
});
