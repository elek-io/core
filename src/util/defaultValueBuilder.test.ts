import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { buildDefaultValue } from './defaultValueBuilder.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';

const languages: ProjectLanguages = ['en', 'de'];

function makeField(overrides: Record<string, unknown>): FieldDefinition {
  return {
    id: uuid(),
    slug: 'test',
    label: { en: 'Test' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ...overrides,
  } as FieldDefinition;
}

describe('buildDefaultValue', () => {
  describe('string fields', () => {
    it('returns string value with defaultValue when present', () => {
      const fd = makeField({
        valueType: 'string',
        fieldType: 'text',
        defaultValue: 'hello',
        min: null,
        max: null,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'string',
        content: { en: 'hello', de: 'hello' },
      });
    });

    it('returns null-content value for optional field without default', () => {
      const fd = makeField({
        valueType: 'string',
        fieldType: 'text',
        defaultValue: null,
        isRequired: false,
        min: null,
        max: null,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'string',
        content: { en: null, de: null },
      });
    });

    it('returns null for required field without default', () => {
      const fd = makeField({
        valueType: 'string',
        fieldType: 'text',
        defaultValue: null,
        isRequired: true,
        min: null,
        max: null,
      });
      expect(buildDefaultValue(fd, languages)).toBeNull();
    });
  });

  describe('number fields', () => {
    it('returns number value with defaultValue when present', () => {
      const fd = makeField({
        valueType: 'number',
        fieldType: 'number',
        defaultValue: 42,
        min: null,
        max: null,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'number',
        content: { en: 42, de: 42 },
      });
    });

    it('returns null for required number without default', () => {
      const fd = makeField({
        valueType: 'number',
        fieldType: 'number',
        defaultValue: null,
        isRequired: true,
        min: null,
        max: null,
      });
      expect(buildDefaultValue(fd, languages)).toBeNull();
    });

    it('returns null-content for optional number without default', () => {
      const fd = makeField({
        valueType: 'number',
        fieldType: 'number',
        defaultValue: null,
        isRequired: false,
        min: null,
        max: null,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'number',
        content: { en: null, de: null },
      });
    });
  });

  describe('boolean fields', () => {
    it('always returns boolean value with defaultValue', () => {
      const fd = makeField({
        valueType: 'boolean',
        fieldType: 'toggle',
        defaultValue: true,
        isRequired: true,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'boolean',
        content: { en: true, de: true },
      });
    });

    it('handles false defaultValue', () => {
      const fd = makeField({
        valueType: 'boolean',
        fieldType: 'toggle',
        defaultValue: false,
        isRequired: true,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'boolean',
        content: { en: false, de: false },
      });
    });
  });

  describe('reference fields', () => {
    it('returns empty arrays for optional reference field', () => {
      const fd = makeField({
        valueType: 'reference',
        fieldType: 'asset',
        isRequired: false,
        min: null,
        max: null,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'reference',
        content: { en: [], de: [] },
      });
    });

    it('returns null for required reference field', () => {
      const fd = makeField({
        valueType: 'reference',
        fieldType: 'asset',
        isRequired: true,
        min: null,
        max: null,
      });
      expect(buildDefaultValue(fd, languages)).toBeNull();
    });
  });

  describe('component fields', () => {
    it('returns empty content array for optional component field', () => {
      const fd = makeField({
        valueType: 'component',
        fieldType: 'dynamic',
        isRequired: false,
        ofComponents: [],
        min: null,
        max: null,
      });
      const result = buildDefaultValue(fd, languages);
      expect(result).toEqual({
        objectType: 'value',
        valueType: 'component',
        content: [],
      });
    });

    it('returns null for required component field', () => {
      const fd = makeField({
        valueType: 'component',
        fieldType: 'dynamic',
        isRequired: true,
        ofComponents: [],
        min: null,
        max: null,
      });
      expect(buildDefaultValue(fd, languages)).toBeNull();
    });
  });
});
