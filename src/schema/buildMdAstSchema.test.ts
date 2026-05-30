import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  MAX_MDAST_DEPTH,
  buildMdAstSchemaForFeatures,
  markdownFeaturesSchema,
  type MarkdownFeatures,
} from './buildMdAstSchema.js';
import type { MdAstBlockNode, MdAstRoot } from './valueSchema.js';

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

    it('rejects an empty tree even when not required (empty must be null)', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx());
      // null is the canonical empty value for an optional field.
      expect(() => schema.parse(null)).not.toThrow();
      // An empty tree is not a valid way to express "empty".
      expect(() =>
        schema.parse({ type: 'root', children: [] })
      ).toThrow();
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

  describe('externalLinks URL safety', () => {
    const linkTree = (url: string): MdAstRoot => ({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url,
              title: null,
              children: [{ type: 'text', value: 'x' }],
            },
          ],
        },
      ],
    });

    const schema = buildMdAstSchemaForFeatures(
      makeCtx({ externalLinks: true })
    );

    it('rejects dangerous link URL schemes', () => {
      for (const url of [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        '//evil.example.com',
      ]) {
        expect(() => schema.parse(linkTree(url)), url).toThrow();
      }
    });

    it('accepts safe link URL forms', () => {
      for (const url of [
        'https://example.com',
        'http://example.com',
        'mailto:hi@example.com',
        'tel:+15551234',
        '/internal/path',
        './sibling',
        '../parent',
        '#section',
      ]) {
        expect(() => schema.parse(linkTree(url)), url).not.toThrow();
      }
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

  describe('depth limit', () => {
    /**
     * Builds a `root` tree whose deepest leaf is at the given 1-based depth
     * (root = 1). Wraps `paragraph[text]` in nested `wrapper` containers.
     * For `wrapper='blockquote'`: each wrapper directly nests the next.
     * For `wrapper='list'`: each wrapper is `list > listItem` (counts as 2
     * depth levels per nesting), so requested depth must be even.
     */
    function nest(
      wrapper: 'blockquote' | 'footnoteDefinition',
      depth: number
    ): MdAstRoot {
      // depth = ancestor count of the text node + 1 (text itself).
      // root (1) → wrappers... → paragraph (depth-1) → text (depth).
      const wrapperCount = depth - 3; // root + paragraph + text = 3 nodes outside wrappers
      if (wrapperCount < 0) {
        throw new Error('depth must be >= 3 (root + paragraph + text)');
      }
      let block: MdAstBlockNode = {
        type: 'paragraph',
        children: [{ type: 'text', value: 'x' }],
      };
      for (let i = 0; i < wrapperCount; i += 1) {
        if (wrapper === 'blockquote') {
          block = { type: 'blockquote', children: [block] };
        } else {
          block = {
            type: 'footnoteDefinition',
            identifier: `n-${i}`,
            label: null,
            children: [block],
          };
        }
      }
      return { type: 'root', children: [block] };
    }

    it('exports MAX_MDAST_DEPTH = 100', () => {
      expect(MAX_MDAST_DEPTH).toBe(100);
    });

    it('accepts a blockquote chain at exactly MAX_MDAST_DEPTH', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({ blockquotes: true })
      );
      expect(() => schema.parse(nest('blockquote', MAX_MDAST_DEPTH))).not.toThrow();
    });

    it('rejects a blockquote chain one level deeper than MAX_MDAST_DEPTH', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({ blockquotes: true })
      );
      expect(() =>
        schema.parse(nest('blockquote', MAX_MDAST_DEPTH + 1))
      ).toThrow();
    });

    it('rejects a footnoteDefinition chain one level deeper than MAX_MDAST_DEPTH', () => {
      const schema = buildMdAstSchemaForFeatures(
        makeCtx({ footnotes: true })
      );
      expect(() =>
        schema.parse(nest('footnoteDefinition', MAX_MDAST_DEPTH + 1))
      ).toThrow();
    });

    it('rejects a list/listItem chain one level deeper than MAX_MDAST_DEPTH', () => {
      const schema = buildMdAstSchemaForFeatures(makeCtx({ lists: true }));
      // list > listItem alternation: 2 levels per "list nesting".
      // root + paragraph + text = 3 fixed nodes; remaining = depth - 3 levels.
      // To overshoot MAX_MDAST_DEPTH by 1, build (MAX_MDAST_DEPTH + 1 - 3)/2
      // alternations if even, else one extra list wrapper.
      const wrappersNeeded = MAX_MDAST_DEPTH + 1 - 3;
      let block: MdAstBlockNode = {
        type: 'paragraph',
        children: [{ type: 'text', value: 'x' }],
      };
      // We can pair list+listItem; wrappersNeeded must be even for clean
      // alternation, otherwise add a final list on the outside.
      const pairs = Math.floor(wrappersNeeded / 2);
      for (let i = 0; i < pairs; i += 1) {
        block = {
          type: 'list',
          ordered: false,
          start: null,
          spread: false,
          children: [
            {
              type: 'listItem',
              spread: false,
              checked: null,
              children: [block],
            },
          ],
        } as MdAstBlockNode;
      }
      if (wrappersNeeded % 2 !== 0) {
        block = {
          type: 'list',
          ordered: false,
          start: null,
          spread: false,
          children: [
            {
              type: 'listItem',
              spread: false,
              checked: null,
              children: [block],
            },
          ],
        } as MdAstBlockNode;
      }
      const root: MdAstRoot = { type: 'root', children: [block] };
      expect(() => schema.parse(root)).toThrow();
    });
  });
});
