import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  footnoteWayBackIdentifier,
  isInTightListItem,
  mdastRender,
  extractText,
  isTableHeaderCell,
  tableCellAlign,
  taskItemChecked,
  type LeafHandler,
  type MdastNodeContext,
  type MdastRenderersBase,
  type ParentHandler,
} from './mdastRender.js';
import type {
  MdAstBlockNode,
  MdAstListItem,
  MdAstRoot,
  MdAstTableAlign,
  MdAstTableCell,
  MdAstText,
} from '../schema/valueSchema.js';

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

/** A table of one `align` entry per column and one row per array of texts. */
function tableRoot(align: MdAstTableAlign[], rows: string[][]): MdAstRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'table',
        align,
        children: rows.map((cells) => ({
          type: 'tableRow',
          // The empty string stands for a cell with no content at all,
          // which is what a blank markdown cell parses to.
          children: cells.map((value) => ({
            type: 'tableCell',
            children: value === '' ? [] : [{ type: 'text', value }],
          })),
        })),
      },
    ],
  };
}

/** What a `tableCell` override can answer about the cell it was handed. */
interface SeenCell {
  text: string;
  index: number;
  isHeader: boolean;
  align: MdAstTableAlign;
}

/**
 * Renders a table and records, per cell, everything its context answers.
 * Returns nothing from the cell handler, so what is asserted is the
 * mechanism rather than any markup.
 */
function recordCells(root: MdAstRoot): SeenCell[] {
  const seen: SeenCell[] = [];
  const recording: MdastRenderersBase<string> = {
    ...stringRenderers,
    tableCell: (node, _children, context) => {
      seen.push({
        text: extractText(node),
        index: context.index,
        isHeader: isTableHeaderCell(context),
        align: tableCellAlign(context),
      });
      return '';
    },
  };
  mdastRender(root, recording);
  return seen;
}

/** A paragraph holding one text node */
function paragraphOf(value: string): MdAstBlockNode {
  return { type: 'paragraph', children: [{ type: 'text', value }] };
}

/** An item of the given spreading and checked state, holding given blocks */
function itemOf(
  spread: boolean | null,
  children: MdAstBlockNode[],
  checked: boolean | null = null
): MdAstListItem {
  return { type: 'listItem', spread, checked, children };
}

/** An unordered list of the given spreading, holding the given items */
function listRoot(spread: boolean | null, items: MdAstListItem[]): MdAstRoot {
  return {
    type: 'root',
    children: [
      { type: 'list', ordered: false, start: null, spread, children: items },
    ],
  };
}

/** A footnote holding the given blocks */
function footnoteRoot(children: MdAstBlockNode[]): MdAstRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'footnoteDefinition',
        identifier: 'n1',
        label: null,
        children,
      },
    ],
  };
}

/** What a `paragraph` override can answer about the paragraph it was handed. */
interface SeenParagraph {
  text: string;
  isTight: boolean;
  checked: boolean | null;
  wayBack: string | null;
}

/**
 * Renders a tree and records, per paragraph, what its context answers about
 * the three placements. Returns nothing from the handler, so what is asserted
 * is the mechanism rather than any markup.
 */
