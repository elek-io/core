/**
 * A typed fold over an MdAstRoot. Every node type has a required handler in
 * `MdastRenderersBase<T>`, which the depth-first walk calls with the node,
 * its rendered children where it has any, and last its `MdastNodeContext`.
 *
 * Framework-agnostic, `T` is the consumer's element type. A framework wrapper
 * such as the astro entry binds `T` to its JSX flavour and defaults every node
 * type that has a safe default, so only the three unsafe keys are required and
 * every other one stays optional over its default.
 *
 * @see ../../contributing/markdown-internals.md
 */

import type {
  MdAstAssetReference,
  MdAstBlockNode,
  MdAstBlockquote,
  MdAstBreak,
  MdAstCode,
  MdAstDelete,
  MdAstEmphasis,
  MdAstEntryReference,
  MdAstFootnoteDefinition,
  MdAstFootnoteReference,
  MdAstHeading,
  MdAstHtml,
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

/**
 * Where a node sits in the tree, handed to every handler as its last
 * argument. It is what a handler cannot read off its own node: a `tableCell`
 * needs the table's `align` and whether its row is the header row, and
 * neither is on the cell.
 *
 * The `ancestors` array is shared by a node's siblings, so treat it as read
 * only.
 *
 * @see ../../contributing/markdown-internals.md
 */
export interface MdastNodeContext {
  /** Position among the parent's children. The root is 0. */
  index: number;
  /**
   * Root first, the direct parent last, so `ancestors.at(-1)` is the parent.
   * Empty for the root. There is no `parent` field, it would name one fact
   * twice.
   */
  ancestors: readonly MdAstAnyNode[];
}

/**
 * A handler for a node type that has children. It is called with the node,
 * its already rendered children and its context. `N` is the node type, `T`
 * the consumer's element type.
 */
export type ParentHandler<N, T> = (
  node: N,
  children: T[],
  context: MdastNodeContext
) => T;

/**
 * A handler for a node type that has no children. It is called with the node
 * and its context. `N` is the node type, `T` the consumer's element type.
 */
export type LeafHandler<N, T> = (node: N, context: MdastNodeContext) => T;

export interface MdastRenderersBase<T> {
  /**
   * Combines the rendered top-level blocks into the final output. The
   * framework wrapper supplies a default that wraps in its fragment
   * equivalent; consumers can override to wrap in `<article>` or similar.
   */
  root: ParentHandler<MdAstRoot, T>;

  // Block parents
  paragraph: ParentHandler<MdAstParagraph, T>;
  heading: ParentHandler<MdAstHeading, T>;
  blockquote: ParentHandler<MdAstBlockquote, T>;
  list: ParentHandler<MdAstList, T>;
  table: ParentHandler<MdAstTable, T>;
  footnoteDefinition: ParentHandler<MdAstFootnoteDefinition, T>;

  // Block leaves
  code: LeafHandler<MdAstCode, T>;
  thematicBreak: LeafHandler<MdAstThematicBreak, T>;

  // Sub-nodes (block-ish; appear only inside their parents)
  listItem: ParentHandler<MdAstListItem, T>;
  tableRow: ParentHandler<MdAstTableRow, T>;
  tableCell: ParentHandler<MdAstTableCell, T>;

  // Phrasing parents
  emphasis: ParentHandler<MdAstEmphasis, T>;
  strong: ParentHandler<MdAstStrong, T>;
  delete: ParentHandler<MdAstDelete, T>;
  link: ParentHandler<MdAstLink, T>;
  entryReference: ParentHandler<MdAstEntryReference, T>;

  // Phrasing leaves
  text: LeafHandler<MdAstText, T>;
  inlineCode: LeafHandler<MdAstInlineCode, T>;
  break: LeafHandler<MdAstBreak, T>;
  image: LeafHandler<MdAstImage, T>;
  footnoteReference: LeafHandler<MdAstFootnoteReference, T>;
  assetReference: LeafHandler<MdAstAssetReference, T>;

  // Shared between block and phrasing (mdast spec uses one type for both)
  html: LeafHandler<MdAstHtml, T>;
}

/**
 * Whether a table cell sits in the table's header row, which is what a
 * `tableCell` handler decides between `th` and `td` on. The cell node does
 * not carry it, mdast marks the header by position.
 *
 * False for a context that is not a table cell's.
 */
export function isTableHeaderCell(context: MdastNodeContext): boolean {
  const row = context.ancestors.at(-1);
  const table = context.ancestors.at(-2);
  if (row?.type !== 'tableRow' || table?.type !== 'table') return false;
  return table.children[0] === row;
}

/**
 * The alignment the markdown gave the column a table cell sits in, which
 * `table.align` holds for the whole table and no cell carries.
 *
 * Null for a column with no alignment, for a column an `align` array is too
 * short to cover, and for a context that is not a table cell's.
 */
export function tableCellAlign(context: MdastNodeContext): MdAstTableAlign {
  const table = context.ancestors.at(-2);
  if (table?.type !== 'table') return null;
  return table.align[context.index] ?? null;
}

/**
 * Whether a node sits directly in an item of a tight list, which is where a
 * `paragraph` handler renders its children without the `<p>`, so the item's
 * text is the item's own content.
 *
 * False for every item of a loose list, and for a context whose parent is not
 * a list item.
 */
export function isInTightListItem(context: MdastNodeContext): boolean {
  const item = context.ancestors.at(-1);
  const list = context.ancestors.at(-2);
  if (item?.type !== 'listItem' || list?.type !== 'list') return false;
  return !isLooseList(list);
}

/**
 * Whether a list is loose, meaning every one of its items keeps the
 * paragraphs it holds. mdast records spreading per list and per item, and one
 * spread item spreads the whole list.
 */
function isLooseList(list: MdAstList): boolean {
  return list.spread === true || list.children.some(isLooseListItem);
}

/**
 * Whether one item spreads: its own `spread` where it carries one, and more
 * than one block where it carries none.
 */
function isLooseListItem(item: MdAstListItem): boolean {
  return item.spread ?? item.children.length > 1;
}

/**
 * The checked state of the task item whose checkbox opens the node this
 * context names, which is the item's first block. A `paragraph` handler puts
 * the box inside its text, on one line with it.
 *
 * Null where no checkbox belongs to the node: a block that is not the item's
 * first, an item that is no task, and a parent that is no list item.
 */
export function taskItemChecked(context: MdastNodeContext): boolean | null {
  const item = context.ancestors.at(-1);
  if (item?.type !== 'listItem' || context.index !== 0) return null;
  return item.checked;
}

/**
 * The identifier of the footnote whose way back ends the node this context
 * names, which is the note's last block. A `paragraph` handler ends its text
 * with the link rather than letting it follow the note.
 *
 * Null for every other node, so a paragraph nested deeper in the note, in a
 * list of its own for one, never takes the way back.
 */
export function footnoteWayBackIdentifier(
  context: MdastNodeContext
): string | null {
  const note = context.ancestors.at(-1);
  if (note?.type !== 'footnoteDefinition') return null;
  return context.index === note.children.length - 1 ? note.identifier : null;
}

/**
 * Node types a consumer must render explicitly, because no default is safe
 * in any framework. The reasoning is in the doc below.
 *
 * @see ../../docs/markdown-content.md
 */
export const REQUIRED_RENDERER_KEYS = [
  'html',
  'assetReference',
  'entryReference',
] as const satisfies ReadonlyArray<keyof MdastRenderersBase<unknown>>;

export type RequiredRendererKey = (typeof REQUIRED_RENDERER_KEYS)[number];

/**
 * Every node type that is not required. Derived so adding a handler to
 * `MdastRenderersBase` classifies it as defaulted in every binding.
 */
export type DefaultedRendererKey = Exclude<
  keyof MdastRenderersBase<unknown>,
  RequiredRendererKey
>;

/**
 * Renderer-override shape a framework binding exposes: required keys must be
 * provided, defaulted keys are optional (the binding supplies defaults). `T`
 * is the binding's element type.
 */
export type FrameworkRenderers<T> = Pick<
  MdastRenderersBase<T>,
  RequiredRendererKey
> &
  Partial<Pick<MdastRenderersBase<T>, DefaultedRendererKey>>;

/**
 * The framework-agnostic rendering primitive, as opposed to the bound one the
 * astro entry exports. `renderers` is total here, all 24 node types required
 * with no defaults merged, which is what a binding does for you. `T` is the
 * caller's element type.
 *
 * The walk is depth-first. A parent handler receives its already-rendered
 * children, and every handler receives its `MdastNodeContext` last. An
 * unknown node type throws a plain `Error`, not a `CoreError`.
 *
 * @see ../../docs/markdown-content.md
 */
export function mdastRender<T>(
  root: MdAstRoot,
  renderers: MdastRenderersBase<T>
): T {
  return walk(root, renderers, { index: 0, ancestors: [] });
}

/**
 * Any node that can appear in an mdast tree. Derived from the canonical unions
 * so a node added to the block or phrasing union in valueSchema flows in here
 * automatically. listItem, tableRow and tableCell belong to no union, so they
 * stay listed.
 */
export type MdAstAnyNode =
  | MdAstRoot
  | MdAstBlockNode
  | MdAstListItem
  | MdAstTableRow
  | MdAstTableCell
  | MdAstPhrasingNode;

/**
 * Node types whose children are block-level or structural rather than inline.
 * Their children are joined with the separator; phrasing containers use '' so
 * words within a sentence keep their own spacing.
 */
const blockContainerTypes = new Set<string>([
  'root',
  'blockquote',
  'list',
  'listItem',
  'table',
  'tableRow',
  'footnoteDefinition',
]);

/**
 * Concatenates the plain text of an mdast tree in document order: `text`,
 * `inlineCode` and `code` values. Block-level siblings (blocks, list items,
 * table rows and cells) are joined with `separator`, which defaults to a
 * space; inline content keeps its own spacing. Raw html and image/reference
 * alt text are not included.
 *
 * @see ../../docs/markdown-content.md
 */
export function extractText(node: MdAstAnyNode, separator = ' '): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'inlineCode' || node.type === 'code') return node.value;
  if (!('children' in node)) return '';
  const childSeparator = blockContainerTypes.has(node.type) ? separator : '';
  const parts: string[] = [];
  for (const child of node.children) {
    const text = extractText(child, separator);
    if (text !== '') parts.push(text);
  }
  return parts.join(childSeparator);
}

