import { describe, expect, it } from 'vitest';
import {
  makeComponentsContext,
  type Component,
} from '../schema/componentSchema.js';
import type { Value } from '../schema/valueSchema.js';
import { transformEntryValues } from './transform.js';

const heroId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ctaId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

/**
 * A Component is only read for its id and slug here, so no field
 * definitions are needed
 */
function makeComponent(id: string, slug: string): Component {
  return {
    objectType: 'component',
    id,
    coreVersion: '1.0.0',
    created: '2026-01-01T00:00:00.000Z',
    updated: null,
    name: { en: slug },
    slug,
    description: null,
    fieldDefinitions: [],
  };
}

const noComponents = makeComponentsContext([]);
const components = makeComponentsContext([
  makeComponent(heroId, 'hero'),
  makeComponent(ctaId, 'cta'),
]);

describe('transformEntryValues', () => {
  it('transforms string values keyed by slug', () => {
    const values: Record<string, Value> = {
      title: {
        objectType: 'value',
        valueType: 'string',
        content: { en: 'Hello', de: 'Hallo' },
      },
    };

    const result = transformEntryValues(values, noComponents);

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

    const result = transformEntryValues(values, noComponents);

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

    const result = transformEntryValues(values, noComponents);

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

    const result = transformEntryValues(values, noComponents);

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

    const result = transformEntryValues(values, noComponents);

    expect(result).toEqual({
      title: { en: 'Title' },
      price: { en: 99 },
      published: { en: false },
    });
  });

  it('transforms component values with recursive nested values', () => {
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
        ],
      },
    };

    const result = transformEntryValues(values, components);

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
      ],
    });
  });

  it('names the Component of every item of a polymorphic dynamic field', () => {
    const values: Record<string, Value> = {
      sections: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            componentId: heroId,
            values: {},
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            componentId: ctaId,
            values: {},
          },
        ],
      },
    };

    const result = transformEntryValues(values, components);

    expect(result).toEqual({
      sections: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          componentId: heroId,
          componentSlug: 'hero',
          values: {},
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          componentId: ctaId,
          componentSlug: 'cta',
          values: {},
        },
      ],
    });
  });

  it('names the Component of nested component items too', () => {
    const values: Record<string, Value> = {
      sections: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            componentId: heroId,
            values: {
              'sub-blocks': {
                objectType: 'value',
                valueType: 'component',
                content: [
                  {
                    id: '33333333-3333-3333-3333-333333333333',
                    componentId: ctaId,
                    values: {},
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const result = transformEntryValues(values, components);

    expect(result).toEqual({
      sections: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          componentId: heroId,
          componentSlug: 'hero',
          values: {
            'sub-blocks': [
              {
                id: '33333333-3333-3333-3333-333333333333',
                componentId: ctaId,
                componentSlug: 'cta',
                values: {},
              },
            ],
          },
        },
      ],
    });
  });

  it('throws naming the Component and the field when an item does not resolve', () => {
    const values: Record<string, Value> = {
      sections: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            componentId: heroId,
            values: {},
          },
        ],
      },
    };

    expect(() => transformEntryValues(values, noComponents)).toThrow(
      `Component "${heroId}" referenced by dynamic field "sections" not found in Project`
    );
  });

  it('returns empty object for empty values record', () => {
    const result = transformEntryValues({}, noComponents);
    expect(result).toEqual({});
  });
});