function recordParagraphs(root: MdAstRoot): SeenParagraph[] {
  const seen: SeenParagraph[] = [];
  const recording: MdastRenderersBase<string> = {
    ...stringRenderers,
    paragraph: (node, _children, context) => {
      seen.push({
        text: extractText(node),
        isTight: isInTightListItem(context),
        checked: taskItemChecked(context),
        wayBack: footnoteWayBackIdentifier(context),
      });
      return '';
    },
  };
  mdastRender(root, recording);
  return seen;
}

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

  it('hands each node its index among its siblings and its ancestors', () => {
    const seen: { value: string; index: number; ancestors: string[] }[] = [];
    const recording: MdastRenderersBase<string> = {
      ...stringRenderers,
      text: (node, context) => {
        seen.push({
          value: node.value,
          index: context.index,
          ancestors: context.ancestors.map((a) => a.type),
        });
        return node.value;
      },
    };
    const root: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'a' },
            {
              type: 'strong',
              children: [{ type: 'text', value: 'b' }],
            },
          ],
        },
      ],
    };
    mdastRender(root, recording);
    expect(seen).toEqual([
      { value: 'a', index: 0, ancestors: ['root', 'paragraph'] },
      { value: 'b', index: 0, ancestors: ['root', 'paragraph', 'strong'] },
    ]);
  });

  it('hands the root an empty ancestor list', () => {
    let seen: MdastNodeContext | undefined;
    const recording: MdastRenderersBase<string> = {
      ...stringRenderers,
      root: (_, children, context) => {
        seen = context;
        return children.join('');
      },
    };
    mdastRender({ type: 'root', children: [] }, recording);
    expect(seen).toEqual({ index: 0, ancestors: [] });
  });

  it('hands a parent the very node its children name as their parent', () => {
    // ancestors.at(-1) is the parent, which is why no parent field exists.
    let parent: unknown;
    const recording: MdastRenderersBase<string> = {
      ...stringRenderers,
      text: (_, context) => {
        parent = context.ancestors.at(-1);
        return '';
      },
    };
    const paragraph = {
      type: 'paragraph' as const,
      children: [{ type: 'text' as const, value: 'a' }],
    };
    mdastRender({ type: 'root', children: [paragraph] }, recording);
    expect(parent).toBe(paragraph);
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
    expect(mdastRender(root, customRoot)).toBe(
      '<article><p>wrap me</p></article>'
    );
  });
});

describe('a table cell asks its context where it sits', () => {
  it('answers the header row and the column alignment for every cell', () => {
    const seen = recordCells(
      tableRoot(
        ['left', null, 'right'],
        [
          ['H1', 'H2', 'H3'],
          ['a', 'b', 'c'],
        ]
      )
    );
    expect(seen).toEqual([
      { text: 'H1', index: 0, isHeader: true, align: 'left' },
      { text: 'H2', index: 1, isHeader: true, align: null },
      { text: 'H3', index: 2, isHeader: true, align: 'right' },
      { text: 'a', index: 0, isHeader: false, align: 'left' },
      { text: 'b', index: 1, isHeader: false, align: null },
      { text: 'c', index: 2, isHeader: false, align: 'right' },
    ]);
  });

  it('answers null alignment for a column the align array does not cover', () => {
    const seen = recordCells(tableRoot(['center'], [['H1', 'H2']]));
    expect(seen).toEqual([
      { text: 'H1', index: 0, isHeader: true, align: 'center' },
      { text: 'H2', index: 1, isHeader: true, align: null },
    ]);
  });

  it('answers header for an empty cell in the header row', () => {
    const seen = recordCells(tableRoot([null, null], [['', 'H2']]));
    expect(seen).toEqual([
      { text: '', index: 0, isHeader: true, align: null },
      { text: 'H2', index: 1, isHeader: true, align: null },
    ]);
  });

  it('answers no for a cell of the only row when that row is the body', () => {
    // Nothing in mdast marks a header row, so the first row is the header
    // and a table of one row has no body. Both helpers answer from that.
    const seen = recordCells(tableRoot([null], [['H1'], ['a']]));
    expect(seen.map((cell) => cell.isHeader)).toEqual([true, false]);
  });

  it('answers no and null outside a table', () => {
    const outside: MdastNodeContext = { index: 0, ancestors: [] };
    expect(isTableHeaderCell(outside)).toBe(false);
    expect(tableCellAlign(outside)).toBeNull();
  });
});

