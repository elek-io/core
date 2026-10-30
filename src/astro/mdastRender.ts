/// <reference types="astro/astro-jsx" />

import { renderTemplate, addAttribute } from 'astro/runtime/server/index.js';
import {
  extractText,
  footnoteWayBackIdentifier,
  isInTightListItem,
  isTableHeaderCell,
  mdastRender as primitive,
  tableCellAlign,
  taskItemChecked,
  type MdastRenderersBase,
  type DefaultedRendererKey,
  type FrameworkRenderers,
  type MdastNodeContext,
} from '../util/mdastRender.js';
import type {
  MdAstFootnoteDefinition,
  MdAstListItem,
  MdAstRoot,
} from '../schema/valueSchema.js';

type AstroElement = astroHTML.JSX.Element;

/**
 * Astro binding of `FrameworkRenderers`. Required keys must be supplied.
 * Everything else falls back to `astroDefaults`.
 */
export type MdastAstroRenderers = FrameworkRenderers<AstroElement>;

/**
 * A heading tag cannot be interpolated into a `renderTemplate`, the
 * static parts of the template are the markup. The six depths are a
 * closed set, so they are spelled out.
 */
function renderHeading(
  depth: number,
  children: unknown
): ReturnType<typeof renderTemplate> {
  switch (depth) {
    case 1:
      return renderTemplate`<h1>${children}</h1>`;
    case 2:
      return renderTemplate`<h2>${children}</h2>`;
    case 3:
      return renderTemplate`<h3>${children}</h3>`;
    case 4:
      return renderTemplate`<h4>${children}</h4>`;
    case 5:
      return renderTemplate`<h5>${children}</h5>`;
    default:
      return renderTemplate`<h6>${children}</h6>`;
  }
}

/**
 * The accessible name of a task item's checkbox: the text of the item's own
 * blocks, with a list directly inside the item left out, whether it holds
 * tasks that name a checkbox of their own or plain items. A list deeper in,
 * inside a blockquote for one, is still taken in. Null where nothing but
 * whitespace is left, an image on its own or a paragraph of spaces, because
 * an empty name is worth no attribute.
 */
function taskItemName(node: MdAstListItem): string | null {
  const ownBlocks = {
    ...node,
    children: node.children.filter((child) => child.type !== 'list'),
  };
  return extractText(ownBlocks).trim() || null;
}

/**
 * A paragraph, and with it the three placements only a paragraph can reach:
 * the text of a tight item, which loses the `<p>`, the checkbox that opens a
 * task item's text, and the way back that ends a footnote's last paragraph.
 *
 * `wayBackIdentifier` is the note the way back belongs to, or null where this
 * paragraph ends none and where the consumer's own `footnoteDefinition` owns
 * it.
 *
 * @see ../../contributing/markdown-internals.md
 */
function renderParagraph(
  children: AstroElement[],
  context: MdastNodeContext,
  wayBackIdentifier: string | null
): ReturnType<typeof renderTemplate> {
  const checked = taskItemChecked(context);
  // A <label> can hold the box and the text here, because a paragraph's
  // children are phrasing content, so no aria-label is needed and plain
  // text is read once rather than once as the box's name and once as the
  // text. A link, an image or a footnote marker in it keeps its own name
  // inside the box's name, see the doc below.
  const content =
    checked === null
      ? renderTemplate`${children}`
      : renderTemplate`<label><input type="checkbox"${addAttribute(checked, 'checked')} disabled> ${children}</label>`;
  const wayBack =
    wayBackIdentifier === null
      ? ''
      : renderTemplate` ${renderWayBack(wayBackIdentifier)}`;
  return isInTightListItem(context)
    ? renderTemplate`${content}${wayBack}`
    : renderTemplate`<p>${content}${wayBack}</p>`;
}

/**
 * A list item. `placesCheckbox` says whether the item has to place a task
 * item's box itself, which is where its first paragraph cannot: an item whose
 * first block is another type, one with no blocks, and one whose `paragraph`
 * handler is the consumer's.
 *
 * The name goes on an `aria-label` there, since the item's blocks arrive
 * rendered and a `<label>` holds phrasing only, so a screen reader reads the
 * text twice.
 */
