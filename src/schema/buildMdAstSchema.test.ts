import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  buildMdAstSchemaForFeatures,
  markdownFeaturesSchema,
  type MarkdownFeatures,
} from './buildMdAstSchema.js';

/** All features OFF. Tests opt in to the ones they need. */
const baseFeatures: MarkdownFeatures = {
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

function makeCtx(overrides: Partial<MarkdownFeatures> = {}, opts: {
  ofCollections?: string[];
  min?: number | null;
  max?: number | null;
  isRequired?: boolean;
} = {}) {
  return {
    features: { ...baseFeatures, ...overrides },
    ofCollections: opts.ofCollections ?? [],
    min: opts.min ?? null,
    max: opts.max ?? null,
    isRequired: opts.isRequired ?? false,
  };
}

describe('markdownFeaturesSchema', () => {
  it('accepts a fully specified features object', () => {
    expect(() =>
      markdownFeaturesSchema.parse({
        ...baseFeatures,
        headings: [1, 2, 3, 4, 5, 6],
        emphasis: true,
        strong: true,
      })
    ).not.toThrow();
  });

  it('rejects an object missing any feature key (no defaults)', () => {
    const { headings: _h, ...rest } = baseFeatures;
    expect(() => markdownFeaturesSchema.parse(rest)).toThrow();
  });

  it('rejects heading depths outside 1..6', () => {
    expect(() =>
      markdownFeaturesSchema.parse({ ...baseFeatures, headings: [0] })
    ).toThrow();
    expect(() =>
      markdownFeaturesSchema.parse({ ...baseFeatures, headings: [7] })
    ).toThrow();
  });

  it('accepts an empty headings array (= headings disabled)', () => {
    expect(() =>
      markdownFeaturesSchema.parse({ ...baseFeatures, headings: [] })
    ).not.toThrow();
  });
});

describe('buildMdAstSchemaForFeatures', () => {
  describe('isRequired / null handling', () => {
    it('accepts null when not required', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() => schema.parse(null)).not.toThrow();
    });

    it('rejects null when required', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({}, { isRequired: true })
      );
      expect(() => schema.parse(null)).toThrow();
    });
  });

  describe('paragraph + text are the floor', () => {
    it('accepts a single paragraph with text even with no features enabled', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ type: 'text', value: 'x' }] },
          ],
        })
      ).not.toThrow();
    });

    it('rejects emphasis when emphasis feature is off', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'emphasis',
                  children: [{ type: 'text', value: 'x' }],
                },
              ],
            },
          ],
        })
      ).toThrow();
    });

    it('accepts emphasis when emphasis feature is on', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx({ emphasis: true }));
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'emphasis',
                  children: [{ type: 'text', value: 'x' }],
                },
              ],
            },
          ],
        })
      ).not.toThrow();
    });
  });

  describe('headings', () => {
    it('rejects any heading when headings array is empty', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'heading',
              depth: 1,
              children: [{ type: 'text', value: 'h' }],
            },
          ],
        })
      ).toThrow();
    });

    it('accepts only the allowed depths', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({ headings: [3, 4, 5, 6] })
      );

      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'heading',
              depth: 3,
              children: [{ type: 'text', value: 'h' }],
            },
          ],
        })
      ).not.toThrow();

      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'heading',
              depth: 1,
              children: [{ type: 'text', value: 'h' }],
            },
          ],
        })
      ).toThrow();
    });
  });

  describe('ofCollections structural check on entryReference', () => {
    it('accepts any collectionId when ofCollections is empty', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({ entryReferences: true })
      );
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'entryReference',
                  collectionId: uuid(),
                  entryId: uuid(),
                  children: [{ type: 'text', value: 'x' }],
                },
              ],
            },
          ],
        })
      ).not.toThrow();
    });

    it('rejects an entryReference whose collectionId is not in ofCollections', () => {
      const allowedCollection = uuid();
      const schema = buildMdAstSchemaForFeatures(
        makeCtx(
          { entryReferences: true },
          { ofCollections: [allowedCollection] }
        )
      );

      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'entryReference',
                  collectionId: uuid(), // not in ofCollections
                  entryId: uuid(),
                  children: [{ type: 'text', value: 'x' }],
                },
              ],
            },
          ],
        })
      ).toThrow();
    });

    it('accepts an entryReference whose collectionId is in ofCollections', () => {
      const allowedCollection = uuid();
      const schema = buildMdAstSchemaForFeatures(
        makeCtx(
          { entryReferences: true },
          { ofCollections: [allowedCollection] }
        )
      );

      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'entryReference',
                  collectionId: allowedCollection,
                  entryId: uuid(),
                  children: [{ type: 'text', value: 'x' }],
                },
              ],
            },
          ],
        })
      ).not.toThrow();
    });
  });

  describe('block count min/max', () => {
    it('defaults min to 1 when isRequired is true and no min is set', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({}, { isRequired: true })
      );
      expect(() => schema.parse({ type: 'root', children: [] })).toThrow();
    });

    it('accepts 0 blocks when not required', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() =>
        schema.parse({ type: 'root', children: [] })
      ).not.toThrow();
    });

    it('rejects fewer blocks than min', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx({}, { min: 2 }));
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ type: 'text', value: 'one' }] },
          ],
        })
      ).toThrow();
    });

    it('rejects more blocks than max', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx({}, { max: 1 }));
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            { type: 'paragraph', children: [{ type: 'text', value: 'one' }] },
            { type: 'paragraph', children: [{ type: 'text', value: 'two' }] },
          ],
        })
      ).toThrow();
    });
  });

  describe('empty-paragraph-only rejection', () => {
    it('rejects a tree with a single empty paragraph even when not required', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() =>
        schema.parse({
          type: 'root',
          children: [{ type: 'paragraph', children: [] }],
        })
      ).toThrow();
    });
  });

  describe('rawHtml feature', () => {
    it('rejects html nodes when feature is off', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      expect(() =>
        schema.parse({
          type: 'root',
          children: [
            { type: 'html', value: '<script>alert("xss")</script>' },
          ],
        })
      ).toThrow();
    });

    it('accepts html nodes when feature is on', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx({ rawHtml: true }));
      expect(() =>
        schema.parse({
          type: 'root',
          children: [{ type: 'html', value: '<div>safe</div>' }],
        })
      ).not.toThrow();
    });
  });

  describe('table feature uses narrowed phrasing in cells', () => {
    it('rejects emphasis inside a table cell when emphasis is off', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx({ tables: true }));
      expect(() =>
        schema.parse({
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
                      children: [
                        {
                          type: 'emphasis',
                          children: [{ type: 'text', value: 'x' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      ).toThrow();
    });
  });
});
