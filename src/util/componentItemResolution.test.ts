import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import type {
  ComponentItem,
  ComponentValue,
  Value,
} from '../schema/valueSchema.js';
import { withComponentItemValues } from './componentItemResolution.js';

/** Narrows a Value to a Component Value, so its items can be read. */
function componentOf(value: Value | undefined): ComponentValue {
  if (value?.valueType !== 'component') {
    throw new Error(
      `expected a Component Value, got ${value?.valueType ?? 'nothing'}`
    );
  }
  return value;
}

function text(content: string): Value {
  return {
    objectType: 'value',
    valueType: 'string',
    content: { en: content },
  };
}

function componentValue(content: ComponentItem[]): Value {
  return { objectType: 'value', valueType: 'component', content };
}

describe('withComponentItemValues', () => {
  it('applies a resolution for an item inside a Value another resolution replaces', () => {
    const componentId = uuid();
    const inner: ComponentItem = {
      id: uuid(),
      componentId,
      values: { title: text('Inner') },
    };
    const outer: ComponentItem = {
      id: uuid(),
      componentId,
      values: { title: text('Outer'), children: componentValue([inner]) },
    };
    const keptInner: ComponentItem = {
      ...inner,
      values: { title: text('Inner, kept') },
    };

    const result = withComponentItemValues(
      { blocks: componentValue([outer]) },
      {
        [outer.id]: {
          subtitle: text('Outer subtitle'),
          children: componentValue([keptInner]),
        },
        [inner.id]: { subtitle: text('Inner subtitle') },
      }
    );

    const outerResult = componentOf(result['blocks']).content[0];
    expect(outerResult?.values['subtitle']).toEqual(text('Outer subtitle'));
    // The caller's replacement went in, and the resolution for the item
    // inside it landed on top of it rather than being dropped
    const innerResult = componentOf(outerResult?.values['children']).content[0];
    expect(innerResult?.values['title']).toEqual(text('Inner, kept'));
    expect(innerResult?.values['subtitle']).toEqual(text('Inner subtitle'));
  });

  it('applies an item resolution once, so a Value naming that item ends the walk', () => {
    const item: ComponentItem = {
      id: uuid(),
      componentId: uuid(),
      values: { title: text('Only') },
    };
    // A Value carrying the very item whose field it replaces, which a walk
    // re-applying that item's resolution would follow forever
    const resolutions = {
      [item.id]: {
        children: componentValue([
          { ...item, values: { title: text('Nested copy') } },
        ]),
      },
    };

    const result = withComponentItemValues(
      { blocks: componentValue([item]) },
      resolutions
    );

    const itemResult = componentOf(result['blocks']).content[0];
    const nested = componentOf(itemResult?.values['children']).content[0];
    expect(nested?.values['title']).toEqual(text('Nested copy'));
    expect(nested?.values['children']).toBeUndefined();
  });

  it('leaves a Value of another type and an item no resolution names alone', () => {
    const item: ComponentItem = {
      id: uuid(),
      componentId: uuid(),
      values: { title: text('Untouched') },
    };
    const values = { blocks: componentValue([item]), name: text('Entry') };

    const result = withComponentItemValues(values, {
      [uuid()]: { title: text('For nobody here') },
    });

    expect(result).toEqual(values);
  });
});