function renderListItem(
  node: MdAstListItem,
  children: AstroElement[],
  placesCheckbox: boolean
): ReturnType<typeof renderTemplate> {
  if (node.checked === null || !placesCheckbox) {
    return renderTemplate`<li>${children}</li>`;
  }
  return renderTemplate`<li><input type="checkbox"${addAttribute(taskItemName(node), 'aria-label')}${addAttribute(node.checked, 'checked')} disabled>${children}</li>`;
}

/** Whether no paragraph of the item can carry its checkbox. */
function itemPlacesCheckbox(node: MdAstListItem): boolean {
  return node.children[0]?.type !== 'paragraph';
}

/**
 * A footnote. `placesWayBack` says whether the note has to let the way back
 * follow its blocks, which is where its last paragraph cannot end with it: a
 * note whose last block is another type, a list or a code block for one, one
 * with no blocks, and one whose `paragraph` handler is the consumer's.
 */
function renderFootnoteDefinition(
  node: MdAstFootnoteDefinition,
  children: AstroElement[],
  placesWayBack: boolean
): ReturnType<typeof renderTemplate> {
  const wayBack = placesWayBack ? renderWayBack(node.identifier) : '';
  return renderTemplate`<div${addAttribute(`fn-${node.identifier}`, 'id')}>${children}${wayBack}</div>`;
}

/** Whether no paragraph of the note can end with its way back. */
function notePlacesWayBack(node: MdAstFootnoteDefinition): boolean {
  return node.children.at(-1)?.type !== 'paragraph';
}

/**
 * The way back from a footnote to the reference that names it. Its label is
 * English, so a site in another language overrides `footnoteDefinition`,
 * which takes the way back over whole.
 */
function renderWayBack(identifier: string): ReturnType<typeof renderTemplate> {
  return renderTemplate`<a${addAttribute(`#fnref-${identifier}`, 'href')} aria-label="Back to content">↩</a>`;
}

/**
 * A table's rows arrive rendered, so the header and body split is a split of
 * that array: the first row is the header, the rest are the body. Neither
 * wrapper is emitted empty, which keeps a table with no rows and one with a
 * header row only valid.
 */
function renderTableSections(
  rows: AstroElement[]
): ReturnType<typeof renderTemplate> {
  const head =
    rows.length === 0 ? '' : renderTemplate`<thead>${rows[0]}</thead>`;
  const body =
    rows.length < 2 ? '' : renderTemplate`<tbody>${rows.slice(1)}</tbody>`;
  return renderTemplate`<table>${head}${body}</table>`;
}

/**
 * A cell renders as a header cell in the table's first row and as a body cell
 * below it, and takes its column's alignment either way. `scope` names the
 * column a header cell heads, which is what a screen reader announces.
 */
function renderTableCell(
  children: AstroElement[],
  context: MdastNodeContext
): ReturnType<typeof renderTemplate> {
  const align = tableCellAlign(context);
  // A column with no alignment gets no style at all, rather than a
  // hard-coded left, so its body cells keep the start edge of the reading
  // direction. A user agent centers its header cell, which only the
  // consumer's own CSS can change.
  const style = align === null ? null : `text-align:${align}`;
  return isTableHeaderCell(context)
    ? renderTemplate`<th scope="col"${addAttribute(style, 'style')}>${children}</th>`
    : renderTemplate`<td${addAttribute(style, 'style')}>${children}</td>`;
}

/**
 * The default renderer for every node type that has a safe one, so a consumer
 * overrides only what they care about. Spread under an override object, which
 * is what `mdastRender` below does, together with `placementsFor`.
 *
 * Each default renders every field its node carries, except the three listed
 * as dropped in the doc below, which name what an override is still needed
 * for.
 *
 * @see ../../docs/markdown-content.md
 */
export const astroDefaults: Pick<
  MdastRenderersBase<AstroElement>,
  DefaultedRendererKey
