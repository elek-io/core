import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  resolveOfComponents,
  type DynamicFieldDefinition,
} from './fieldSchema.js';

const baseDynamicField: DynamicFieldDefinition = {
  id: uuid(),
  slug: 'blocks',
  fieldType: 'dynamic',
  valueType: 'component',
  label: { en: 'Blocks' },
  description: null,
  isRequired: false,
  isDisabled: false,
  isUnique: false,
  inputWidth: '12',
  ofComponents: [],
  min: null,
  max: null,
};

describe('resolveOfComponents', () => {
  it('expands an empty ofComponents to all component ids', () => {
    const componentIds = [uuid(), uuid(), uuid()];

    const result = resolveOfComponents(baseDynamicField, componentIds);

    expect(result).toEqual(componentIds);
  });

  it('returns the field-defined ofComponents verbatim when non-empty', () => {
    const a = uuid();
    const b = uuid();
    const componentIds = [a, b, uuid()];

    const result = resolveOfComponents(
      { ...baseDynamicField, ofComponents: [a, b] },
      componentIds
    );

    expect(result).toEqual([a, b]);
  });
});