function walk<T>(
  node: MdAstAnyNode,
  renderers: MdastRenderersBase<T>,
  context: MdastNodeContext
): T {
  switch (node.type) {
    case 'root':
      return renderers.root(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'paragraph':
      return renderers.paragraph(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'heading':
      return renderers.heading(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'blockquote':
      return renderers.blockquote(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'list':
      return renderers.list(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'listItem':
      return renderers.listItem(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'code':
      return renderers.code(node, context);
    case 'thematicBreak':
      return renderers.thematicBreak(node, context);
    case 'html':
      return renderers.html(node, context);
    case 'table':
      return renderers.table(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'tableRow':
      return renderers.tableRow(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'tableCell':
      return renderers.tableCell(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'footnoteDefinition':
      return renderers.footnoteDefinition(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'text':
      return renderers.text(node, context);
    case 'inlineCode':
      return renderers.inlineCode(node, context);
    case 'break':
      return renderers.break(node, context);
    case 'image':
      return renderers.image(node, context);
    case 'footnoteReference':
      return renderers.footnoteReference(node, context);
    case 'assetReference':
      return renderers.assetReference(node, context);
    case 'emphasis':
      return renderers.emphasis(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'strong':
      return renderers.strong(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'delete':
      return renderers.delete(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'link':
      return renderers.link(
        node,
        renderChildren(node, renderers, context),
        context
      );
    case 'entryReference':
      return renderers.entryReference(
        node,
        renderChildren(node, renderers, context),
        context
      );
    default:
      return assertNever(node);
  }
}

/** Any node that carries children, which is every parent case above. */
type MdAstParentNode = Extract<MdAstAnyNode, { children: unknown[] }>;

/**
 * Renders a parent's children, the one place the walk descends. Every parent
 * case above calls it, so a node's ancestors array is built once rather than
 * once per case, and every child's context shares it.
 */
function renderChildren<T>(
  node: MdAstParentNode,
  renderers: MdastRenderersBase<T>,
  context: MdastNodeContext
): T[] {
  const ancestors = [...context.ancestors, node];
  const children: readonly MdAstAnyNode[] = node.children;
  return children.map((child, index) =>
    walk(child, renderers, { index, ancestors })
  );
}

/**
 * Exhaustiveness guard. A missing case makes `node` here not `never`, which
 * is a compile error. At runtime it throws on a malformed tree.
 */
function assertNever(node: never): never {
  throw new Error(`Unhandled mdast node: ${JSON.stringify(node)}`);
}
