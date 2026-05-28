import { describe, expect, it } from 'vitest';
import type { MdAstRoot } from '../schema/valueSchema.js';
import { mdastToMarkdown } from './mdastToMarkdown.js';

describe('mdastToMarkdown', () => {
  it('serializes a heading + paragraph tree to markdown', () => {
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
          children: [{ type: 'text', value: 'World.' }],
        },
      ],
    };
    expect(mdastToMarkdown(root)).toBe('## Hello\n\nWorld.\n');
  });

  it('serializes emphasis and strong correctly', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'a ' },
            {
              type: 'emphasis',
              children: [{ type: 'text', value: 'b' }],
            },
            { type: 'text', value: ' c ' },
            {
              type: 'strong',
              children: [{ type: 'text', value: 'd' }],
            },
            { type: 'text', value: '.' },
          ],
        },
      ],
    };
    expect(mdastToMarkdown(root)).toBe('a *b* c **d**.\n');
  });

  describe('entryReference', () => {
    const collectionId = '11111111-2222-3333-4444-555555555555';
    const entryId = '66666666-7777-8888-9999-aaaaaaaaaaaa';

    function entryRefTree(): MdAstRoot {
      return {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'See ' },
              {
                type: 'entryReference',
                collectionId,
                entryId,
                children: [{ type: 'text', value: 'tutorial' }],
              },
              { type: 'text', value: '.' },
            ],
          },
        ],
      };
    }

    it('serializes as sentinel URL when no resolver is provided', () => {
      expect(mdastToMarkdown(entryRefTree())).toBe(
        `See [tutorial](elekio://entry/${collectionId}/${entryId}).\n`
      );
    });

    it('serializes using resolveEntry callback when provided', () => {
      const markdown = mdastToMarkdown(entryRefTree(), {
        resolveEntry: ({ entryId: id }) => `/posts/${id}`,
      });
      expect(markdown).toBe(`See [tutorial](/posts/${entryId}).\n`);
    });

    it('passes both collectionId and entryId to resolveEntry', () => {
      const calls: Array<{ collectionId: string; entryId: string }> = [];
      mdastToMarkdown(entryRefTree(), {
        resolveEntry: (ref) => {
          calls.push(ref);
          return '/x';
        },
      });
      expect(calls).toEqual([{ collectionId, entryId }]);
    });
  });

  describe('assetReference', () => {
    const assetId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

    function assetRefTree(title: string | null = null): MdAstRoot {
      return {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'assetReference',
                assetId,
                alt: 'company logo',
                title,
              },
            ],
          },
        ],
      };
    }

    it('serializes as sentinel URL when no resolver is provided', () => {
      expect(mdastToMarkdown(assetRefTree())).toBe(
        `![company logo](elekio://asset/${assetId})\n`
      );
    });

    it('serializes using resolveAsset callback when provided', () => {
      const markdown = mdastToMarkdown(assetRefTree(), {
        resolveAsset: ({ assetId: id }) => `/cdn/${id}.png`,
      });
      expect(markdown).toBe(`![company logo](/cdn/${assetId}.png)\n`);
    });

    it('preserves optional title in serialized output', () => {
      const markdown = mdastToMarkdown(assetRefTree('Logo'));
      expect(markdown).toBe(
        `![company logo](elekio://asset/${assetId} "Logo")\n`
      );
    });
  });

  it('handles a mixed tree with both reference kinds + standard nodes', () => {
    const collectionId = '11111111-2222-3333-4444-555555555555';
    const entryId = '66666666-7777-8888-9999-aaaaaaaaaaaa';
    const assetId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 2,
          children: [{ type: 'text', value: 'Section' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Read ' },
            {
              type: 'entryReference',
              collectionId,
              entryId,
              children: [{ type: 'text', value: 'this' }],
            },
            { type: 'text', value: ' first.' },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'assetReference',
              assetId,
              alt: 'diagram',
              title: null,
            },
          ],
        },
      ],
    };
    const markdown = mdastToMarkdown(root, {
      resolveEntry: ({ entryId: id }) => `/p/${id}`,
      resolveAsset: ({ assetId: id }) => `/a/${id}`,
    });
    expect(markdown).toBe(
      `## Section\n\nRead [this](/p/${entryId}) first.\n\n![diagram](/a/${assetId})\n`
    );
  });

  describe('non-GFM node coverage', () => {
    it('serializes an unordered list with nested ordered list', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            start: null,
            spread: false,
            children: [
              {
                type: 'listItem',
                spread: false,
                checked: null,
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', value: 'outer' }],
                  },
                  {
                    type: 'list',
                    ordered: true,
                    start: 1,
                    spread: false,
                    children: [
                      {
                        type: 'listItem',
                        spread: false,
                        checked: null,
                        children: [
                          {
                            type: 'paragraph',
                            children: [{ type: 'text', value: 'inner' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('* outer\n  1. inner\n');
    });

    it('serializes a blockquote containing a paragraph', () => {
      const root: MdAstRoot = {
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
      };
      expect(mdastToMarkdown(root)).toBe('> quoted\n');
    });

    it('serializes a fenced code block with language and meta', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'code',
            lang: 'ts',
            meta: 'title="example.ts"',
            value: 'const x = 1;',
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe(
        '```ts title="example.ts"\nconst x = 1;\n```\n'
      );
    });

    it('serializes inline code in a paragraph', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'use ' },
              { type: 'inlineCode', value: 'foo()' },
              { type: 'text', value: '.' },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('use `foo()`.\n');
    });

    it('serializes a thematic break', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'a' }],
          },
          { type: 'thematicBreak' },
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'b' }],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('a\n\n***\n\nb\n');
    });

    it('serializes a hard line break inside a paragraph', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'one' },
              { type: 'break' },
              { type: 'text', value: 'two' },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('one\\\ntwo\n');
    });

    it('passes a non-reference link through unchanged', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'https://example.com',
                title: null,
                children: [{ type: 'text', value: 'site' }],
              },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('[site](https://example.com)\n');
    });

    it('passes a non-reference image through unchanged', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'image',
                url: 'https://cdn.example.com/x.png',
                title: null,
                alt: 'cover',
              },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe(
        '![cover](https://cdn.example.com/x.png)\n'
      );
    });

    it('passes raw HTML nodes through unchanged', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'html',
            value: '<aside class="callout">be careful</aside>',
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe(
        '<aside class="callout">be careful</aside>\n'
      );
    });
  });

  describe('GFM node coverage', () => {
    it('serializes a strikethrough (delete) span', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'a ' },
              {
                type: 'delete',
                children: [{ type: 'text', value: 'gone' }],
              },
              { type: 'text', value: ' b' },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('a ~~gone~~ b\n');
    });

    it('serializes a GFM table with mixed alignment', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'table',
            align: ['left', 'right'],
            children: [
              {
                type: 'tableRow',
                children: [
                  {
                    type: 'tableCell',
                    children: [{ type: 'text', value: 'H1' }],
                  },
                  {
                    type: 'tableCell',
                    children: [{ type: 'text', value: 'H2' }],
                  },
                ],
              },
              {
                type: 'tableRow',
                children: [
                  {
                    type: 'tableCell',
                    children: [{ type: 'text', value: 'a' }],
                  },
                  {
                    type: 'tableCell',
                    children: [{ type: 'text', value: 'b' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe(
        '| H1 | H2 |\n| :- | -: |\n| a  |  b |\n'
      );
    });

    it('serializes a footnote reference + definition', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'see ' },
              {
                type: 'footnoteReference',
                identifier: 'note-1',
                label: 'note-1',
              },
            ],
          },
          {
            type: 'footnoteDefinition',
            identifier: 'note-1',
            label: 'note-1',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'a footnote.' }],
              },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe(
        'see [^note-1]\n\n[^note-1]: a footnote.\n'
      );
    });

    it('serializes checked and unchecked task list items', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered: false,
            start: null,
            spread: false,
            children: [
              {
                type: 'listItem',
                spread: false,
                checked: true,
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', value: 'done' }],
                  },
                ],
              },
              {
                type: 'listItem',
                spread: false,
                checked: false,
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', value: 'todo' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(mdastToMarkdown(root)).toBe('* [x] done\n* [ ] todo\n');
    });
  });

  it('serializes a nested entryReference inside emphasis', () => {
    const collectionId = '11111111-2222-3333-4444-555555555555';
    const entryId = '66666666-7777-8888-9999-aaaaaaaaaaaa';
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'emphasis',
              children: [
                {
                  type: 'entryReference',
                  collectionId,
                  entryId,
                  children: [{ type: 'text', value: 'italic link' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(mdastToMarkdown(root)).toBe(
      `*[italic link](elekio://entry/${collectionId}/${entryId})*\n`
    );
  });
});
