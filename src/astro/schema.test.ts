import { describe, expect, it } from 'vitest';
import { z } from '@hono/zod-openapi';
import { v4 as uuid } from 'uuid';
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
        id: uuid(),
        slug: 'title',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const valid = { title: { en: 'Hello' } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for a number field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'price',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const valid = { price: { en: 50 } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects number outside of min/max range', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'price',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    expect(() => schema.parse({ price: { en: 200 } })).toThrow();
  });

  it('generates schema for a boolean (toggle) field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'active',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const valid = { active: { en: true } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects non-boolean for toggle field', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'active',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    expect(() =>
      schema.parse({
        active: { en: 'not-boolean' },
      })
    ).toThrow();
  });

  it('generates schema for an asset reference field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'image',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const valid = {
      image: {
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
        id: uuid(),
        slug: 'name',
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
        id: uuid(),
        slug: 'published',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const valid = {
      name: { en: 'Test' },
      published: { en: true },
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for a component (dynamic) field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'sections',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Sections' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [uuid()],
        min: null,
        max: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const valid = {
      sections: [
        {
          id: uuid(),
          componentId: uuid(),
          values: { heading: { en: 'Hello' } },
        },
      ],
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('returns empty object schema for empty field definitions', () => {
    const schema = buildEntryValuesSchema([], ['en']);
    expect(schema.parse({})).toEqual({});
  });
});

describe('z.toJSONSchema() compatibility', () => {
  it('produces valid JSON Schema for entry values schema', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
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
        id: uuid(),
        slug: 'count',
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

    const schema = buildEntryValuesSchema(fieldDefs, ['en']);
    const jsonSchema = z.toJSONSchema(schema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toHaveProperty('title');
    expect(jsonSchema.properties).toHaveProperty('count');
  });

  it('produces valid JSON Schema for assetSchema with .openapi() metadata', () => {
    const jsonSchema = z.toJSONSchema(assetSchema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('id');
    expect(properties).toHaveProperty('extension');
    expect(properties).toHaveProperty('absolutePath');
  });

  it('produces valid JSON Schema for empty entry values schema', () => {
    const schema = buildEntryValuesSchema([], ['en']);
    const jsonSchema = z.toJSONSchema(schema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
  });
});

describe('buildEntryValuesTypeString', () => {
  it('generates TypeScript type string for field definitions', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
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
        id: uuid(),
        slug: 'count',
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
        id: uuid(),
        slug: 'active',
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
        id: uuid(),
        slug: 'image',
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

    const types = buildEntryValuesTypeString(fieldDefs, ['en']);

    expect(types).toContain('export type Entry');
    expect(types).toContain('"title"');
    expect(types).toContain('"count"');
    expect(types).toContain('"active"');
    expect(types).toContain('"image"');
    expect(types).toContain('string');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
    expect(types).toContain('Array<{ id: string; objectType: string }>');
    expect(types).toContain('ProjectLanguage');
  });

  it('generates TypeScript type string for component field definitions', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'sections',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Sections' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [uuid()],
        min: null,
        max: null,
      },
    ];

    const types = buildEntryValuesTypeString(fieldDefs, ['en']);

    expect(types).toContain('"sections"');
    expect(types).toContain('componentId');
  });

  it('uses project language values in the generated type', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
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

    const projectLanguages = ['en', 'de'] as const;
    const types = buildEntryValuesTypeString(fieldDefs, [...projectLanguages]);

    // Should contain only project languages, not all 23
    for (const lang of projectLanguages) {
      expect(types).toContain(`"${lang}"`);
    }
    // Should use ProjectLanguage type, not SupportedLanguage
    expect(types).toContain('ProjectLanguage');
    expect(types).not.toContain('SupportedLanguage');
    // Should use Record, not Partial<Record>
    expect(types).toContain('Record<ProjectLanguage');
    expect(types).not.toContain('Partial<Record');
  });

  it('returns empty Record type for empty field definitions', () => {
    const types = buildEntryValuesTypeString([], ['en']);
    expect(types).toBe('export type Entry = Record<string, never>;');
  });

  it('returns unknown for unsupported valueType', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'weird',
        valueType: 'nonexistent' as never,
        fieldType: 'text' as never,
        label: { en: 'Weird' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ];

    const types = buildEntryValuesTypeString(fieldDefs, ['en']);
    expect(types).toContain('unknown');
  });
});
