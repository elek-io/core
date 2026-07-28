/// <reference types="astro/astro-jsx" />

import { describe, it, expect, expectTypeOf } from 'vitest';
import { renderTemplate } from 'astro/runtime/server/index.js';
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
 * Minimal renderers - just the three required overrides, every default
 * present in `astroDefaults` is left to apply.
 */
const minimalOverrides: MdastAstroRenderers = {
  html: (node) => node.value,
  assetReference: (node) => `asset:${node.assetId}`,
  entryReference: (node) => `entry:${node.entryId}`,
};

/**
 * Renders a value the way Astro renders a template expression.
 *
 * Interpolating it into a `renderTemplate` puts it through the same
 * `renderChild` dispatch an `.astro` file uses, which is the whole
 * point: a value renderChild cannot handle is written as
 * "[object Object]" here exactly as it would be on a page. Rendering
 * is synchronous for everything the defaults produce.
 */
function renderToHtml(value: unknown): string {
  let html = '';
  const destination = {
    write(chunk: unknown) {
      html += String(chunk);
    },
  };
  const pending = renderTemplate`${value}`.render(destination);
  if (pending instanceof Promise) {
    throw new Error('a default rendered asynchronously, which none should');
  }
  return html;
}

/** Renders a whole tree with the minimal overrides applied */
function render(root: MdAstRoot, overrides = minimalOverrides): string {
  return renderToHtml(mdastRender(root, overrides));
}

/** A root holding a single paragraph of text */
function paragraphRoot(value: string): MdAstRoot {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value }] }],
  };
}

