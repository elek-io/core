import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  isEmptyParagraphOnly,
  mdAstRootSchema,
  mdastValueSchema,
  type MdAstRoot,
} from './valueSchema.js';

describe('mdAstRootSchema (permissive)', () => {
  it('accepts a tree with a heading and a paragraph', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 2,
          children: [{ type: 'text', value: 'Hello' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'world' }],
        },
      ],
    };

    expect(() => mdAstRootSchema.parse(root)).not.toThrow();
  });

  it('rejects an empty tree (children: [])', () => {
    expect(() =>
      mdAstRootSchema.parse({ type: 'root', children: [] })
    ).toThrow();
  });

  it('rejects an empty-paragraph-only tree (Milkdown initial state)', () => {
    expect(() =>
      mdAstRootSchema.parse({
        type: 'root',
        children: [{ type: 'paragraph', children: [] }],
      })
    ).toThrow();
  });

  it('accepts a tree with a paragraph containing one text node', () => {
    expect(() =>
      mdAstRootSchema.parse({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'x' }],
          },
        ],
      })
    ).not.toThrow();
  });

  it('accepts nested emphasis inside a paragraph', () => {
    expect(() =>
      mdAstRootSchema.parse({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'emphasis',
                children: [
                  {
                    type: 'strong',
                    children: [{ type: 'text', value: 'nested' }],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).not.toThrow();
  });

  it('accepts a custom entryReference node with collectionId + entryId', () => {
    expect(() =>
      mdAstRootSchema.parse({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'entryReference',
                collectionId: uuid(),
                entryId: uuid(),
                children: [{ type: 'text', value: 'see tutorial' }],
              },
            ],
          },
        ],
      })
    ).not.toThrow();
  });

  it('accepts a custom assetReference node with alt and title', () => {
    expect(() =>
      mdAstRootSchema.parse({
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'assetReference',
                assetId: uuid(),
                alt: 'company logo',
                title: 'Logo',
              },
            ],
          },
        ],
      })
    ).not.toThrow();
  });

  it('accepts a blockquote containing block children', () => {
    expect(() =>
      mdAstRootSchema.parse({
        type: 'root',
        children: [
          {
            type: 'blockquote',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'quoted' }],
              },
            ],
          },
        ],
      })
    ).not.toThrow();
  });

  it('strips position info on parse (no field on output)', () => {
    // Zod by default strips unknown keys from objects on parse, which is how
    // we keep parser-emitted `position` metadata out of stored trees.
    const withPosition = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'x', position: { foo: 1 } },
          ],
          position: { foo: 2 },
        },
      ],
    };
    const parsed = mdAstRootSchema.parse(withPosition);
    const para = parsed.children[0];
    expect(para).toBeDefined();
    if (para === undefined || para.type !== 'paragraph') {
      throw new Error('expected paragraph');
    }
    expect('position' in para).toBe(false);
    const text = para.children[0];
    expect(text).toBeDefined();
    if (text === undefined) throw new Error('expected text');
    expect('position' in text).toBe(false);
  });
});

describe('isEmptyParagraphOnly', () => {
  it('returns true for a single empty paragraph', () => {
    expect(
      isEmptyParagraphOnly({
        children: [{ type: 'paragraph', children: [] }],
      })
    ).toBe(true);
  });

  it('returns false for a paragraph with text', () => {
    expect(
      isEmptyParagraphOnly({
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'x' }],
          },
        ],
      })
    ).toBe(false);
  });

  it('returns false for a heading (any non-paragraph first block)', () => {
    expect(
      isEmptyParagraphOnly({
        children: [{ type: 'paragraph', children: [] }, { type: 'thematicBreak' }],
      })
    ).toBe(false);
  });

  it('returns false for empty children array', () => {
    expect(isEmptyParagraphOnly({ children: [] })).toBe(false);
  });
});

describe('mdastValueSchema', () => {
  it('accepts a value with per-language null content', () => {
    expect(() =>
      mdastValueSchema.parse({
        objectType: 'value',
        valueType: 'mdast',
        content: { en: null, de: null },
      })
    ).not.toThrow();
  });

  it('accepts a value with a tree in one language and null in another', () => {
    expect(() =>
      mdastValueSchema.parse({
        objectType: 'value',
        valueType: 'mdast',
        content: {
          en: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'hello' }],
              },
            ],
          },
          de: null,
        },
      })
    ).not.toThrow();
  });

  it('rejects a value with an empty tree (forces null instead)', () => {
    expect(() =>
      mdastValueSchema.parse({
        objectType: 'value',
        valueType: 'mdast',
        content: {
          en: { type: 'root', children: [] },
        },
      })
    ).toThrow();
  });
});
