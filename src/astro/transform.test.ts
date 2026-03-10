import { describe, expect, it } from 'vitest';
import type { Value } from '../schema/valueSchema.js';
import { transformEntryValues } from './transform.js';

describe('transformEntryValues', () => {
  it('transforms string values keyed by slug', () => {
    const values: Record<string, Value> = {
      title: {
        objectType: 'value',
        valueType: 'string',
        content: { en: 'Hello', de: 'Hallo' },
      },
    };

    const result = transformEntryValues(values);

    expect(result).toEqual({
      title: { en: 'Hello', de: 'Hallo' },
    });
  });

  it('transforms number values', () => {
    const values: Record<string, Value> = {
      count: {
        objectType: 'value',
        valueType: 'number',
        content: { en: 42, de: 42 },
      },
    };

    const result = transformEntryValues(values);

    expect(result).toEqual({
      count: { en: 42, de: 42 },
    });
  });

  it('transforms boolean values', () => {
    const values: Record<string, Value> = {
      active: {
        objectType: 'value',
        valueType: 'boolean',
        content: { en: true },
      },
    };

    const result = transformEntryValues(values);

    expect(result).toEqual({
      active: { en: true },
    });
  });

  it('transforms reference values', () => {
    const values: Record<string, Value> = {
      image: {
        objectType: 'value',
        valueType: 'reference',
        content: {
          en: [
            { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', objectType: 'asset' },
          ],
        },
      },
    };

    const result = transformEntryValues(values);

    expect(result).toEqual({
      image: {
        en: [
          { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', objectType: 'asset' },
        ],
      },
    });
  });

  it('transforms multiple values of different types', () => {
    const values: Record<string, Value> = {
      title: {
        objectType: 'value',
        valueType: 'string',
        content: { en: 'Title' },
      },
      price: {
        objectType: 'value',
        valueType: 'number',
        content: { en: 99 },
      },
      published: {
        objectType: 'value',
        valueType: 'boolean',
        content: { en: false },
      },
    };

    const result = transformEntryValues(values);

    expect(result).toEqual({
      title: { en: 'Title' },
      price: { en: 99 },
      published: { en: false },
    });
  });

  it('returns empty object for empty values record', () => {
    const result = transformEntryValues({});
    expect(result).toEqual({});
  });
});
