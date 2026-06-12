import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { DirectStringValue, Value } from '../schema/valueSchema.js';
import {
  detectUniqueValueCollisions,
  extractUniqueFieldValues,
  getUniqueFieldDefinitions,
  isUniqueFieldDefinition,
} from './uniqueFieldValues.js';

function textField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: uuid(),
    slug: 'name',
    valueType: 'string',
    fieldType: 'text',
    label: { en: 'Name' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    defaultValue: null,
    min: null,
    max: null,
    ...overrides,
  } as FieldDefinition;
}

function numberField(): FieldDefinition {
  return {
    id: uuid(),
    slug: 'count',
    valueType: 'number',
    fieldType: 'number',
    label: { en: 'Count' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    defaultValue: null,
    min: null,
    max: null,
  };
}

function stringValue(
  content: Record<string, string | null>
): DirectStringValue {
  return { objectType: 'value', valueType: 'string', content };
}

describe('isUniqueFieldDefinition / getUniqueFieldDefinitions', () => {
  it('matches slug fields and unique string fields, not others', () => {
    const unique = textField({ slug: 'a', isUnique: true });
    const slugField = textField({ slug: 'b', fieldType: 'slug' });
    const plain = textField({ slug: 'c', isUnique: false });
    const number = numberField();

    expect(isUniqueFieldDefinition(unique)).toBe(true);
    expect(isUniqueFieldDefinition(slugField)).toBe(true);
    expect(isUniqueFieldDefinition(plain)).toBe(false);
    expect(isUniqueFieldDefinition(number)).toBe(false);

    expect(
      getUniqueFieldDefinitions([unique, slugField, plain, number]).map(
        (f) => f.slug
      )
    ).toEqual(['a', 'b']);
  });
});

describe('extractUniqueFieldValues', () => {
  it('extracts non-null values per language, skipping nulls and non-unique fields', () => {
    const unique = textField({ slug: 'sku', isUnique: true });
    const plain = textField({ slug: 'name', isUnique: false });
    const values: Record<string, Value> = {
      sku: stringValue({ en: 'A-1', de: null }),
      name: stringValue({ en: 'ignored' }),
    };

    const extracted = extractUniqueFieldValues([unique, plain], values);
    expect(extracted).toEqual([
      {
        fieldDefinitionId: unique.id,
        fieldSlug: 'sku',
        language: 'en',
        value: 'A-1',
      },
    ]);
  });
});

describe('detectUniqueValueCollisions', () => {
  const unique = textField({ slug: 'sku', isUnique: true });

  it('flags two entries sharing a value in the same language', () => {
    const a = uuid();
    const b = uuid();
    const collisions = detectUniqueValueCollisions(
      [unique],
      [
        { entryId: a, values: { sku: stringValue({ en: 'X' }) } },
        { entryId: b, values: { sku: stringValue({ en: 'X' }) } },
      ]
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.entryIds).toEqual([a, b]);
  });

  it('does not flag the same value across different languages', () => {
    const collisions = detectUniqueValueCollisions(
      [unique],
      [
        { entryId: uuid(), values: { sku: stringValue({ en: 'X' }) } },
        { entryId: uuid(), values: { sku: stringValue({ de: 'X' }) } },
      ]
    );
    expect(collisions).toHaveLength(0);
  });

  it('does not flag multiple null / unset values', () => {
    const collisions = detectUniqueValueCollisions(
      [unique],
      [
        { entryId: uuid(), values: { sku: stringValue({ en: null }) } },
        { entryId: uuid(), values: {} },
      ]
    );
    expect(collisions).toHaveLength(0);
  });
});
