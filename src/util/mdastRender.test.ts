import { describe, it, expect } from 'vitest';
import {
  mdastRender,
  extractText,
  type MdastRenderersBase,
} from './mdastRender.js';
import type { MdAstRoot } from '../schema/valueSchema.js';

const collectionId = '11111111-2222-3333-4444-555555555555';
const entryId = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

const stringRenderers: MdastRenderersBase<string> = {
  root: (_, children) => children.join(''),
  paragraph: (_, children) => `<p>${children.join('')}</p>`,
  heading: (node, children) =>
    `<h${node.depth}>${children.join('')}</h${node.depth}>`,
  blockquote: (_, children) => `<blockquote>${children.join('')}</blockquote>`,
  list: (node, children) =>
    node.ordered
      ? `<ol>${children.join('')}</ol>`
      : `<ul>${children.join('')}</ul>`,
  listItem: (_, children) => `<li>${children.join('')}</li>`,
  code: (node) => `<pre><code>${node.value}</code></pre>`,
  thematicBreak: () => `<hr/>`,
  html: (node) => node.value,
  table: (_, children) => `<table>${children.join('')}</table>`,
  tableRow: (_, children) => `<tr>${children.join('')}</tr>`,
  tableCell: (_, children) => `<td>${children.join('')}</td>`,
  footnoteDefinition: (node, children) =>
    `<div id="fn-${node.identifier}">${children.join('')}</div>`,
  text: (node) => node.value,
  inlineCode: (node) => `<code>${node.value}</code>`,
  break: () => `<br/>`,
  emphasis: (_, children) => `<em>${children.join('')}</em>`,
  strong: (_, children) => `<strong>${children.join('')}</strong>`,
  delete: (_, children) => `<del>${children.join('')}</del>`,
  link: (node, children) => `<a href="${node.url}">${children.join('')}</a>`,
  image: (node) => `<img src="${node.url}" alt="${node.alt}"/>`,
  footnoteReference: (node) =>
    `<sup><a href="#fn-${node.identifier}">${node.identifier}</a></sup>`,
  assetReference: (node) => `<asset id="${node.assetId}" alt="${node.alt}"/>`,
  entryReference: (node, children) =>
    `<entry id="${node.entryId}">${children.join('')}</entry>`,
};

