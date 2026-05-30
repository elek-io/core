/**
 * Internal generic primitive — a typed fold over an MdAstRoot. Every node
 * type has a required handler in `MdastRenderersBase<T>`; the walk descends
 * depth-first and calls each parent handler with its already-rendered
 * children, then the root handler at the top to combine.
 *
 * Framework-agnostic: T is the consumer's element type. Framework-specific
 * wrappers (`@elek-io/core/astro` and friends) bind T to their JSX flavour,
 * supply defaults for the safe standard node types, and expose only the
 * required overrides to consumers.
 *
 * Not exported from `@elek-io/core` — kept internal until a non-Astro
 * consumer demands a public lower-level API. Exposing later is a
 * non-breaking change.
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
  MdAstTableCell,
  MdAstTableRow,
  MdAstText,
  MdAstThematicBreak,
} from '../schema/valueSchema.js';

export interface MdastRenderersBase<T> {
  /**
   * Combines the rendered top-level blocks into the final output. The
   * framework wrapper supplies a default that wraps in its fragment
   * equivalent; consumers can override to wrap in `<article>` or similar.
   */
  root: (node: MdAstRoot, children: T[]) => T;

  // Block parents
  paragraph: (node: MdAstParagraph, children: T[]) => T;
  heading: (node: MdAstHeading, children: T[]) => T;
  blockquote: (node: MdAstBlockquote, children: T[]) => T;
  list: (node: MdAstList, children: T[]) => T;
  table: (node: MdAstTable, children: T[]) => T;
  footnoteDefinition: (node: MdAstFootnoteDefinition, children: T[]) => T;

  // Block leaves
  code: (node: MdAstCode) => T;
  thematicBreak: (node: MdAstThematicBreak) => T;

  // Sub-nodes (block-ish; appear only inside their parents)
  listItem: (node: MdAstListItem, children: T[]) => T;
  tableRow: (node: MdAstTableRow, children: T[]) => T;
  tableCell: (node: MdAstTableCell, children: T[]) => T;

  // Phrasing parents
  emphasis: (node: MdAstEmphasis, children: T[]) => T;
  strong: (node: MdAstStrong, children: T[]) => T;
  delete: (node: MdAstDelete, children: T[]) => T;
  link: (node: MdAstLink, children: T[]) => T;
  entryReference: (node: MdAstEntryReference, children: T[]) => T;

  // Phrasing leaves
  text: (node: MdAstText) => T;
  inlineCode: (node: MdAstInlineCode) => T;
  break: (node: MdAstBreak) => T;
  image: (node: MdAstImage) => T;
  footnoteReference: (node: MdAstFootnoteReference) => T;
  assetReference: (node: MdAstAssetReference) => T;

  // Shared between block and phrasing (mdast spec uses one type for both)
  html: (node: MdAstHtml) => T;
}

/**
 * Node types a consumer must render explicitly, because no default is safe
 * in any framework. See docs/markdown-content.md for the reasoning.
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

export function mdastRender<T>(
  root: MdAstRoot,
  renderers: MdastRenderersBase<T>
): T {
  return walk(root, renderers);
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
 * alt text are not included. See docs/markdown-content.md.
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

function walk<T>(node: MdAstAnyNode, renderers: MdastRenderersBase<T>): T {
  switch (node.type) {
    case 'root':
      return renderers.root(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'paragraph':
      return renderers.paragraph(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'heading':
      return renderers.heading(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'blockquote':
      return renderers.blockquote(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'list':
      return renderers.list(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'listItem':
      return renderers.listItem(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'code':
      return renderers.code(node);
    case 'thematicBreak':
      return renderers.thematicBreak(node);
    case 'html':
      return renderers.html(node);
    case 'table':
      return renderers.table(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'tableRow':
      return renderers.tableRow(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'tableCell':
      return renderers.tableCell(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'footnoteDefinition':
      return renderers.footnoteDefinition(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'text':
      return renderers.text(node);
    case 'inlineCode':
      return renderers.inlineCode(node);
    case 'break':
      return renderers.break(node);
    case 'image':
      return renderers.image(node);
    case 'footnoteReference':
      return renderers.footnoteReference(node);
    case 'assetReference':
      return renderers.assetReference(node);
    case 'emphasis':
      return renderers.emphasis(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'strong':
      return renderers.strong(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'delete':
      return renderers.delete(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'link':
      return renderers.link(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    case 'entryReference':
      return renderers.entryReference(
        node,
        node.children.map((c) => walk(c, renderers))
      );
    default:
      return assertNever(node);
  }
}

/**
 * Exhaustiveness guard. A missing case makes `node` here not `never`, which
 * is a compile error. At runtime it throws on a malformed tree.
 */
function assertNever(node: never): never {
  throw new Error(`Unhandled mdast node: ${JSON.stringify(node)}`);
}
