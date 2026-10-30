/// <reference types="astro/astro-jsx" />

import { describe, it, expect, expectTypeOf } from 'vitest';
import { addAttribute, renderTemplate } from 'astro/runtime/server/index.js';
import {
  mdastRender,
  astroDefaults,
  type MdastAstroRenderers,
} from './mdastRender.js';
import {
  isTableHeaderCell,
  tableCellAlign,
  type MdastNodeContext,
} from '../util/mdastRender.js';
import type {
  MdAstBlockNode,
  MdAstBlockquote,
  MdAstBreak,
  MdAstCode,
  MdAstDelete,
  MdAstEmphasis,
  MdAstFootnoteDefinition,
  MdAstFootnoteReference,
  MdAstHeading,
  MdAstImage,
  MdAstInlineCode,
  MdAstLink,
  MdAstList,
  MdAstListItem,
  MdAstParagraph,
  MdAstPhrasingNode,
  MdAstRoot,
  MdAstStrong,
  MdAstTable,
  MdAstTableAlign,
  MdAstTableCell,
  MdAstTableRow,
  MdAstText,
  MdAstThematicBreak,
} from '../schema/valueSchema.js';

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

/** The tree a block node is rendered in: the only child of the root */
function blockTree(node: MdAstBlockNode): MdAstRoot {
  return { type: 'root', children: [node] };
}

/** The tree a phrasing node is rendered in: the only child of a paragraph */
function phrasingTree(node: MdAstPhrasingNode): MdAstRoot {
  return { type: 'root', children: [{ type: 'paragraph', children: [node] }] };
}

/** The tree a list item is rendered in, inside an unordered list */
function listItemTree(node: MdAstListItem): MdAstRoot {
  return blockTree({
    type: 'list',
    ordered: false,
    start: null,
    spread: false,
    children: [node],
  });
}

/** The tree a table row is rendered in, inside a table */
function tableRowTree(node: MdAstTableRow): MdAstRoot {
  return blockTree({ type: 'table', align: [null], children: [node] });
}

/** The tree a table cell is rendered in, inside a table's only row */
function tableCellTree(node: MdAstTableCell): MdAstRoot {
  return tableRowTree({ type: 'tableRow', children: [node] });
}

/** A paragraph holding one text node */
function paragraphOf(value: string): MdAstParagraph {
  return { type: 'paragraph', children: [{ type: 'text', value }] };
}

/**
 * What a default does with one field of its node: a substring of the rendered
 * HTML that only this field's value can have produced, or the reason it is
 * deliberately left out plus a substring that proves it really is gone.
 */
type FieldAccount =
  { inOutput: string } | { droppedBecause: string; absentFromOutput: string };

/**
 * Every field a node type carries, each accounted for. A field added to a node
 * schema is a type error here until it is listed, which is what keeps the
 * accounting honest as Core's mdast model grows.
 *
 * `type` is left out on purpose: it is the discriminator the fold dispatches
 * on, so the default running at all is what proves it arrived.
 */
type FieldsOf<N> = { [K in Exclude<keyof N, 'type'>]-?: FieldAccount };

/** One node type, the tree it is rendered in, and the HTML that comes out */
interface DefaultCase {
  type: string;
  tree: MdAstRoot;
  html: string;
  fields: Record<string, FieldAccount>;
  /** The node's field names as they exist at runtime, minus `type` */
  nodeFields: string[];
}

/**
 * Binds one node type's sample, tree, expected HTML and field accounting
 * together, so `fields` is checked against that very node's type.
 */
function defaultCase<N extends { type: string }>(input: {
  node: N;
  tree: MdAstRoot;
  html: string;
  fields: FieldsOf<N> & Record<string, FieldAccount>;
}): DefaultCase {
  return {
    type: input.node.type,
    tree: input.tree,
    html: input.html,
    fields: input.fields,
    nodeFields: Object.keys(input.node).filter((key) => key !== 'type'),
  };
}

const rootNode: MdAstRoot = {
  type: 'root',
  children: [paragraphOf('first block'), paragraphOf('second block')],
};

const paragraphNode: MdAstParagraph = paragraphOf('paragraph text');

const headingNode: MdAstHeading = {
  type: 'heading',
  depth: 3,
  children: [{ type: 'text', value: 'heading text' }],
};

const blockquoteNode: MdAstBlockquote = {
  type: 'blockquote',
  children: [paragraphOf('quoted text')],
};

const listNode: MdAstList = {
  type: 'list',
  ordered: true,
  start: 5,
  spread: false,
  children: [
    {
      type: 'listItem',
      spread: false,
      checked: null,
      children: [paragraphOf('ordered item')],
    },
  ],
};

const listItemNode: MdAstListItem = {
  type: 'listItem',
  spread: false,
  checked: true,
  children: [paragraphOf('task text')],
};

const codeNode: MdAstCode = {
  type: 'code',
  lang: 'typescript',
  meta: 'showLineNumbers',
  value: 'const answer = 42;',
};

const thematicBreakNode: MdAstThematicBreak = { type: 'thematicBreak' };

const tableNode: MdAstTable = {
  type: 'table',
  align: ['left', 'center'],
  children: [
    {
      type: 'tableRow',
      children: [
        { type: 'tableCell', children: [{ type: 'text', value: 'cell text' }] },
      ],
    },
  ],
};

