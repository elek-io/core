import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  emailFieldDefinitionSchema,
  markdownFieldDefinitionSchema,
  numberFieldDefinitionSchema,
  rangeFieldDefinitionSchema,
  resolveOfComponents,
  stringSelectFieldDefinitionSchema,
  textFieldDefinitionSchema,
  type DynamicFieldDefinition,
} from './fieldSchema.js';
import type { MarkdownFeatures } from './buildMdAstSchema.js';

/** All markdown features OFF. Per-test overrides opt in to what's needed. */
const baseMarkdownFeatures: MarkdownFeatures = {
  headings: [],
  blockquotes: false,
  lists: false,
  codeBlocks: false,
  thematicBreak: false,
  rawHtml: false,
  tables: false,
  taskListItems: false,
  footnotes: false,
  emphasis: false,
  strong: false,
  inlineCode: false,
  externalLinks: false,
  entryReferences: false,
  externalImages: false,
  assetReferences: false,
  strikethrough: false,
  hardLineBreaks: false,
};

function makeMarkdownFieldDef(overrides: {
  features?: Partial<MarkdownFeatures>;
  ofCollections?: string[];
  ofAssetMimeTypes?: string[];
  min?: number | null;
  max?: number | null;
  isRequired?: boolean;
  defaultValue?: unknown;
}) {
  return {
    id: uuid(),
    slug: 'body',
    fieldType: 'markdown' as const,
    valueType: 'mdast' as const,
    label: { en: 'Body' },
    description: null,
    isRequired: overrides.isRequired ?? false,
    isDisabled: false,
    isUnique: false as const,
    inputWidth: '12' as const,
    min: overrides.min ?? null,
    max: overrides.max ?? null,
    features: { ...baseMarkdownFeatures, ...(overrides.features ?? {}) },
    ofCollections: overrides.ofCollections ?? [],
    ofAssetMimeTypes: overrides.ofAssetMimeTypes ?? [],
    defaultValue: overrides.defaultValue ?? null,
  };
}

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

describe('markdownFieldDefinitionSchema', () => {
  it('accepts a minimal valid markdown field definition', () => {
    expect(() =>
      markdownFieldDefinitionSchema.parse(makeMarkdownFieldDef({}))
    ).not.toThrow();
  });

  describe('taskListItems requires lists', () => {
    it('rejects taskListItems: true when lists: false', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({
            features: { lists: false, taskListItems: true },
          })
        )
      ).toThrow(/taskListItems requires lists/i);
    });

    it('accepts taskListItems: true when lists: true', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({
            features: { lists: true, taskListItems: true },
          })
        )
      ).not.toThrow();
    });

    it('accepts taskListItems: false regardless of lists', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({
            features: { lists: false, taskListItems: false },
          })
        )
      ).not.toThrow();
    });
  });

  describe('defaultValue must satisfy features', () => {
    it('accepts null defaultValue regardless of features', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({ defaultValue: null })
        )
      ).not.toThrow();
    });

    it('rejects defaultValue using a node type not enabled by features', () => {
      // tables disabled, but defaultValue tries to contain a table.
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({
            features: { tables: false },
            defaultValue: {
              type: 'root',
              children: [
                {
                  type: 'table',
                  align: [null],
                  children: [
                    {
                      type: 'tableRow',
                      children: [
                        {
                          type: 'tableCell',
                          children: [{ type: 'text', value: 'x' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          })
        )
      ).toThrow();
    });

    it('accepts a defaultValue using only enabled node types', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({
            features: { headings: [2] },
            defaultValue: {
              type: 'root',
              children: [
                {
                  type: 'heading',
                  depth: 2,
                  children: [{ type: 'text', value: 'Hello' }],
                },
              ],
            },
          })
        )
      ).not.toThrow();
    });

    it('rejects a defaultValue heading depth outside features.headings', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({
            features: { headings: [3, 4, 5, 6] },
            defaultValue: {
              type: 'root',
              children: [
                {
                  type: 'heading',
                  depth: 1,
                  children: [{ type: 'text', value: 'Hello' }],
                },
              ],
            },
          })
        )
      ).toThrow();
    });
  });

  describe('min/max constraint', () => {
    it('rejects min > max', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({ min: 5, max: 2 })
        )
      ).toThrow();
    });

    it('accepts min === max', () => {
      expect(() =>
        markdownFieldDefinitionSchema.parse(
          makeMarkdownFieldDef({ min: 3, max: 3 })
        )
      ).not.toThrow();
    });
  });
});

