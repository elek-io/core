import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import {
  makeComponentsContext,
  type ComponentsContext,
} from '../schema/componentSchema.js';
import type { Value } from '../schema/valueSchema.js';
import { CoreError } from '../util/shared.js';
import { transformEntryValues } from './transform.js';

const entryId = '99999999-9999-9999-9999-999999999999';

/** A Components context holding one Component per given id and slug. */
function contextOf(
  components: Array<{ id: string; slug: string }>
): ComponentsContext {
  return makeComponentsContext(
    components.map((component) => ({
      objectType: 'component',
      id: component.id,
      slug: component.slug,
      coreVersion: '0.0.0',
      name: { en: 'Component' },
      description: null,
      created: '2026-01-01T00:00:00.000Z',
      updated: null,
      fieldDefinitions: [],
    }))
  );
}

const noComponents = contextOf([]);

/** Runs the call and returns the `CoreError` it threw. */
function coreErrorFrom(call: () => unknown): CoreError {
  try {
    call();
  } catch (error) {
    if (error instanceof CoreError) return error;
    throw error;
  }
  throw new Error('Expected the call to throw a CoreError, it returned');
}

describe('transformEntryValues', () => {
  it('transforms string values keyed by slug', () => {
    const values: Record<string, Value> = {
      title: {
        objectType: 'value',
        valueType: 'string',
        content: { en: 'Hello', de: 'Hallo' },
      },
    };

    const result = transformEntryValues(values, noComponents, entryId);

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

    const result = transformEntryValues(values, noComponents, entryId);

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

    const result = transformEntryValues(values, noComponents, entryId);

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

    const result = transformEntryValues(values, noComponents, entryId);

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

    const result = transformEntryValues(values, noComponents, entryId);

    expect(result).toEqual({
      title: { en: 'Title' },
      price: { en: 99 },
      published: { en: false },
    });
  });

  it('returns empty object for empty values record', () => {
    const result = transformEntryValues({}, noComponents, entryId);
    expect(result).toEqual({});
  });
});

describe('transformEntryValues naming the Component of an item', () => {
  const heroId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const quoteId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  const ctx = contextOf([
    { id: heroId, slug: 'hero' },
    { id: quoteId, slug: 'quote' },
  ]);

  it('carries the slug of the Component alongside its id, per item', () => {
    const values: Record<string, Value> = {
      sections: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            componentId: heroId,
            values: {
              heading: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Welcome', de: 'Willkommen' },
              },
              visible: {
                objectType: 'value',
                valueType: 'boolean',
                content: { en: true },
              },
            },
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            componentId: quoteId,
            values: {},
          },
        ],
      },
    };

    const result = transformEntryValues(values, ctx, entryId);

    expect(result).toEqual({
      sections: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          componentId: heroId,
          componentSlug: 'hero',
          values: {
            heading: { en: 'Welcome', de: 'Willkommen' },
            visible: { en: true },
          },
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          componentId: quoteId,
          componentSlug: 'quote',
          values: {},
        },
      ],
    });
  });

  it('names the Component of a nested item too', () => {
    const values: Record<string, Value> = {
      sections: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            componentId: heroId,
            values: {
              quotes: {
                objectType: 'value',
                valueType: 'component',
                content: [
                  {
                    id: '33333333-3333-3333-3333-333333333333',
                    componentId: quoteId,
                    values: {
                      text: {
                        objectType: 'value',
                        valueType: 'string',
                        content: { en: 'Quoted' },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const result = transformEntryValues(values, ctx, entryId);

    expect(result).toEqual({
      sections: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          componentId: heroId,
          componentSlug: 'hero',
          values: {
            quotes: [
              {
                id: '33333333-3333-3333-3333-333333333333',
                componentId: quoteId,
                componentSlug: 'quote',
                values: { text: { en: 'Quoted' } },
              },
            ],
          },
        },
      ],
    });
  });

  it('names the Entry, the field and the Component of an item that cannot be resolved', () => {
    const missingId = uuid();
    const values: Record<string, Value> = {
      sections: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            componentId: missingId,
            values: {
              heading: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Text an editor typed' },
              },
            },
          },
        ],
      },
    };

    const error = coreErrorFrom(() =>
      transformEntryValues(values, ctx, entryId)
    );

    expect(error.type).toBe('NotFound');
    expect(error.message).toContain(missingId);
    expect(error.message).toContain('sections');
    expect(error.message).toContain(entryId);
    // Nothing an editor typed, so the message can go into a log file
    expect(error.message).not.toContain('Text an editor typed');
  });
});
