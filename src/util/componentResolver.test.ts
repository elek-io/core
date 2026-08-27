import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import {
  componentIdsOf,
  preloadComponentResolver,
} from './componentResolver.js';
import { CoreError } from './shared.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';

function textField(slug: string): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'text',
    label: { en: slug },
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

function dynamicField(slug: string, ofComponents: string[]): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofComponents,
    min: null,
    max: null,
  };
}

describe('componentIdsOf', () => {
  it('collects the ids of every component field, deduplicated', () => {
    const shared = uuid();
    const other = uuid();

    expect(
      componentIdsOf([
        textField('title'),
        dynamicField('blocks', [shared, other]),
        dynamicField('aside', [shared]),
      ])
    ).toEqual([shared, other]);
  });

  it('contributes nothing for an unconstrained component field', () => {
    // An empty ofComponents means every Component, which the schema builder
    // answers permissively without resolving anything
    expect(componentIdsOf([dynamicField('blocks', [])])).toEqual([]);
  });
});

describe('preloadComponentResolver', () => {
  it('follows a nested ofComponents', async () => {
    const outer = uuid();
    const inner = uuid();
    const definitions = {
      [outer]: [dynamicField('inner', [inner])],
      [inner]: [textField('caption')],
    };

    const resolver = await preloadComponentResolver([outer], (componentId) =>
      Promise.resolve(definitions[componentId] ?? [])
    );

    expect(resolver(inner)).toEqual(definitions[inner]);
  });

  it('terminates on a cycle', async () => {
    const a = uuid();
    const b = uuid();
    const definitions = {
      [a]: [dynamicField('b', [b])],
      [b]: [dynamicField('a', [a])],
    };
    const loaded: string[] = [];

    const resolver = await preloadComponentResolver([a], (componentId) => {
      loaded.push(componentId);
      return Promise.resolve(definitions[componentId] ?? []);
    });

    expect(loaded).toEqual([a, b]);
    expect(resolver(a)).toEqual(definitions[a]);
  });

  it('loads a Component reached twice only once', async () => {
    const shared = uuid();
    const first = uuid();
    const second = uuid();
    const definitions = {
      [first]: [dynamicField('shared', [shared])],
      [second]: [dynamicField('shared', [shared])],
      [shared]: [textField('caption')],
    };
    const loaded: string[] = [];

    await preloadComponentResolver([first, second], (componentId) => {
      loaded.push(componentId);
      return Promise.resolve(definitions[componentId] ?? []);
    });

    expect(loaded.filter((id) => id === shared)).toHaveLength(1);
  });

  it('throws Internal for an id the walk never reached', async () => {
    const resolver = await preloadComponentResolver([], () =>
      Promise.resolve([])
    );

    expect(() => resolver(uuid())).toThrow(CoreError);
  });
});