describe('stringSelectFieldDefinitionSchema defaultValue refinement', () => {
  const makeSelectFieldDef = (defaultValue: string | null) => ({
    id: uuid(),
    slug: 'choice',
    valueType: 'string' as const,
    fieldType: 'select' as const,
    label: { en: 'Choice' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12' as const,
    defaultValue,
    options: [
      { value: 'a', label: { en: 'A' } },
      { value: 'b', label: { en: 'B' } },
    ],
  });

  it('accepts a non-null defaultValue that is one of the options', () => {
    expect(() =>
      stringSelectFieldDefinitionSchema.parse(makeSelectFieldDef('a'))
    ).not.toThrow();
  });

  it('accepts a null defaultValue', () => {
    expect(() =>
      stringSelectFieldDefinitionSchema.parse(makeSelectFieldDef(null))
    ).not.toThrow();
  });

  it('rejects a non-null defaultValue that is not among the options', () => {
    expect(() =>
      stringSelectFieldDefinitionSchema.parse(makeSelectFieldDef('c'))
    ).toThrow();
  });
});

describe('textFieldDefinitionSchema defaultValue length refinement', () => {
  const makeTextFieldDef = (overrides: {
    min?: number | null;
    max?: number | null;
    defaultValue?: string | null;
  }) => ({
    id: uuid(),
    slug: 'title',
    valueType: 'string' as const,
    fieldType: 'text' as const,
    label: { en: 'Title' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12' as const,
    min: overrides.min ?? null,
    max: overrides.max ?? null,
    defaultValue: overrides.defaultValue ?? null,
  });

  it('accepts a null defaultValue even when min and max are set', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ min: 2, max: 5, defaultValue: null })
      )
    ).not.toThrow();
  });

  it('accepts a defaultValue whose length is within the range', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ min: 2, max: 5, defaultValue: 'abc' })
      )
    ).not.toThrow();
  });

  it('accepts a defaultValue length equal to min or max', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ min: 2, max: 5, defaultValue: 'ab' })
      )
    ).not.toThrow();
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ min: 2, max: 5, defaultValue: 'abcde' })
      )
    ).not.toThrow();
  });

  it('accepts any defaultValue when min and max are null', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ defaultValue: 'anything at all' })
      )
    ).not.toThrow();
  });

  it('rejects a defaultValue shorter than min', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ min: 3, defaultValue: 'ab' })
      )
    ).toThrow();
  });

  it('rejects a defaultValue longer than max', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeTextFieldDef({ max: 3, defaultValue: 'abcd' })
      )
    ).toThrow();
  });
});

describe('numberFieldDefinitionSchema defaultValue range refinement', () => {
  const makeNumberFieldDef = (overrides: {
    min?: number | null;
    max?: number | null;
    defaultValue?: number | null;
  }) => ({
    id: uuid(),
    slug: 'quantity',
    valueType: 'number' as const,
    fieldType: 'number' as const,
    label: { en: 'Count' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false as const,
    inputWidth: '12' as const,
    min: overrides.min ?? null,
    max: overrides.max ?? null,
    defaultValue: overrides.defaultValue ?? null,
  });

  it('accepts a null defaultValue even when min and max are set', () => {
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ min: 0, max: 10, defaultValue: null })
      )
    ).not.toThrow();
  });

  it('accepts a defaultValue within the range', () => {
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ min: 0, max: 10, defaultValue: 5 })
      )
    ).not.toThrow();
  });

  it('accepts a defaultValue equal to min or max', () => {
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ min: 0, max: 10, defaultValue: 0 })
      )
    ).not.toThrow();
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ min: 0, max: 10, defaultValue: 10 })
      )
    ).not.toThrow();
  });

  it('accepts any defaultValue when min and max are null', () => {
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ defaultValue: 9999 })
      )
    ).not.toThrow();
  });

  it('rejects a defaultValue below min', () => {
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ min: 0, defaultValue: -1 })
      )
    ).toThrow();
  });

  it('rejects a defaultValue above max', () => {
    expect(() =>
      numberFieldDefinitionSchema.parse(
        makeNumberFieldDef({ max: 10, defaultValue: 11 })
      )
    ).toThrow();
  });
});