describe('mdastRender (Astro wrapper)', () => {
  describe('renderable anywhere', () => {
    it('renders through renderChild rather than needing a page-level pass', () => {
      // The invariant behind every assertion below. An astro/jsx-runtime
      // vnode only renders at the top level of a page, so an element
      // built from one stringifies to "[object Object]" inside an .astro
      // component. Everything the defaults produce has to survive
      // renderChild instead. See contributing/astro-entry.md.
      expect(render(paragraphRoot('hi'))).not.toContain('[object Object]');
    });

    it('renders every default without producing [object Object]', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'h' }],
          },
          { type: 'paragraph', children: [{ type: 'text', value: 'p' }] },
          {
            type: 'blockquote',
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'q' }] },
            ],
          },
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
                    children: [{ type: 'text', value: 'i' }],
                  },
                ],
              },
            ],
          },
          { type: 'code', lang: null, meta: null, value: 'x' },
          { type: 'thematicBreak' },
          {
            type: 'table',
            align: [null],
            children: [
              {
                type: 'tableRow',
                children: [
                  {
                    type: 'tableCell',
                    children: [{ type: 'text', value: 'c' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'footnoteDefinition',
            identifier: 'n1',
            label: null,
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'f' }] },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { type: 'inlineCode', value: 'c' },
              { type: 'emphasis', children: [{ type: 'text', value: 'e' }] },
              { type: 'strong', children: [{ type: 'text', value: 's' }] },
              { type: 'delete', children: [{ type: 'text', value: 'd' }] },
              {
                type: 'link',
                url: 'https://example.com',
                title: null,
                children: [{ type: 'text', value: 'l' }],
              },
              {
                type: 'image',
                url: 'https://cdn.example.com/x.png',
                alt: 'x',
                title: null,
              },
              { type: 'break' },
              { type: 'footnoteReference', identifier: 'n1', label: null },
            ],
          },
        ],
      };

      expect(render(root)).not.toContain('[object Object]');
    });
  });

  describe('root combiner', () => {
    it('concatenates top-level blocks without a wrapper by default', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'one' }] },
          { type: 'paragraph', children: [{ type: 'text', value: 'two' }] },
        ],
      };
      expect(render(root)).toBe('<p>one</p><p>two</p>');
    });

    it('allows the consumer to override root to wrap in <article>', () => {
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        root: (_, children) => renderTemplate`<article>${children}</article>`,
      };
      expect(render(paragraphRoot('hi'), overrides)).toBe(
        '<article><p>hi</p></article>'
      );
    });
  });

  describe('paragraph / heading / inline defaults', () => {
    it('renders paragraph as <p>', () => {
      expect(render(paragraphRoot('hello'))).toBe('<p>hello</p>');
    });

    it('renders heading with computed h${depth} tag', () => {
      for (const depth of [1, 2, 3, 4, 5, 6] as const) {
        const root: MdAstRoot = {
          type: 'root',
          children: [
            {
              type: 'heading',
              depth,
              children: [{ type: 'text', value: 'x' }],
            },
          ],
        };
        expect(render(root)).toBe(`<h${depth}>x</h${depth}>`);
      }
    });

    it('renders emphasis / strong / delete with semantic tags', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'emphasis', children: [{ type: 'text', value: 'em' }] },
              { type: 'strong', children: [{ type: 'text', value: 'st' }] },
              { type: 'delete', children: [{ type: 'text', value: 'del' }] },
            ],
          },
        ],
      };
      expect(render(root)).toBe(
        '<p><em>em</em><strong>st</strong><del>del</del></p>'
      );
    });
  });

  describe('block and inline defaults (blockquote, hr, footnotes, inlineCode, break)', () => {
    it('renders blockquote as <blockquote>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'blockquote',
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'q' }] },
            ],
          },
        ],
      };
      expect(render(root)).toBe('<blockquote><p>q</p></blockquote>');
    });

    it('renders thematicBreak as <hr>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [{ type: 'thematicBreak' }],
      };
      expect(render(root)).toBe('<hr>');
    });

    it('renders footnoteDefinition as <div id="fn-...">', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'footnoteDefinition',
            identifier: 'n1',
            label: null,
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'fn' }] },
            ],
          },
        ],
      };
      expect(render(root)).toBe('<div id="fn-n1"><p>fn</p></div>');
    });

    it('renders inlineCode as <code> and break as <br>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'inlineCode', value: 'x' }, { type: 'break' }],
          },
        ],
      };
      expect(render(root)).toBe('<p><code>x</code><br></p>');
    });

    it('renders footnoteReference as <sup><a href="#fn-..."></sup>', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'footnoteReference', identifier: 'n1', label: null },
            ],
          },
        ],
      };
      expect(render(root)).toBe('<p><sup><a href="#fn-n1">n1</a></sup></p>');
    });
  });

  describe('list and listItem defaults', () => {
    function listRoot(ordered: boolean): MdAstRoot {
      return {
        type: 'root',
        children: [
          {
            type: 'list',
            ordered,
            start: ordered ? 1 : null,
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
    }

    it('renders ordered list as <ol>', () => {
      expect(render(listRoot(true))).toBe('<ol><li><p>a</p></li></ol>');
    });

    it('renders unordered list as <ul>', () => {
      expect(render(listRoot(false))).toBe('<ul><li><p>a</p></li></ul>');
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
      expect(render(root)).toBe('<table><tr><td>a</td></tr></table>');
    });
  });

  describe('code default - no language class', () => {
    it('emits plain <pre><code> without a class even when lang is set', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          { type: 'code', lang: 'ts', meta: null, value: 'const x = 1;' },
        ],
      };
      expect(render(root)).toBe('<pre><code>const x = 1;</code></pre>');
    });

    it('escapes the code value rather than emitting it as markup', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          { type: 'code', lang: null, meta: null, value: '<script>x</script>' },
        ],
      };
      expect(render(root)).toBe(
        '<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>'
      );
    });
  });

  describe('link default - no rel / target', () => {
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
      const html = render(root);
      expect(html).toBe('<p><a href="https://example.com">docs</a></p>');
      expect(html).not.toContain('rel=');
      expect(html).not.toContain('target=');
    });

    it('emits the title attribute only when the node carries one', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'https://example.com',
                title: 'Docs',
                children: [{ type: 'text', value: 'docs' }],
              },
            ],
          },
        ],
      };
      expect(render(root)).toBe(
        '<p><a href="https://example.com" title="Docs">docs</a></p>'
      );
    });
  });

  describe('image default - plain <img>, not <Image>', () => {
    it('emits a plain <img> element with src and alt', () => {
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
      expect(render(root)).toBe(
        '<p><img src="https://cdn.example.com/x.png" alt="x"></p>'
      );
    });
  });

  describe('text handler - returns string directly', () => {
    it('lets text values render as native Astro strings', () => {
      expect(render(paragraphRoot('hi'))).toBe('<p>hi</p>');
    });

    it('escapes text rather than emitting it as markup', () => {
      expect(render(paragraphRoot('<b>x</b>'))).toBe(
        '<p>&lt;b&gt;x&lt;/b&gt;</p>'
      );
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
              { type: 'assetReference', assetId, alt: 'a', title: null },
            ],
          },
        ],
      };
      expect(render(root)).toBe(`<p>asset:${assetId}</p>`);
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
          renderTemplate`<a href="/${node.entryId}">${children}</a>`,
      };
      expect(render(root, overrides)).toBe(
        `<p><a href="/${entryId}">click</a></p>`
      );
    });

    it('calls the consumer-provided html handler', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [{ type: 'html', value: '<aside>n</aside>' }],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        html: (node) => `html:${node.value}`,
      };
      expect(render(root, overrides)).toContain('html:');
    });

    it("accepts () => null for a required handler as a conscious 'render nothing' choice", () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [{ type: 'html', value: '<x/>' }],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        html: () => null,
      };
      expect(render(root, overrides)).toBe('');
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
          { type: 'paragraph', children: [{ type: 'text', value: 'body' }] },
        ],
      };
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        heading: (_node, children) =>
          renderTemplate`<h2 id="custom-id">${children}</h2>`,
      };
      expect(render(root, overrides)).toBe(
        '<h2 id="custom-id">Title</h2><p>body</p>'
      );
    });
  });

  describe('type-level - required overrides enforced', () => {
    it('compiles when html, assetReference, entryReference are provided', () => {
      const ok: MdastAstroRenderers = {
        html: () => null,
        assetReference: () => null,
        entryReference: () => null,
      };
      expectTypeOf(ok).toMatchTypeOf<MdastAstroRenderers>();
    });

    it('rejects an overrides object missing assetReference', () => {
      // @ts-expect-error - assetReference is required
      const bad: MdastAstroRenderers = {
        html: () => null,
        entryReference: () => null,
      };
      // Reference the variable so unused-variable rules don't drop the line.
      expect(bad).toBeDefined();
    });

    it('rejects an overrides object missing entryReference', () => {
      // @ts-expect-error - entryReference is required
      const bad: MdastAstroRenderers = {
        html: () => null,
        assetReference: () => null,
      };
      expect(bad).toBeDefined();
    });

    it('rejects an overrides object missing html', () => {
      // @ts-expect-error - html is required
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
