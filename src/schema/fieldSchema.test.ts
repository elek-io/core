import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  markdownFieldDefinitionSchema,
  resolveOfComponents,
  stringSelectFieldDefinitionSchema,
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