describe('mdastRender (primitive)', () => {
  it('renders a single paragraph with text', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'hello' }] },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe('<p>hello</p>');
  });

  it('renders headings of every depth', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'a' }] },
        { type: 'heading', depth: 2, children: [{ type: 'text', value: 'b' }] },
        { type: 'heading', depth: 3, children: [{ type: 'text', value: 'c' }] },
        { type: 'heading', depth: 4, children: [{ type: 'text', value: 'd' }] },
        { type: 'heading', depth: 5, children: [{ type: 'text', value: 'e' }] },
        { type: 'heading', depth: 6, children: [{ type: 'text', value: 'f' }] },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>'
    );
  });

  it('renders nested phrasing (emphasis inside strong inside paragraph)', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'strong',
              children: [
                {
                  type: 'emphasis',
                  children: [{ type: 'text', value: 'bold-italic' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<p><strong><em>bold-italic</em></strong></p>'
    );
  });

  it('renders ordered and unordered lists with list items', () => {
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
                  children: [{ type: 'text', value: 'one' }],
                },
              ],
            },
            {
              type: 'listItem',
              spread: false,
              checked: null,
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', value: 'two' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<ol><li><p>one</p></li><li><p>two</p></li></ol>'
    );
  });

  it('renders a table with row and cell handlers', () => {
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
    expect(mdastRender(root, stringRenderers)).toBe(
      '<table><tr><td>H1</td><td>H2</td></tr><tr><td>a</td><td>b</td></tr></table>'
    );
  });

  it('renders custom references (assetReference, entryReference)', () => {
    const root: MdAstRoot = {
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
            { type: 'text', value: ' or download ' },
            {
              type: 'assetReference',
              assetId,
              alt: 'spec',
              title: null,
            },
            { type: 'text', value: '.' },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      `<p>See <entry id="${entryId}">tutorial</entry> or download <asset id="${assetId}" alt="spec"/>.</p>`
    );
  });

  it('renders leaf nodes without children handlers (code, thematicBreak, break, image, html)', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'code',
          lang: 'ts',
          meta: null,
          value: 'const x = 1;',
        },
        { type: 'thematicBreak' },
        { type: 'html', value: '<aside>note</aside>' },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'before' },
            { type: 'break' },
            { type: 'text', value: 'after' },
            {
              type: 'image',
              url: 'https://example.com/x.png',
              alt: 'x',
              title: null,
            },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<pre><code>const x = 1;</code></pre>' +
        '<hr/>' +
        '<aside>note</aside>' +
        '<p>before<br/>after<img src="https://example.com/x.png" alt="x"/></p>'
    );
  });

  it('renders footnote references and definitions in tree order', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'see' },
            { type: 'footnoteReference', identifier: 'note', label: null },
          ],
        },
        {
          type: 'footnoteDefinition',
          identifier: 'note',
          label: null,
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'fn body' }],
            },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<p>see<sup><a href="#fn-note">note</a></sup></p>' +
        '<div id="fn-note"><p>fn body</p></div>'
    );
  });

  it('renders inline code, strikethrough, and links', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'use ' },
            { type: 'inlineCode', value: 'foo()' },
            { type: 'text', value: ' or ' },
            {
              type: 'delete',
              children: [{ type: 'text', value: 'bar' }],
            },
            { type: 'text', value: '. See ' },
            {
              type: 'link',
              url: 'https://example.com',
              title: null,
              children: [{ type: 'text', value: 'docs' }],
            },
            { type: 'text', value: '.' },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<p>use <code>foo()</code> or <del>bar</del>. See <a href="https://example.com">docs</a>.</p>'
    );
  });

  it('renders nested blockquote containing a list', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
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
                      children: [{ type: 'text', value: 'nested' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(mdastRender(root, stringRenderers)).toBe(
      '<blockquote><ul><li><p>nested</p></li></ul></blockquote>'
    );
  });

  it('passes already-rendered children to parent handlers (children-first)', () => {
    // Capture call order via a stateful renderer: every handler appends its
    // type to a log, then returns the joined children. We assert the log
    // shows leaves rendered before parents.
    const log: string[] = [];
    const traceRenderers: MdastRenderersBase<string> = {
      ...stringRenderers,
      paragraph: (_, children) => {
        log.push('paragraph');
        return children.join('');
      },
      emphasis: (_, children) => {
        log.push('emphasis');
        return children.join('');
      },
      text: (node) => {
        log.push(`text:${node.value}`);
        return node.value;
      },
      root: (_, children) => {
        log.push('root');
        return children.join('');
      },
    };
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'emphasis',
              children: [{ type: 'text', value: 'a' }],
            },
          ],
        },
      ],
    };
    mdastRender(root, traceRenderers);
    expect(log).toEqual(['text:a', 'emphasis', 'paragraph', 'root']);
  });

  it('returns whatever the root handler returns (default wrapping is renderers concern)', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'wrap me' }],
        },
      ],
    };
    const customRoot: MdastRenderersBase<string> = {
      ...stringRenderers,
      root: (_, children) => `<article>${children.join('')}</article>`,
    };
    expect(mdastRender(root, customRoot)).toBe('<article><p>wrap me</p></article>');
  });
});

describe('extractText', () => {
  it('concatenates text across nested phrasing and blocks', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'Title' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Hello ' },
            {
              type: 'strong',
              children: [
                {
                  type: 'emphasis',
                  children: [{ type: 'text', value: 'world' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(extractText(root)).toBe('Title Hello world');
  });

  it('keeps inline content glued and only separates block siblings', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'This is ' },
            { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
            { type: 'text', value: ' text' },
          ],
        },
      ],
    };
    expect(extractText(root)).toBe('This is bold text');
  });

  it('joins block siblings with a custom separator', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: 'Title' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Body' }],
        },
      ],
    };
    expect(extractText(root, '\n')).toBe('Title\nBody');
    expect(extractText(root, '')).toBe('TitleBody');
  });

  it('includes inline code and code block values', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'use ' },
            { type: 'inlineCode', value: 'foo()' },
          ],
        },
        { type: 'code', lang: 'ts', meta: null, value: 'const x = 1;' },
      ],
    };
    expect(extractText(root)).toBe('use foo() const x = 1;');
  });

  it('extracts text from list items and table cells', () => {
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
        {
          type: 'table',
          align: [null],
          children: [
            {
              type: 'tableRow',
              children: [
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
    expect(extractText(root)).toBe('a b');
  });

  it('ignores raw html, images, breaks and other non-text leaves', () => {
    const root: MdAstRoot = {
      type: 'root',
      children: [
        { type: 'html', value: '<aside>x</aside>' },
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'before' },
            { type: 'break' },
            {
              type: 'image',
              url: 'https://example.com/x.png',
              alt: 'pic',
              title: null,
            },
            { type: 'text', value: 'after' },
          ],
        },
      ],
    };
    expect(extractText(root)).toBe('beforeafter');
  });

  it('accepts a single node, not just the root', () => {
    expect(extractText({ type: 'text', value: 'hi' })).toBe('hi');
  });
});