describe('a paragraph asks its context what it has to place', () => {
  it('answers tight for every paragraph of a tight list', () => {
    const seen = recordParagraphs(
      listRoot(false, [
        itemOf(false, [paragraphOf('one')]),
        itemOf(false, [paragraphOf('two')]),
      ])
    );
    expect(seen.map((one) => one.isTight)).toEqual([true, true]);
  });

  it("answers loose for every item when the list's own spread is true", () => {
    const seen = recordParagraphs(
      listRoot(true, [
        itemOf(false, [paragraphOf('one')]),
        itemOf(false, [paragraphOf('two')]),
      ])
    );
    expect(seen.map((one) => one.isTight)).toEqual([false, false]);
  });

  it('answers loose for every item when one item spreads', () => {
    const seen = recordParagraphs(
      listRoot(false, [
        itemOf(false, [paragraphOf('one')]),
        itemOf(true, [paragraphOf('two')]),
      ])
    );
    expect(seen.map((one) => one.isTight)).toEqual([false, false]);
  });

  it('reads an item carrying no spread off its block count', () => {
    const one = recordParagraphs(
      listRoot(null, [itemOf(null, [paragraphOf('a')])])
    );
    expect(one.map((seen) => seen.isTight)).toEqual([true]);
    const two = recordParagraphs(
      listRoot(null, [itemOf(null, [paragraphOf('a'), paragraphOf('b')])])
    );
    expect(two.map((seen) => seen.isTight)).toEqual([false, false]);
  });

  it("answers loose for a paragraph that is not the item's own child", () => {
    // A quote inside a tight item keeps its own paragraph, so only a
    // paragraph directly in the item loses the <p>.
    const seen = recordParagraphs(
      listRoot(false, [
        itemOf(false, [
          { type: 'blockquote', children: [paragraphOf('quote')] },
        ]),
      ])
    );
    expect(seen.map((one) => one.isTight)).toEqual([false]);
  });

  it('answers the checked state on the first block of a task item only', () => {
    const seen = recordParagraphs(
      listRoot(true, [
        itemOf(false, [paragraphOf('first'), paragraphOf('second')], true),
        itemOf(false, [paragraphOf('open')], false),
        itemOf(false, [paragraphOf('plain')]),
      ])
    );
    expect(seen.map((one) => [one.text, one.checked])).toEqual([
      ['first', true],
      ['second', null],
      ['open', false],
      ['plain', null],
    ]);
  });

  it("answers the identifier on the note's last block only", () => {
    const seen = recordParagraphs(
      footnoteRoot([paragraphOf('first'), paragraphOf('last')])
    );
    expect(seen.map((one) => [one.text, one.wayBack])).toEqual([
      ['first', null],
      ['last', 'n1'],
    ]);
  });

  it('answers null for a paragraph nested deeper in the note', () => {
    // The way back follows the note's blocks there, so a paragraph inside
    // the note's last list must not take it as well.
    const seen = recordParagraphs(
      footnoteRoot([
        {
          type: 'list',
          ordered: false,
          start: null,
          spread: false,
          children: [itemOf(false, [paragraphOf('item')])],
        },
      ])
    );
    expect(seen.map((one) => [one.text, one.wayBack])).toEqual([
      ['item', null],
    ]);
  });

  it('answers false and null outside a list and a note', () => {
    const outside: MdastNodeContext = { index: 0, ancestors: [] };
    expect(isInTightListItem(outside)).toBe(false);
    expect(taskItemChecked(outside)).toBeNull();
    expect(footnoteWayBackIdentifier(outside)).toBeNull();
  });
});

describe('type level - a handler may ignore the context', () => {
  it('accepts a parent handler declaring only node and children', () => {
    // Every renderers object written before the context existed stays
    // assignable, which is what keeps a consumer compiling untouched.
    const twoParameters = (_node: MdAstTableCell, children: string[]) =>
      `<td>${children.join('')}</td>`;
    expectTypeOf(twoParameters).toMatchTypeOf<
      MdastRenderersBase<string>['tableCell']
    >();
  });

  it('accepts a leaf handler declaring only the node', () => {
    const oneParameter = (node: MdAstText) => node.value;
    expectTypeOf(oneParameter).toMatchTypeOf<
      MdastRenderersBase<string>['text']
    >();
  });

  it('names the two handler shapes without changing either of them', () => {
    // The keys spell their signature through ParentHandler and LeafHandler,
    // so the aliases have to be exactly what each key held before.
    expectTypeOf<ParentHandler<MdAstTableCell, string>>().toEqualTypeOf<
      MdastRenderersBase<string>['tableCell']
    >();
    expectTypeOf<LeafHandler<MdAstText, string>>().toEqualTypeOf<
      MdastRenderersBase<string>['text']
    >();
  });

  it('accepts a total renderers object built entirely of such handlers', () => {
    // stringRenderers above is exactly that object, declared with no
    // context parameter anywhere.
    expectTypeOf(stringRenderers).toMatchTypeOf<MdastRenderersBase<string>>();
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
