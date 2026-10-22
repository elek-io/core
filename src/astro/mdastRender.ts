/// <reference types="astro/astro-jsx" />

import { renderTemplate, addAttribute } from 'astro/runtime/server/index.js';
import {
  isTableHeaderCell,
  mdastRender as primitive,
  tableCellAlign,
  type MdastRenderersBase,
  type DefaultedRendererKey,
  type FrameworkRenderers,
  type MdastNodeContext,
} from '../util/mdastRender.js';
import type { MdAstRoot } from '../schema/valueSchema.js';

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
  // A column with no alignment gets no style at all, so its cells keep the
  // start edge of the reading direction rather than a hard-coded left.
  const style = align === null ? null : `text-align:${align}`;
  return isTableHeaderCell(context)
    ? renderTemplate`<th scope="col"${addAttribute(style, 'style')}>${children}</th>`
    : renderTemplate`<td${addAttribute(style, 'style')}>${children}</td>`;
}

/**
 * The default renderer for every node type that has a safe one, so a consumer
 * overrides only what they care about. Spread under an override object, which
 * is what `mdastRender` below does.
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
  list: (node, children) =>
    node.ordered
      ? renderTemplate`<ol>${children}</ol>`
      : renderTemplate`<ul>${children}</ul>`,
  listItem: (_, children) => renderTemplate`<li>${children}</li>`,
  code: (node) => renderTemplate`<pre><code>${node.value}</code></pre>`,
  thematicBreak: () => renderTemplate`<hr>`,
  table: (_, children) => renderTableSections(children),
  tableRow: (_, children) => renderTemplate`<tr>${children}</tr>`,
  tableCell: (_, children, context) => renderTableCell(children, context),
  footnoteDefinition: (node, children) =>
    renderTemplate`<div${addAttribute(`fn-${node.identifier}`, 'id')}>${children}</div>`,
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
  footnoteReference: (node) =>
    renderTemplate`<sup><a${addAttribute(`#fn-${node.identifier}`, 'href')}>${node.label ?? node.identifier}</a></sup>`,
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
