import { describe, expect, it } from 'vitest';
import type { Value } from '../schema/valueSchema.js';
import { transformEntryValues } from './transform.js';

describe('transformEntryValues', () => {
  it('transforms string values keyed by field definition ID', () => {
    const values: Value[] = [
      {
        objectType: 'value',
        valueType: 'string',
        fieldDefinitionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        content: { en: 'Hello', de: 'Hallo' },
      },
    ];

    const result = transformEntryValues(values);

    expect(result).toEqual({
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { en: 'Hello', de: 'Hallo' },
    });
  });

  it('transforms number values', () => {
    const values: Value[] = [
      {
        objectType: 'value',
        valueType: 'number',
        fieldDefinitionId: '11111111-2222-3333-4444-555555555555',
        content: { en: 42, de: 42 },
      },
    ];

    const result = transformEntryValues(values);

    expect(result).toEqual({
      '11111111-2222-3333-4444-555555555555': { en: 42, de: 42 },
    });
  });

  it('transforms boolean values', () => {
    const values: Value[] = [
      {
        objectType: 'value',
        valueType: 'boolean',
        fieldDefinitionId: '22222222-3333-4444-5555-666666666666',
        content: { en: true },
      },
    ];

    const result = transformEntryValues(values);

    expect(result).toEqual({
      '22222222-3333-4444-5555-666666666666': { en: true },
    });
  });

  it('transforms reference values', () => {
    const values: Value[] = [
      {
        objectType: 'value',
        valueType: 'reference',
        fieldDefinitionId: '33333333-4444-5555-6666-777777777777',
        content: {
          en: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', objectType: 'asset' }],
        },
      },
    ];

    const result = transformEntryValues(values);

    expect(result).toEqual({
      '33333333-4444-5555-6666-777777777777': {
        en: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', objectType: 'asset' }],
      },
    });
  });

  it('transforms multiple values of different types', () => {
    const values: Value[] = [
      {
        objectType: 'value',
        valueType: 'string',
        fieldDefinitionId: 'aaaaaaaa-1111-1111-1111-111111111111',
        content: { en: 'Title' },
      },
      {
        objectType: 'value',
        valueType: 'number',
        fieldDefinitionId: 'bbbbbbbb-2222-2222-2222-222222222222',
        content: { en: 99 },
      },
      {
        objectType: 'value',
        valueType: 'boolean',
        fieldDefinitionId: 'cccccccc-3333-3333-3333-333333333333',
        content: { en: false },
      },
    ];

    const result = transformEntryValues(values);

    expect(result).toEqual({
      'aaaaaaaa-1111-1111-1111-111111111111': { en: 'Title' },
      'bbbbbbbb-2222-2222-2222-222222222222': { en: 99 },
      'cccccccc-3333-3333-3333-333333333333': { en: false },
    });
  });

  it('returns empty object for empty values array', () => {
    const result = transformEntryValues([]);
    expect(result).toEqual({});
  });
});
