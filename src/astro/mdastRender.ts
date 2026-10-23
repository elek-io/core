/// <reference types="astro/astro-jsx" />

import { renderTemplate, addAttribute } from 'astro/runtime/server/index.js';
import {
  extractText,
  isTableHeaderCell,
  mdastRender as primitive,
  tableCellAlign,
  type MdastRenderersBase,
  type DefaultedRendererKey,
  type FrameworkRenderers,
  type MdastNodeContext,
} from '../util/mdastRender.js';
import type { MdAstListItem, MdAstRoot } from '../schema/valueSchema.js';

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
 * is what `mdastRender` below does.
 *
 * Each default renders every field its node carries, except the five listed as
 * dropped in the doc below, which name what an override is still needed for.
 *
 * @see ../../docs/markdown-content.md
 */
export const astroDefaults: Pick<
  MdastRenderersBase<AstroElement>,
  DefaultedRendererKey
> = {
  root: (_, children) => renderTemplate`${children}`,
  paragraph: (_, children) => renderTemplate`<p>${children}</p>`,
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
  // checkbox is disabled because a rendered tree is not an editor, and it
  // precedes the item's first block rather than opening it. Its name is the
  // item's own text, since the blocks arrive rendered and a <label> holds
  // phrasing only, see taskItemName above for what counts as its own.
  listItem: (node, children) =>
    node.checked === null
      ? renderTemplate`<li>${children}</li>`
      : renderTemplate`<li><input type="checkbox"${addAttribute(taskItemName(node), 'aria-label')}${addAttribute(node.checked, 'checked')} disabled>${children}</li>`,
  code: (node) => renderTemplate`<pre><code>${node.value}</code></pre>`,
  thematicBreak: () => renderTemplate`<hr>`,
  table: (_, children) => renderTableSections(children),
  tableRow: (_, children) => renderTemplate`<tr>${children}</tr>`,
  tableCell: (_, children, context) => renderTableCell(children, context),
  // The way back follows the note's blocks rather than ending its last
  // paragraph, which is where remark puts it, for the same reason as the
  // checkbox above. Its label is English, so a site in another language
  // overrides this handler.
  footnoteDefinition: (node, children) =>
    renderTemplate`<div${addAttribute(`fn-${node.identifier}`, 'id')}>${children}<a${addAttribute(`#fnref-${node.identifier}`, 'href')} aria-label="Back to content">↩</a></div>`,
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
    ...overrides,
  };
  return primitive(root, renderers);
}