const tableRowNode: MdAstTableRow = {
  type: 'tableRow',
  children: [
    { type: 'tableCell', children: [{ type: 'text', value: 'row cell' }] },
  ],
};

const tableCellNode: MdAstTableCell = {
  type: 'tableCell',
  children: [{ type: 'text', value: 'cell content' }],
};

const footnoteDefinitionNode: MdAstFootnoteDefinition = {
  type: 'footnoteDefinition',
  identifier: 'note-id',
  label: 'Note label',
  children: [paragraphOf('note text')],
};

const textNode: MdAstText = { type: 'text', value: 'plain text' };

const inlineCodeNode: MdAstInlineCode = {
  type: 'inlineCode',
  value: 'inline code',
};

const emphasisNode: MdAstEmphasis = {
  type: 'emphasis',
  children: [{ type: 'text', value: 'emphasized' }],
};

const strongNode: MdAstStrong = {
  type: 'strong',
  children: [{ type: 'text', value: 'strengthened' }],
};

const deleteNode: MdAstDelete = {
  type: 'delete',
  children: [{ type: 'text', value: 'deleted' }],
};

const linkNode: MdAstLink = {
  type: 'link',
  url: 'https://example.com/link',
  title: 'Link title',
  children: [{ type: 'text', value: 'link text' }],
};

const imageNode: MdAstImage = {
  type: 'image',
  url: 'https://cdn.example.com/image.png',
  alt: 'image alt',
  title: 'Image title',
};

const breakNode: MdAstBreak = { type: 'break' };

const footnoteReferenceNode: MdAstFootnoteReference = {
  type: 'footnoteReference',
  identifier: 'ref-id',
  label: 'Ref label',
};

/**
 * One case per defaulted node type: the tree, the single HTML string it
 * renders to, and every field of the node either located in that string or
 * named as deliberately dropped.
 */
const defaultCases: DefaultCase[] = [
  defaultCase({
    node: rootNode,
    tree: rootNode,
    html: '<p>first block</p><p>second block</p>',
    fields: {
      children: { inOutput: '<p>first block</p><p>second block</p>' },
    },
  }),
  defaultCase({
    node: paragraphNode,
    tree: blockTree(paragraphNode),
    html: '<p>paragraph text</p>',
    fields: { children: { inOutput: 'paragraph text' } },
  }),
  defaultCase({
    node: headingNode,
    tree: blockTree(headingNode),
    html: '<h3>heading text</h3>',
    fields: {
      depth: { inOutput: '<h3>' },
      children: { inOutput: 'heading text' },
    },
  }),
  defaultCase({
    node: blockquoteNode,
    tree: blockTree(blockquoteNode),
    html: '<blockquote><p>quoted text</p></blockquote>',
    fields: { children: { inOutput: '<p>quoted text</p>' } },
  }),
  defaultCase({
    node: listNode,
    tree: blockTree(listNode),
    html: '<ol start="5"><li>ordered item</li></ol>',
    fields: {
      ordered: { inOutput: '<ol' },
      start: { inOutput: 'start="5"' },
      // Tight, so the item's paragraph renders as the item's own text. A
      // loose list would keep the <p> around it.
      spread: { inOutput: '<li>ordered item</li>' },
      children: { inOutput: '<li>ordered item</li>' },
    },
  }),
  defaultCase({
    node: listItemNode,
    tree: listItemTree(listItemNode),
    html:
      '<ul><li><label><input type="checkbox" checked disabled>' +
      ' task text</label></li></ul>',
    fields: {
      checked: { inOutput: ' checked disabled>' },
      // Tight, so the box and the text share the item's line instead of
      // sitting in a <p> of their own.
      spread: { inOutput: '<li><label>' },
      children: { inOutput: 'task text</label>' },
    },
  }),
  defaultCase({
    node: codeNode,
    tree: blockTree(codeNode),
    html: '<pre><code>const answer = 42;</code></pre>',
    fields: {
      value: { inOutput: 'const answer = 42;' },
      lang: {
        droppedBecause:
          'every highlighter wants the language somewhere else, so the default names none',
        absentFromOutput: 'typescript',
      },
      meta: {
        droppedBecause:
          'meta is the highlighter options string of whichever highlighter an override brings',
        absentFromOutput: 'showLineNumbers',
      },
    },
  }),
  defaultCase({
    node: thematicBreakNode,
    tree: blockTree(thematicBreakNode),
    html: '<hr>',
    fields: {},
  }),
  defaultCase({
    node: tableNode,
    tree: blockTree(tableNode),
    html: '<table><thead><tr><th scope="col" style="text-align:left">cell text</th></tr></thead></table>',
    fields: {
      align: { inOutput: 'style="text-align:left"' },
      children: {
        inOutput:
          '<tr><th scope="col" style="text-align:left">cell text</th></tr>',
      },
    },
  }),
  defaultCase({
    node: tableRowNode,
    tree: tableRowTree(tableRowNode),
    html: '<table><thead><tr><th scope="col">row cell</th></tr></thead></table>',
    fields: { children: { inOutput: '<th scope="col">row cell</th>' } },
  }),
  defaultCase({
    node: tableCellNode,
    tree: tableCellTree(tableCellNode),
    html: '<table><thead><tr><th scope="col">cell content</th></tr></thead></table>',
    fields: { children: { inOutput: 'cell content' } },
  }),
  defaultCase({
    node: footnoteDefinitionNode,
    tree: blockTree(footnoteDefinitionNode),
    html:
      '<div id="fn-note-id"><p>note text ' +
      '<a href="#fnref-note-id" aria-label="Back to content">↩</a></p></div>',
    fields: {
      identifier: { inOutput: 'id="fn-note-id"' },
      label: {
        droppedBecause:
          'the label is the authored spelling of the identifier and is shown on the reference, not on the note',
        absentFromOutput: 'Note label',
      },
      children: { inOutput: '<p>note text ' },
    },
  }),
  defaultCase({
    node: textNode,
    tree: phrasingTree(textNode),
    html: '<p>plain text</p>',
    fields: { value: { inOutput: 'plain text' } },
  }),
  defaultCase({
    node: inlineCodeNode,
    tree: phrasingTree(inlineCodeNode),
    html: '<p><code>inline code</code></p>',
    fields: { value: { inOutput: 'inline code' } },
  }),
  defaultCase({
    node: emphasisNode,
    tree: phrasingTree(emphasisNode),
    html: '<p><em>emphasized</em></p>',
    fields: { children: { inOutput: 'emphasized' } },
  }),
  defaultCase({
    node: strongNode,
    tree: phrasingTree(strongNode),
    html: '<p><strong>strengthened</strong></p>',
    fields: { children: { inOutput: 'strengthened' } },
  }),
  defaultCase({
    node: deleteNode,
    tree: phrasingTree(deleteNode),
    html: '<p><del>deleted</del></p>',
    fields: { children: { inOutput: 'deleted' } },
  }),
  defaultCase({
    node: linkNode,
    tree: phrasingTree(linkNode),
    html: '<p><a href="https://example.com/link" title="Link title">link text</a></p>',
    fields: {
      url: { inOutput: 'href="https://example.com/link"' },
      title: { inOutput: 'title="Link title"' },
      children: { inOutput: 'link text' },
    },
  }),
  defaultCase({
    node: imageNode,
    tree: phrasingTree(imageNode),
    html: '<p><img src="https://cdn.example.com/image.png" alt="image alt" title="Image title"></p>',
    fields: {
      url: { inOutput: 'src="https://cdn.example.com/image.png"' },
      alt: { inOutput: 'alt="image alt"' },
      title: { inOutput: 'title="Image title"' },
    },
  }),
  defaultCase({
    node: breakNode,
    tree: phrasingTree(breakNode),
    html: '<p><br></p>',
    fields: {},
  }),
  defaultCase({
    node: footnoteReferenceNode,
    tree: phrasingTree(footnoteReferenceNode),
    html: '<p><sup id="fnref-ref-id"><a href="#fn-ref-id">Ref label</a></sup></p>',
    fields: {
      identifier: { inOutput: 'id="fnref-ref-id"' },
      label: { inOutput: '>Ref label<' },
    },
  }),
];