describe('rangeFieldDefinitionSchema defaultValue range refinement', () => {
  const makeRangeFieldDef = (overrides: {
    min: number;
    max: number;
    defaultValue: number;
  }) => ({
    id: uuid(),
    slug: 'volume',
    valueType: 'number' as const,
    fieldType: 'range' as const,
    label: { en: 'Volume' },
    description: null,
    isRequired: true as const,
    isDisabled: false,
    isUnique: false as const,
    inputWidth: '12' as const,
    min: overrides.min,
    max: overrides.max,
    defaultValue: overrides.defaultValue,
  });

  it('accepts a defaultValue within the range', () => {
    expect(() =>
      rangeFieldDefinitionSchema.parse(
        makeRangeFieldDef({ min: 0, max: 10, defaultValue: 5 })
      )
    ).not.toThrow();
  });

  it('accepts a defaultValue equal to min or max', () => {
    expect(() =>
      rangeFieldDefinitionSchema.parse(
        makeRangeFieldDef({ min: 0, max: 10, defaultValue: 0 })
      )
    ).not.toThrow();
    expect(() =>
      rangeFieldDefinitionSchema.parse(
        makeRangeFieldDef({ min: 0, max: 10, defaultValue: 10 })
      )
    ).not.toThrow();
  });

  it('rejects a defaultValue below min', () => {
    expect(() =>
      rangeFieldDefinitionSchema.parse(
        makeRangeFieldDef({ min: 0, max: 10, defaultValue: -1 })
      )
    ).toThrow();
  });

  it('rejects a defaultValue above max', () => {
    expect(() =>
      rangeFieldDefinitionSchema.parse(
        makeRangeFieldDef({ min: 0, max: 10, defaultValue: 999 })
      )
    ).toThrow();
  });
});

describe('unique string fields cannot carry a default (per field type)', () => {
  // The Add Field editor validates against the per-type leaf schema, so the
  // unique/default rule has to live there, not only on the string union.
  const makeUniqueTextFieldDef = (overrides: {
    isUnique?: boolean;
    defaultValue?: string | null;
  }) => ({
    id: uuid(),
    slug: 'sku',
    valueType: 'string' as const,
    fieldType: 'text' as const,
    label: { en: 'SKU' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: overrides.isUnique ?? false,
    inputWidth: '12' as const,
    min: null,
    max: null,
    defaultValue: overrides.defaultValue ?? null,
  });

  const makeUniqueEmailFieldDef = (overrides: {
    isUnique?: boolean;
    defaultValue?: string | null;
  }) => ({
    id: uuid(),
    slug: 'contact',
    valueType: 'string' as const,
    fieldType: 'email' as const,
    label: { en: 'Contact' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: overrides.isUnique ?? false,
    inputWidth: '12' as const,
    defaultValue: overrides.defaultValue ?? null,
  });

  it('rejects a unique text field with a non-null default at the leaf schema', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeUniqueTextFieldDef({ isUnique: true, defaultValue: 'foo' })
      )
    ).toThrow(/unique field cannot have a default/i);
  });

  it('accepts a unique text field with a null default', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeUniqueTextFieldDef({ isUnique: true, defaultValue: null })
      )
    ).not.toThrow();
  });

  it('accepts a non-unique text field with a default', () => {
    expect(() =>
      textFieldDefinitionSchema.parse(
        makeUniqueTextFieldDef({ isUnique: false, defaultValue: 'foo' })
      )
    ).not.toThrow();
  });

  it('rejects a unique email field with a non-null default at the leaf schema', () => {
    expect(() =>
      emailFieldDefinitionSchema.parse(
        makeUniqueEmailFieldDef({ isUnique: true, defaultValue: 'a@b.com' })
      )
    ).toThrow(/unique field cannot have a default/i);
  });

  it('accepts a non-unique email field with a valid default', () => {
    expect(() =>
      emailFieldDefinitionSchema.parse(
        makeUniqueEmailFieldDef({ isUnique: false, defaultValue: 'a@b.com' })
      )
    ).not.toThrow();
  });
});
