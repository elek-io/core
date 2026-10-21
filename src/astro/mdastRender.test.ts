/// <reference types="astro/astro-jsx" />

import { describe, it, expect, expectTypeOf } from 'vitest';
import { renderTemplate, addAttribute } from 'astro/runtime/server/index.js';
import {
  mdastRender,
  astroDefaults,
  type MdastAstroRenderers,
} from './mdastRender.js';
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

const spreadIsDropped = {
  droppedBecause:
    'a tight item still renders its paragraph, the fold hands a parent its children already rendered',
  absentFromOutput: 'spread',
} as const;

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
    html: '<ol start="5"><li><p>ordered item</p></li></ol>',
    fields: {
      ordered: { inOutput: '<ol' },
      start: { inOutput: 'start="5"' },
      spread: spreadIsDropped,
      children: { inOutput: '<li><p>ordered item</p></li>' },
    },
  }),
  defaultCase({
    node: listItemNode,
    tree: listItemTree(listItemNode),
    html: '<ul><li><input type="checkbox" checked disabled><p>task text</p></li></ul>',
    fields: {
      checked: { inOutput: '<input type="checkbox" checked disabled>' },
      spread: spreadIsDropped,
      children: { inOutput: '<p>task text</p>' },
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
    html: '<table><tr><td>cell text</td></tr></table>',
    fields: {
      align: {
        droppedBecause:
          'a cell is rendered without knowing its column, so the fold cannot reach the alignment of one',
        absentFromOutput: 'left',
      },
      children: { inOutput: '<tr><td>cell text</td></tr>' },
    },
  }),
  defaultCase({
    node: tableRowNode,
    tree: tableRowTree(tableRowNode),
    html: '<table><tr><td>row cell</td></tr></table>',
    fields: { children: { inOutput: '<td>row cell</td>' } },
  }),
  defaultCase({
    node: tableCellNode,
    tree: tableCellTree(tableCellNode),
    html: '<table><tr><td>cell content</td></tr></table>',
    fields: { children: { inOutput: 'cell content' } },
  }),
  defaultCase({
    node: footnoteDefinitionNode,
    tree: blockTree(footnoteDefinitionNode),
    html:
      '<div id="fn-note-id"><p>note text</p>' +
      '<a href="#fnref-note-id" aria-label="Back to content">↩</a></div>',
    fields: {
      identifier: { inOutput: 'id="fn-note-id"' },
      label: {
        droppedBecause:
          'the label is the authored spelling of the identifier and is shown on the reference, not on the note',
        absentFromOutput: 'Note label',
      },
      children: { inOutput: '<p>note text</p>' },
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

/** A one-item list whose item carries the given checked state */
function taskList(checked: boolean | null): MdAstRoot {
  return listItemTree({
    type: 'listItem',
    spread: false,
    checked,
    children: [paragraphOf('a')],
  });
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
      expect(render(orderedList(5))).toBe(
        '<ol start="5"><li><p>a</p></li></ol>'
      );
    });

    it('keeps a start of 0, which GFM and HTML both allow', () => {
      expect(render(orderedList(0))).toBe(
        '<ol start="0"><li><p>a</p></li></ol>'
      );
    });

    it('writes no start attribute for 1, which <ol> counts from anyway', () => {
      expect(render(orderedList(1))).toBe('<ol><li><p>a</p></li></ol>');
    });

    it('writes no start attribute when the node carries none', () => {
      expect(render(orderedList(null))).toBe('<ol><li><p>a</p></li></ol>');
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
      expect(render(root)).toBe('<ul><li><p>a</p></li></ul>');
    });
  });

  describe('task list items', () => {
    it('renders a checked item as a checked checkbox', () => {
      expect(render(taskList(true))).toBe(
        '<ul><li><input type="checkbox" checked disabled><p>a</p></li></ul>'
      );
    });

    it('renders an unchecked item as a checkbox without the attribute', () => {
      expect(render(taskList(false))).toBe(
        '<ul><li><input type="checkbox" disabled><p>a</p></li></ul>'
      );
    });

    it('renders an ordinary item without a checkbox', () => {
      expect(render(taskList(null))).toBe('<ul><li><p>a</p></li></ul>');
    });

    it('adds no class name, as the defaults promise', () => {
      expect(render(taskList(true))).not.toContain('class=');
    });

    it('places the checkbox before the item instead of inside its first paragraph', () => {
      // The fold hands `listItem` its children already rendered, so the
      // text arrives as a block and the checkbox can only precede it. That
      // is the one divergence from remark the defaults cannot close, and
      // docs/markdown-content.md names it. See contributing/astro-entry.md.
      expect(render(taskList(true))).toContain(
        '<input type="checkbox" checked disabled><p>a</p>'
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
          '<div id="fn-n1"><p>the note</p>' +
          '<a href="#fnref-n1" aria-label="Back to content">↩</a></div>'
      );
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