> = {
  root: (_, children) => renderTemplate`${children}`,
  // The three placements a parent cannot reach are placed here, see
  // renderParagraph above.
  paragraph: (_, children, context) =>
    renderParagraph(children, context, footnoteWayBackIdentifier(context)),
  heading: (node, children) => renderHeading(node.depth, children),
  blockquote: (_, children) =>
    renderTemplate`<blockquote>${children}</blockquote>`,
  // A start of 1 is what an <ol> counts from anyway, so only another one is
  // written. A list starting at 0 keeps it, which GFM and HTML both allow.
  list: (node, children) =>
    node.ordered
      ? renderTemplate`<ol${addAttribute(node.start === 1 ? null : node.start, 'start')}>${children}</ol>`
      : renderTemplate`<ul>${children}</ul>`,
  // A checked of null is an ordinary item, true and false are a task. The
  // checkbox is disabled because a rendered tree is not an editor, and the
  // item places it only where its first paragraph cannot.
  listItem: (node, children) =>
    renderListItem(node, children, itemPlacesCheckbox(node)),
  code: (node) => renderTemplate`<pre><code>${node.value}</code></pre>`,
  thematicBreak: () => renderTemplate`<hr>`,
  table: (_, children) => renderTableSections(children),
  tableRow: (_, children) => renderTemplate`<tr>${children}</tr>`,
  tableCell: (_, children, context) => renderTableCell(children, context),
  // The way back ends the note's last paragraph, and follows the blocks only
  // where no paragraph of the note can end with it.
  footnoteDefinition: (node, children) =>
    renderFootnoteDefinition(node, children, notePlacesWayBack(node)),
  text: (node) => node.value,
  inlineCode: (node) => renderTemplate`<code>${node.value}</code>`,
  emphasis: (_, children) => renderTemplate`<em>${children}</em>`,
  strong: (_, children) => renderTemplate`<strong>${children}</strong>`,
  delete: (_, children) => renderTemplate`<del>${children}</del>`,
  link: (node, children) =>
    renderTemplate`<a${addAttribute(node.url, 'href')}${addAttribute(node.title, 'title')}>${children}</a>`,
  image: (node) =>
    renderTemplate`<img${addAttribute(node.url, 'src')}${addAttribute(node.alt, 'alt')}${addAttribute(node.title, 'title')}>`,
  break: () => renderTemplate`<br>`,
  // The reference carries the id the definition's way back targets. Two
  // trees on one page share these ids, which only an override separates.
  footnoteReference: (node) =>
    renderTemplate`<sup${addAttribute(`fnref-${node.identifier}`, 'id')}><a${addAttribute(`#fn-${node.identifier}`, 'href')}>${node.label ?? node.identifier}</a></sup>`,
};

/** The three defaults that place what a parent's handler cannot reach. */
type PlacementRenderers = Pick<
  MdastRenderersBase<AstroElement>,
  'paragraph' | 'listItem' | 'footnoteDefinition'
>;

/**
 * The defaults a consumer's own handlers move, because the `paragraph`
 * default is what reaches inside a list item and a footnote:
 *
 * - A `paragraph` override cannot know of the checkbox or the way back, so
 *   the item and the note place them around their blocks instead.
 * - A `footnoteDefinition` override takes the way back over whole, its
 *   wording included, so no paragraph places one.
 *
 * @see ../../contributing/markdown-internals.md
 */
function placementsFor(
  overrides: MdastAstroRenderers
): Partial<PlacementRenderers> {
  const placements: Partial<PlacementRenderers> = {};
  if (overrides.footnoteDefinition !== undefined) {
    placements.paragraph = (_, children, context) =>
      renderParagraph(children, context, null);
  }
  if (overrides.paragraph !== undefined) {
    placements.listItem = (node, children) =>
      renderListItem(node, children, true);
    placements.footnoteDefinition = (node, children) =>
      renderFootnoteDefinition(node, children, true);
  }
  return placements;
}

/**
 * Astro-bound `mdastRender`, returning something ready to interpolate in an
 * `.astro` file. Overrides are merged over `astroDefaults` per key, so only
 * `html`, `assetReference` and `entryReference` have to be supplied.
 *
 * The result is a `renderTemplate` output rather than a JSX vnode, which is
 * what makes it render the same in a page, nested, and through a slot.
 *
 * @see ../../contributing/astro-entry.md
 */
export function mdastRender(
  root: MdAstRoot,
  overrides: MdastAstroRenderers
): AstroElement {
  const renderers: MdastRenderersBase<AstroElement> = {
    ...astroDefaults,
    ...placementsFor(overrides),
    ...overrides,
  };
  return primitive(root, renderers);
}