/** The ordered list of the given tree, with everything else left alone */
function orderedList(start: number | null): MdAstRoot {
  return blockTree({
    type: 'list',
    ordered: true,
    start,
    spread: false,
    children: [
      {
        type: 'listItem',
        spread: false,
        checked: null,
        children: [paragraphOf('a')],
      },
    ],
  });
}

/** A one-item list whose item carries the given checked state and text */
function taskList(checked: boolean | null, text = 'a'): MdAstRoot {
  return listItemTree({
    type: 'listItem',
    spread: false,
    checked,
    children: [paragraphOf(text)],
  });
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
  return blockTree({
    type: 'list',
    ordered: false,
    start: null,
    spread,
    children: items,
  });
}

/** A tight one-item list holding the given blocks */
function itemBlocks(
  children: MdAstBlockNode[],
  checked: boolean | null = null
): MdAstRoot {
  return listRoot(false, [itemOf(false, children, checked)]);
}

/** A footnote of one identifier, holding the given blocks */
function noteRoot(children: MdAstBlockNode[]): MdAstRoot {
  return blockTree({
    type: 'footnoteDefinition',
    identifier: 'n1',
    label: null,
    children,
  });
}

/** A code block of the given value */
function codeOf(value: string): MdAstBlockNode {
  return { type: 'code', lang: null, meta: null, value };
}

