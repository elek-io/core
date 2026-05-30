/// <reference types="astro/astro-jsx" />

import { describe, it, expect, expectTypeOf } from 'vitest';
import { Fragment, jsx } from 'astro/jsx-runtime';
import {
  mdastRender,
  astroDefaults,
  type MdastAstroRenderers,
} from './mdastRender.js';
import type { MdAstRoot } from '../schema/valueSchema.js';

const collectionId = '11111111-2222-3333-4444-555555555555';
const entryId = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

/**
 * Minimal renderers — just the three required overrides, every default
 * present in `astroDefaults` is left to apply.
 */
const minimalOverrides: MdastAstroRenderers = {
  html: (node) => node.value,
  assetReference: (node) => `asset:${node.assetId}`,
  entryReference: (node) => `entry:${node.entryId}`,
};

/**
 * Astro vnodes are objects with `type` (string for intrinsic elements,
 * function for Fragment) and `props` (containing children). The other
 * fields (`astro:jsx` symbol, `Renderer` symbol) are runtime markers
 * we don't need to assert.
 */
interface ShapeOfVNode {
  type: unknown;
  props: { children?: unknown; [key: string]: unknown };
}

function asVNode(value: unknown): ShapeOfVNode {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('type' in value) ||
    !('props' in value)
  ) {
    throw new Error(`expected vnode, got: ${JSON.stringify(value)}`);
  }
  return value as ShapeOfVNode;
}

describe('mdastRender (Astro wrapper)', () => {
  describe('root combiner', () => {
    it('wraps top-level blocks in Fragment by default', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'hi' }],
          },
        ],
      };
      const result = asVNode(mdastRender(root, minimalOverrides));
      expect(result.type).toBe(Fragment);
      expect(Array.isArray(result.props.children)).toBe(true);
    });

    it('allows the consumer to override root to wrap in <article>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'hi' }],
          },
        ],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        root: (_, children) => jsx('article', { children }),
      };
      const result = asVNode(mdastRender(root, overrides));
      expect(result.type).toBe('article');
    });
  });

  describe('paragraph / heading / inline defaults', () => {
    it('renders paragraph as <p>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'hello' }],
          },
        ],
      };
      const top = asVNode(mdastRender(root, minimalOverrides));
      const blocks = top.props.children as unknown[];
      const para = asVNode(blocks[0]);
      expect(para.type).toBe('p');
      expect(para.props.children).toEqual(['hello']);
    });

    it('renders heading with computed h${depth} tag', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'heading',
            depth: 3,
            children: [{ type: 'text', value: 'h3' }],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const heading = asVNode(blocks[0]);
      expect(heading.type).toBe('h3');
      expect(heading.props.children).toEqual(['h3']);
    });

    it('renders emphasis / strong / delete with semantic tags', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'emphasis',
                children: [{ type: 'text', value: 'em' }],
              },
              {
                type: 'strong',
                children: [{ type: 'text', value: 'st' }],
              },
              {
                type: 'delete',
                children: [{ type: 'text', value: 'del' }],
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const para = asVNode(blocks[0]);
      const inline = para.props.children as unknown[];
      expect(asVNode(inline[0]).type).toBe('em');
      expect(asVNode(inline[1]).type).toBe('strong');
      expect(asVNode(inline[2]).type).toBe('del');
    });
  });

  describe('list and listItem defaults', () => {
    it('renders ordered list as <ol>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
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
                    children: [{ type: 'text', value: 'a' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const list = asVNode(blocks[0]);
      expect(list.type).toBe('ol');
      const items = list.props.children as unknown[];
      expect(asVNode(items[0]).type).toBe('li');
    });

    it('renders unordered list as <ul>', () => {
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
                    children: [{ type: 'text', value: 'a' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      expect(asVNode(blocks[0]).type).toBe('ul');
    });
  });

  describe('table defaults', () => {
    it('renders table / tableRow / tableCell with semantic tags', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'table',
            align: [null, null],
            children: [
              {
                type: 'tableRow',
                children: [
                  {
                    type: 'tableCell',
                    children: [{ type: 'text', value: 'a' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const table = asVNode(blocks[0]);
      expect(table.type).toBe('table');
      const rows = table.props.children as unknown[];
      const row = asVNode(rows[0]);
      expect(row.type).toBe('tr');
      const cells = row.props.children as unknown[];
      expect(asVNode(cells[0]).type).toBe('td');
    });
  });

  describe('code default — no language class', () => {
    it('emits plain <pre><code> without a class even when lang is set', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          { type: 'code', lang: 'ts', meta: null, value: 'const x = 1;' },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const pre = asVNode(blocks[0]);
      expect(pre.type).toBe('pre');
      const code = asVNode(pre.props.children);
      expect(code.type).toBe('code');
      expect(code.props).not.toHaveProperty('class');
      expect(code.props).not.toHaveProperty('className');
      expect(code.props.children).toBe('const x = 1;');
    });
  });

  describe('link default — no rel / target', () => {
    it('emits plain <a href> for an absolute https URL', () => {
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
                children: [{ type: 'text', value: 'docs' }],
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const para = asVNode(blocks[0]);
      const link = asVNode((para.props.children as unknown[])[0]);
      expect(link.type).toBe('a');
      expect(link.props['href']).toBe('https://example.com');
      expect(link.props).not.toHaveProperty('rel');
      expect(link.props).not.toHaveProperty('target');
    });
  });

  describe('image default — plain <img>, not <Image>', () => {
    it('emits a plain <img> intrinsic element, not an Astro component', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'image',
                url: 'https://cdn.example.com/x.png',
                alt: 'x',
                title: null,
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const para = asVNode(blocks[0]);
      const img = asVNode((para.props.children as unknown[])[0]);
      expect(img.type).toBe('img');
      expect(img.props['src']).toBe('https://cdn.example.com/x.png');
      expect(img.props['alt']).toBe('x');
    });
  });

  describe('text handler — returns string directly', () => {
    it('lets text values render as native Astro strings', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'hi' }],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const para = asVNode(blocks[0]);
      const children = para.props.children as unknown[];
      expect(children).toEqual(['hi']);
    });
  });

  describe('required overrides', () => {
    it('calls the consumer-provided assetReference handler', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'assetReference',
                assetId,
                alt: 'a',
                title: null,
              },
            ],
          },
        ],
      };
      const blocks = asVNode(mdastRender(root, minimalOverrides)).props
        .children as unknown[];
      const para = asVNode(blocks[0]);
      const children = para.props.children as unknown[];
      expect(children[0]).toBe(`asset:${assetId}`);
    });

    it('calls the consumer-provided entryReference handler with rendered children', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'entryReference',
                collectionId,
                entryId,
                children: [{ type: 'text', value: 'click' }],
              },
            ],
          },
        ],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        entryReference: (node, children) =>
          `entry:${node.entryId}(${children.join('')})`,
      };
      const blocks = asVNode(mdastRender(root, overrides)).props
        .children as unknown[];
      const para = asVNode(blocks[0]);
      const children = para.props.children as unknown[];
      expect(children[0]).toBe(`entry:${entryId}(click)`);
    });

    it('calls the consumer-provided html handler', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          { type: 'html', value: '<aside>n</aside>' },
        ],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        html: (node) => `html:${node.value}`,
      };
      const blocks = asVNode(mdastRender(root, overrides)).props
        .children as unknown[];
      expect(blocks[0]).toBe('html:<aside>n</aside>');
    });

    it("accepts () => null for a required handler as a conscious 'render nothing' choice", () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          { type: 'html', value: '<x/>' },
        ],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        html: () => null,
      };
      const blocks = asVNode(mdastRender(root, overrides)).props
        .children as unknown[];
      expect(blocks[0]).toBeNull();
    });
  });

  describe('spread / override', () => {
    it('lets a consumer override one default and keep the rest', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'Title' }],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'body' }],
          },
        ],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        heading: (node, children) =>
          jsx(`h${node.depth}`, { id: 'custom-id', children }),
      };
      const blocks = asVNode(mdastRender(root, overrides)).props
        .children as unknown[];
      const heading = asVNode(blocks[0]);
      expect(heading.type).toBe('h2');
      expect(heading.props['id']).toBe('custom-id');
      // paragraph still uses the default
      expect(asVNode(blocks[1]).type).toBe('p');
    });
  });

  describe('type-level — required overrides enforced', () => {
    it('compiles when html, assetReference, entryReference are provided', () => {
      const ok: MdastAstroRenderers = {
        html: () => null,
        assetReference: () => null,
        entryReference: () => null,
      };
      expectTypeOf(ok).toMatchTypeOf<MdastAstroRenderers>();
    });

    it('rejects an overrides object missing assetReference', () => {
      // @ts-expect-error — assetReference is required
      const bad: MdastAstroRenderers = {
        html: () => null,
        entryReference: () => null,
      };
      // Reference the variable so unused-variable rules don't drop the line.
      expect(bad).toBeDefined();
    });

    it('rejects an overrides object missing entryReference', () => {
      // @ts-expect-error — entryReference is required
      const bad: MdastAstroRenderers = {
        html: () => null,
        assetReference: () => null,
      };
      expect(bad).toBeDefined();
    });

    it('rejects an overrides object missing html', () => {
      // @ts-expect-error — html is required
      const bad: MdastAstroRenderers = {
        assetReference: () => null,
        entryReference: () => null,
      };
      expect(bad).toBeDefined();
    });
  });

  describe('astroDefaults coverage', () => {
    it('covers every defaulted key (no undefined entries in the map)', () => {
      const defaultedKeys = [
        'root',
        'heading',
        'paragraph',
        'blockquote',
        'list',
        'listItem',
        'code',
        'thematicBreak',
        'table',
        'tableRow',
        'tableCell',
        'footnoteDefinition',
        'text',
        'inlineCode',
        'emphasis',
        'strong',
        'delete',
        'link',
        'image',
        'break',
        'footnoteReference',
      ] as const;
      for (const key of defaultedKeys) {
        expect(astroDefaults).toHaveProperty(key);
        expect(typeof astroDefaults[key]).toBe('function');
      }
    });
  });
});