/** A table of one `align` entry per column and one row per array of texts */
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
      for (const one of defaultCases) {
        expect(render(one.tree), one.type).not.toContain('[object Object]');
      }
    });
  });

  describe('every field a node carries', () => {
    it('has one case per defaulted key', () => {
      expect(defaultCases.map((one) => one.type).toSorted()).toEqual(
        Object.keys(astroDefaults).toSorted()
      );
    });

    for (const one of defaultCases) {
      it(`${one.type} renders every field it does not drop`, () => {
        const html = render(one.tree);
        expect(html).toBe(one.html);

        expect(Object.keys(one.fields).toSorted()).toEqual(
          one.nodeFields.toSorted()
        );

        for (const [field, account] of Object.entries(one.fields)) {
          const where = `${one.type}.${field}`;
          if ('inOutput' in account) {
            expect(html, where).toContain(account.inOutput);
          } else {
            expect(html, where).not.toContain(account.absentFromOutput);
          }
        }
      });
    }
  });

  describe('root combiner', () => {
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

  describe('heading depths', () => {
    it('renders every depth with its own tag', () => {
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
  });

  describe('ordered list start', () => {
    it('writes the start a list actually counts from', () => {
      expect(render(orderedList(5))).toBe('<ol start="5"><li>a</li></ol>');
    });

    it('keeps a start of 0, which GFM and HTML both allow', () => {
      expect(render(orderedList(0))).toBe('<ol start="0"><li>a</li></ol>');
    });

    it('writes no start attribute for 1, which <ol> counts from anyway', () => {
      expect(render(orderedList(1))).toBe('<ol><li>a</li></ol>');
    });

    it('writes no start attribute when the node carries none', () => {
      expect(render(orderedList(null))).toBe('<ol><li>a</li></ol>');
    });

    it('never writes start on an unordered list, where it is invalid', () => {
      const root = blockTree({
        type: 'list',
        ordered: false,
        start: 5,
        spread: false,
        children: [
          {
            type: 'listItem',
            spread: false,
            checked: null,
            children: [paragraphOf('a')],
          },
        ],
      });
      expect(render(root)).toBe('<ul><li>a</li></ul>');
    });
  });

  describe('tight and loose lists', () => {
    it("renders a tight item's text as the item's own content", () => {
      // What mdast-util-to-hast emits for a tight list. A <p> inside every
      // item is a block of margin the markdown does not ask for.
      const root = listRoot(false, [
        itemOf(false, [paragraphOf('one')]),
        itemOf(false, [paragraphOf('two')]),
      ]);
      expect(render(root)).toBe('<ul><li>one</li><li>two</li></ul>');
    });

    it("keeps the paragraph of a block that is not the item's own child", () => {
      // Only a paragraph directly inside the item loses its <p>, so a quote
      // in a tight item keeps the one around its text.
      const root = itemBlocks([
        { type: 'blockquote', children: [paragraphOf('quote')] },
      ]);
      expect(render(root)).toBe(
        '<ul><li><blockquote><p>quote</p></blockquote></li></ul>'
      );
    });

    it("keeps every item's paragraph where the list itself spreads", () => {
      const root = listRoot(true, [
        itemOf(false, [paragraphOf('one')]),
        itemOf(false, [paragraphOf('two')]),
      ]);
      expect(render(root)).toBe(
        '<ul><li><p>one</p></li><li><p>two</p></li></ul>'
      );
    });

    it('spreads the whole list where one of its items spreads', () => {
      const root = listRoot(false, [
        itemOf(false, [paragraphOf('one')]),
        itemOf(true, [paragraphOf('two')]),
      ]);
      expect(render(root)).toBe(
        '<ul><li><p>one</p></li><li><p>two</p></li></ul>'
      );
    });

    it('reads an item that carries no spread off its block count', () => {
      expect(render(listRoot(null, [itemOf(null, [paragraphOf('a')])]))).toBe(
        '<ul><li>a</li></ul>'
      );
      const two = listRoot(null, [
        itemOf(null, [paragraphOf('a'), paragraphOf('b')]),
      ]);
      expect(render(two)).toBe('<ul><li><p>a</p><p>b</p></li></ul>');
    });

    it('drops the <p> of every paragraph a tight item holds', () => {
      const root = itemBlocks([paragraphOf('a'), paragraphOf('b')]);
      expect(render(root)).toBe('<ul><li>ab</li></ul>');
    });

    it('decides tightness per list, so a nested list keeps its own', () => {
      const root = listRoot(true, [
        itemOf(false, [
          paragraphOf('outer'),
          {
            type: 'list',
            ordered: false,
            start: null,
            spread: false,
            children: [itemOf(false, [paragraphOf('inner')])],
          },
        ]),
      ]);
      expect(render(root)).toBe(
        '<ul><li><p>outer</p><ul><li>inner</li></ul></li></ul>'
      );
    });

    it('keeps a paragraph outside a list in its <p>', () => {
      expect(render(paragraphRoot('body'))).toBe('<p>body</p>');
    });
  });

  describe('task list items', () => {
    it('opens the text of a checked item with a checked checkbox', () => {
      expect(render(taskList(true))).toBe(
        '<ul><li><label><input type="checkbox" checked disabled>' +
          ' a</label></li></ul>'
      );
    });

    it('renders an unchecked item as a checkbox without the attribute', () => {
      expect(render(taskList(false))).toBe(
        '<ul><li><label><input type="checkbox" disabled> a</label></li></ul>'
      );
    });

    it('renders an ordinary item without a checkbox', () => {
      expect(render(taskList(null))).toBe('<ul><li>a</li></ul>');
    });

    it('adds no class name, as the defaults promise', () => {
      expect(render(taskList(true))).not.toContain('class=');
    });

    it('names the box with a <label> around it and the text', () => {
      // A paragraph's children are phrasing content, so a <label> holds the
      // box and the text, and a screen reader reads plain text like this
      // once instead of once as the box's name and once as the text.
      const html = render(taskList(true, 'Pay the rent'));
      expect(html).toContain(
        '<label><input type="checkbox" checked disabled> Pay the rent</label>'
      );
      expect(html).not.toContain('aria-label');
    });

    it("opens the first <p> of a loose item, not the item's line", () => {
      const root = listRoot(null, [
        itemOf(
          null,
          [
            {
              type: 'paragraph',
              children: [
                { type: 'text', value: 'Pay the ' },
                { type: 'strong', children: [{ type: 'text', value: 'rent' }] },
              ],
            },
            paragraphOf('before Friday'),
          ],
          false
        ),
      ]);
      expect(render(root)).toBe(
        '<ul><li><p><label><input type="checkbox" disabled>' +
          ' Pay the <strong>rent</strong></label></p>' +
          '<p>before Friday</p></li></ul>'
      );
    });

    it('places the box before the first block where no paragraph can', () => {
      // An item opening with a code block has no paragraph to open, so the
      // item places the box and names it through aria-label.
      const root = itemBlocks([codeOf('npm i')], true);
      expect(render(root)).toBe(
        '<ul><li><input type="checkbox" aria-label="npm i" checked disabled>' +
          '<pre><code>npm i</code></pre></li></ul>'
      );
    });

    it('places the box in an item that holds no blocks at all', () => {
      expect(render(itemBlocks([], false))).toBe(
        '<ul><li><input type="checkbox" disabled></li></ul>'
      );
    });

    it('shows one checkbox per task item, whichever handler places it', () => {
      const root = listRoot(false, [
        itemOf(false, [paragraphOf('a')], true),
        itemOf(false, [codeOf('b')], true),
        itemOf(false, [], true),
      ]);
      expect([...render(root).matchAll(/type="checkbox"/g)]).toHaveLength(3);
    });

    it('escapes a quote the author wrote into the item', () => {
      expect(render(taskList(true, 'Read "Dune"'))).toContain(
        '> Read &quot;Dune&quot;</label>'
      );
      const root = itemBlocks([codeOf('Read "Dune"')], true);
      expect(render(root)).toContain('aria-label="Read &quot;Dune&quot;"');
    });

    it('leaves a nested list outside the label it gives the box', () => {
      // A nested item has a checkbox of its own, and the label holds the
      // paragraph's phrasing only, so that text names the nested box alone.
      const root = itemBlocks(
        [
          paragraphOf('Do the shopping'),
          {
            type: 'list',
            ordered: false,
            start: null,
            spread: false,
            children: [itemOf(false, [paragraphOf('Buy milk')], true)],
          },
        ],
        false
      );
      expect(render(root)).toBe(
        '<ul><li><label><input type="checkbox" disabled>' +
          ' Do the shopping</label>' +
          '<ul><li><label><input type="checkbox" checked disabled>' +
          ' Buy milk</label></li></ul></li></ul>'
      );
    });

    it('names the box nothing where the item carries only spaces', () => {
      // A label of nothing but whitespace names the box as little as the
      // missing attribute of an item no paragraph opens.
      expect(render(itemBlocks([paragraphOf('   ')], false))).toBe(
        '<ul><li><label><input type="checkbox" disabled>    </label></li></ul>'
      );
    });

    it('places the box once in a loose item opening with a code block', () => {
      // Two blocks and no spread make the list loose, so the paragraph keeps
      // its <p> and is not the item's first block either.
      const root = listRoot(null, [
        itemOf(null, [codeOf('npm i'), paragraphOf('then run it')], true),
      ]);
      const html = render(root);
      expect(html).toBe(
        '<ul><li><input type="checkbox" aria-label="npm i then run it"' +
          ' checked disabled><pre><code>npm i</code></pre>' +
          '<p>then run it</p></li></ul>'
      );
      expect([...html.matchAll(/type="checkbox"/g)]).toHaveLength(1);
    });

    it("takes the alt text of an image as the box's name", () => {
      // The label holds whatever the paragraph renders, so an item whose
      // text is an image names its box with that image's alt text.
      const root = itemBlocks(
        [
          {
            type: 'paragraph',
            children: [
              {
                type: 'image',
                url: 'https://example.com/a.png',
                alt: 'a diagram',
                title: null,
              },
            ],
          },
        ],
        false
      );
      expect(render(root)).toBe(
        '<ul><li><label><input type="checkbox" disabled> ' +
          '<img src="https://example.com/a.png" alt="a diagram">' +
          '</label></li></ul>'
      );
    });

    it("keeps a link of the item's text inside the label naming the box", () => {
      // The label holds whatever the paragraph renders, so the link keeps
      // its own accessible name inside the name of the box and a screen
      // reader reaches that text there a second time.
      const root = itemBlocks(
        [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'See ' },
              {
                type: 'link',
                url: 'https://example.com',
                title: null,
                children: [{ type: 'text', value: 'the docs' }],
              },
            ],
          },
        ],
        true
      );
      expect(render(root)).toBe(
        '<ul><li><label><input type="checkbox" checked disabled> See ' +
          '<a href="https://example.com">the docs</a></label></li></ul>'
      );
    });

    it("keeps an image beside the item's text inside that label", () => {
      // Its alt text is part of the box's name here, and the image keeps
      // that name of its own as well.
      const root = itemBlocks(
        [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'Check ' },
              {
                type: 'image',
                url: 'https://example.com/a.png',
                alt: 'a diagram',
                title: null,
              },
            ],
          },
        ],
        true
      );
      expect(render(root)).toBe(
        '<ul><li><label><input type="checkbox" checked disabled> Check ' +
          '<img src="https://example.com/a.png" alt="a diagram">' +
          '</label></li></ul>'
      );
    });

    it("takes a footnote marker of the item's text into the box's name", () => {
      // The marker is phrasing content, so the label holds it and its digit
      // joins the name, where the aria-label of an item placing its own box
      // leaves the marker out.
      const root = itemBlocks(
        [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'done' },
              { type: 'footnoteReference', identifier: '1', label: '1' },
            ],
          },
        ],
        true
      );
      expect(render(root)).toBe(
        '<ul><li><label><input type="checkbox" checked disabled> done' +
          '<sup id="fnref-1"><a href="#fn-1">1</a></sup></label></li></ul>'
      );
    });
  });

  describe('footnotes', () => {
    /** A tree holding one reference to one definition */
    function footnoteRoot(identifier: string): MdAstRoot {
      return {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'footnoteReference', identifier, label: null }],
          },
          {
            type: 'footnoteDefinition',
            identifier,
            label: null,
            children: [paragraphOf('the note')],
          },
        ],
      };
    }

    it('gives the reference and the definition ids of their own', () => {
      expect(render(footnoteRoot('n1'))).toBe(
        '<p><sup id="fnref-n1"><a href="#fn-n1">n1</a></sup></p>' +
          '<div id="fn-n1"><p>the note ' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></p></div>'
      );
    });

    it("ends the note's last paragraph with the way back", () => {
      // Where mdast-util-to-hast puts it, so the arrow sits at the end of
      // the note's text rather than on a line of its own.
      expect(
        render(noteRoot([paragraphOf('first'), paragraphOf('last')]))
      ).toBe(
        '<div id="fn-n1"><p>first</p><p>last ' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></p></div>'
      );
    });

    it('lets the way back follow the blocks where the last is no paragraph', () => {
      expect(render(noteRoot([paragraphOf('intro'), codeOf('x')]))).toBe(
        '<div id="fn-n1"><p>intro</p><pre><code>x</code></pre>' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></div>'
      );
    });

    it('keeps the way back out of a paragraph nested in the last block', () => {
      const root = noteRoot([
        {
          type: 'list',
          ordered: false,
          start: null,
          spread: false,
          children: [itemOf(false, [paragraphOf('item')])],
        },
      ]);
      const html = render(root);
      expect(html).toBe(
        '<div id="fn-n1"><ul><li>item</li></ul>' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></div>'
      );
      expect([...html.matchAll(/aria-label="Back to content"/g)]).toHaveLength(
        1
      );
    });

    it('shows the way back on a note that holds no blocks', () => {
      expect(render(noteRoot([]))).toBe(
        '<div id="fn-n1">' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></div>'
      );
    });

    it('keeps the <p> of a note sitting in a tight list item', () => {
      // The note is the item's block, so its paragraph's parent is the note
      // rather than the item, and the way back ends it inside the <p>.
      const root = listRoot(false, [
        itemOf(false, [
          {
            type: 'footnoteDefinition',
            identifier: 'n1',
            label: null,
            children: [paragraphOf('the note')],
          },
        ]),
      ]);
      expect(render(root)).toBe(
        '<ul><li><div id="fn-n1"><p>the note ' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a>' +
          '</p></div></li></ul>'
      );
    });

    it('lets an override replace the label, and places no second way back', () => {
      // A site in another language overrides footnoteDefinition alone, which
      // takes the way back over whole, so the page shows one in one language.
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        footnoteDefinition: (node, children) =>
          renderTemplate`<div${addAttribute(`fn-${node.identifier}`, 'id')}>${children}<a${addAttribute(`#fnref-${node.identifier}`, 'href')} aria-label="Zurück zum Text">↩</a></div>`,
      };
      const html = render(footnoteRoot('n1'), overrides);
      expect(html).toContain('aria-label="Zurück zum Text"');
      expect(html).not.toContain('Back to content');
      expect([...html.matchAll(/↩/g)]).toHaveLength(1);
    });

    it('lands the way back on the first reference when a note has several', () => {
      const root: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'footnoteReference', identifier: 'n1', label: null },
              { type: 'text', value: ' and ' },
              { type: 'footnoteReference', identifier: 'n1', label: null },
            ],
          },
        ],
      };
      // Both references carry the one id a default can build from the
      // identifier, so an anchor resolves to the first of them. Counting
      // references takes state across the walk, which only an override has.
      const html = render(root);
      expect([...html.matchAll(/id="fnref-n1"/g)]).toHaveLength(2);
    });

    it('shows the label where the node carries one, the identifier otherwise', () => {
      const labelled: MdAstRoot = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'footnoteReference', identifier: 'n1', label: '1' },
            ],
          },
        ],
      };
      expect(render(labelled)).toBe(
        '<p><sup id="fnref-n1"><a href="#fn-n1">1</a></sup></p>'
      );
    });

    it('lets an override prefix the ids, which is what separates two trees', () => {
      const overrides: MdastAstroRenderers = {
        ...minimalOverrides,
        footnoteReference: (node) =>
          renderTemplate`<sup${addAttribute(`second-fnref-${node.identifier}`, 'id')}><a${addAttribute(`#second-fn-${node.identifier}`, 'href')}>${node.identifier}</a></sup>`,
        footnoteDefinition: (node, children) =>
          renderTemplate`<div${addAttribute(`second-fn-${node.identifier}`, 'id')}>${children}</div>`,
      };
      const first = render(footnoteRoot('n1'));
      const second = render(footnoteRoot('n1'), overrides);
      expect(first).toContain('id="fnref-n1"');
      expect(second).toContain('id="second-fnref-n1"');
      expect(second).not.toContain('id="fnref-n1"');
    });
  });

  describe('an override and the placements only a paragraph reaches', () => {
    /** A consumer who overrides nothing but `paragraph` */
    const leadParagraph: MdastAstroRenderers = {
      ...minimalOverrides,
      paragraph: (_node, children) =>
        renderTemplate`<p class="lead">${children}</p>`,
    };

    /** A consumer who overrides nothing but `listItem` */
    const taskWrapper: MdastAstroRenderers = {
      ...minimalOverrides,
      listItem: (_node, children) =>
        renderTemplate`<li class="task">${children}</li>`,
    };

    /** A task item and a footnote in one tree */
    const taskAndNote: MdAstRoot = {
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: false,
          start: null,
          spread: false,
          children: [itemOf(false, [paragraphOf('a')], true)],
        },
        {
          type: 'footnoteDefinition',
          identifier: 'n1',
          label: null,
          children: [paragraphOf('the note')],
        },
      ],
    };

    it("leaves the checkbox to the item where paragraph is the consumer's", () => {
      // The override knows nothing of the box, so the item places it the way
      // it does for an item no paragraph of which can carry one.
      expect(render(taskList(true), leadParagraph)).toBe(
        '<ul><li><input type="checkbox" aria-label="a" checked disabled>' +
          '<p class="lead">a</p></li></ul>'
      );
    });

    it("leaves the way back to the note where paragraph is the consumer's", () => {
      expect(render(noteRoot([paragraphOf('the note')]), leadParagraph)).toBe(
        '<div id="fn-n1"><p class="lead">the note</p>' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></div>'
      );
    });

    it('places each of the two exactly once, never twice and never none', () => {
      const html = render(taskAndNote, leadParagraph);
      expect([...html.matchAll(/type="checkbox"/g)]).toHaveLength(1);
      expect([...html.matchAll(/aria-label="Back to content"/g)]).toHaveLength(
        1
      );
    });

    it("keeps the defaults placing both where paragraph is Core's", () => {
      const html = render(taskAndNote);
      expect([...html.matchAll(/type="checkbox"/g)]).toHaveLength(1);
      expect([...html.matchAll(/aria-label="Back to content"/g)]).toHaveLength(
        1
      );
    });

    it('leaves both to the consumer where paragraph and the note are theirs', () => {
      // The note's own handler owns the way back, and the item still places
      // the box the paragraph override cannot.
      const overrides: MdastAstroRenderers = {
        ...leadParagraph,
        footnoteDefinition: (node, children) =>
          renderTemplate`<aside${addAttribute(`fn-${node.identifier}`, 'id')}>${children}</aside>`,
      };
      const html = render(taskAndNote, overrides);
      expect(html).toBe(
        '<ul><li><input type="checkbox" aria-label="a" checked disabled>' +
          '<p class="lead">a</p></li></ul>' +
          '<aside id="fn-n1"><p class="lead">the note</p></aside>'
      );
      expect(html).not.toContain('Back to content');
    });

    it("keeps the box of an item opening with a paragraph where listItem is the consumer's", () => {
      // The box sits inside the item's text rather than in the <li> wrapper,
      // so an override of the wrapper keeps it.
      const html = render(taskList(true), taskWrapper);
      expect(html).toBe(
        '<ul><li class="task"><label>' +
          '<input type="checkbox" checked disabled> a</label></li></ul>'
      );
      expect([...html.matchAll(/type="checkbox"/g)]).toHaveLength(1);
    });

    it('leaves the box an item places itself to that same override', () => {
      // No paragraph of this item can carry the box, so the default the
      // override replaces is the one that placed it, and re-adding it is
      // the consumer's.
      const codeFirstTask = itemBlocks(
        [codeOf('x'), paragraphOf('after')],
        true
      );
      expect(render(codeFirstTask)).toContain('type="checkbox"');
      const html = render(codeFirstTask, taskWrapper);
      expect(html).toBe(
        '<ul><li class="task"><pre><code>x</code></pre>after</li></ul>'
      );
      expect(html).not.toContain('type="checkbox"');
    });
  });

  describe('table defaults', () => {
    it('renders the header row as th cells and the body as td cells', () => {
      const root = tableRoot(
        [null, null],
        [
          ['H1', 'H2'],
          ['a', 'b'],
        ]
      );
      expect(render(root)).toBe(
        '<table>' +
          '<thead><tr><th scope="col">H1</th><th scope="col">H2</th></tr></thead>' +
          '<tbody><tr><td>a</td><td>b</td></tr></tbody>' +
          '</table>'
      );
    });

    it('names no scope on a body cell', () => {
      const html = render(tableRoot([null], [['H1'], ['a']]));
      expect(html).toContain('<td>a</td>');
      expect(html.match(/scope=/g)).toHaveLength(1);
    });

    it('applies a column alignment to the header and the body alike', () => {
      const root = tableRoot(
        ['left', 'center', 'right'],
        [
          ['H1', 'H2', 'H3'],
          ['a', 'b', 'c'],
        ]
      );
      expect(render(root)).toBe(
        '<table>' +
          '<thead><tr>' +
          '<th scope="col" style="text-align:left">H1</th>' +
          '<th scope="col" style="text-align:center">H2</th>' +
          '<th scope="col" style="text-align:right">H3</th>' +
          '</tr></thead>' +
          '<tbody><tr>' +
          '<td style="text-align:left">a</td>' +
          '<td style="text-align:center">b</td>' +
          '<td style="text-align:right">c</td>' +
          '</tr></tbody>' +
          '</table>'
      );
    });

    it('emits no style at all for a column with no alignment', () => {
      // text-align: left would override the consumer's own CSS and break a
      // right to left reading direction.
      const html = render(tableRoot([null], [['H1'], ['a']]));
      expect(html).not.toContain('style=');
      expect(html).not.toContain('text-align');
    });

    it('leaves a cell the align array does not cover without a style', () => {
      const html = render(tableRoot(['center'], [['H1', 'H2']]));
      expect(html).toBe(
        '<table><thead><tr>' +
          '<th scope="col" style="text-align:center">H1</th>' +
          '<th scope="col">H2</th>' +
          '</tr></thead></table>'
      );
    });

    it('keeps an empty header cell a header cell', () => {
      const html = render(tableRoot([null, null], [['', 'H2']]));
      expect(html).toBe(
        '<table><thead><tr>' +
          '<th scope="col"></th><th scope="col">H2</th>' +
          '</tr></thead></table>'
      );
    });

    it('renders a table with only a header row without a tbody', () => {
      expect(render(tableRoot([null], [['H1']]))).toBe(
        '<table><thead><tr><th scope="col">H1</th></tr></thead></table>'
      );
    });

    it('renders a table with no rows as an empty table, with no thead', () => {
      expect(render(tableRoot([], []))).toBe('<table></table>');
    });

    it('wraps every row after the first in one tbody', () => {
      const html = render(tableRoot([null], [['H1'], ['a'], ['b']]));
      expect(html).toBe(
        '<table><thead><tr><th scope="col">H1</th></tr></thead>' +
          '<tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>'
      );
    });

    it('escapes cell text rather than emitting it as markup', () => {
      expect(render(tableRoot([null], [['<b>x</b>']]))).toContain(
        '&lt;b&gt;x&lt;/b&gt;'
      );
    });

    it('lets a consumer override tableCell and decide from the context', () => {
      // Written as a named function with its types spelled out, which is
      // what the exported context type is for. An .astro frontmatter is
      // TypeScript, so a handler up there cannot be JSX, but it can be this.
      const tableCell = (
        _node: MdAstTableCell,
        children: astroHTML.JSX.Element[],
        context: MdastNodeContext
      ): astroHTML.JSX.Element =>
        isTableHeaderCell(context)
          ? renderTemplate`<th${addAttribute(tableCellAlign(context), 'data-align')}>${children}</th>`
          : renderTemplate`<td>${children}</td>`;
      const overrides: MdastAstroRenderers = { ...minimalOverrides, tableCell };
      expect(render(tableRoot(['center'], [['H1'], ['a']]), overrides)).toBe(
        '<table><thead><tr><th data-align="center">H1</th></tr></thead>' +
          '<tbody><tr><td>a</td></tr></tbody></table>'
      );
    });
  });

  describe('escaping', () => {
    it('escapes text rather than emitting it as markup', () => {
      expect(render(paragraphRoot('<b>x</b>'))).toBe(
        '<p>&lt;b&gt;x&lt;/b&gt;</p>'
      );
    });

    it('escapes a code value rather than emitting it as markup', () => {
      const root = blockTree({
        type: 'code',
        lang: null,
        meta: null,
        value: '<script>x</script>',
      });
      expect(render(root)).toBe(
        '<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>'
      );
    });
  });

  describe('link default - no rel / target', () => {
    it('emits plain <a href> for an absolute https URL', () => {
      const root = phrasingTree({
        type: 'link',
        url: 'https://example.com',
        title: null,
        children: [{ type: 'text', value: 'docs' }],
      });
      const html = render(root);
      expect(html).toBe('<p><a href="https://example.com">docs</a></p>');
      expect(html).not.toContain('rel=');
      expect(html).not.toContain('target=');
    });
  });

  describe('image default - plain <img>, not <Image>', () => {
    it('emits no title attribute when the node carries none', () => {
      const root = phrasingTree({
        type: 'image',
        url: 'https://cdn.example.com/x.png',
        alt: 'x',
        title: null,
      });
      expect(render(root)).toBe(
        '<p><img src="https://cdn.example.com/x.png" alt="x"></p>'
      );
    });
  });

  describe('required overrides', () => {
    it('calls the consumer-provided assetReference handler', () => {
      const root = phrasingTree({
        type: 'assetReference',
        assetId,
        alt: 'a',
        title: null,
      });
      expect(render(root)).toBe(`<p>asset:${assetId}</p>`);
    });

    it('calls the consumer-provided entryReference handler with rendered children', () => {
      const root = phrasingTree({
        type: 'entryReference',
        collectionId,
        entryId,
        children: [{ type: 'text', value: 'click' }],
      });
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
});
