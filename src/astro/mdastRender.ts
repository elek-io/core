/// <reference types="astro/astro-jsx" />

import { renderTemplate, addAttribute } from 'astro/runtime/server/index.js';
import {
  mdastRender as primitive,
  type MdastRenderersBase,
  type DefaultedRendererKey,
  type FrameworkRenderers,
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
  table: (_, children) => renderTemplate`<table>${children}</table>`,
  tableRow: (_, children) => renderTemplate`<tr>${children}</tr>`,
  tableCell: (_, children) => renderTemplate`<td>${children}</td>`,
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
 * Astro-bound `mdastRender`. Takes an `MdAstRoot` and a renderers override
 * object, returns an Astro JSX element ready to interpolate in an `.astro`
 * file.
 *
 * Three keys are required from the consumer (`html`, `assetReference`,
 * `entryReference`), every other node type has a default that emits plain
 * semantic HTML. Defaults are built with `renderTemplate` and `addAttribute`
 * rather than with `astro/jsx-runtime`, which decides where they render.
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
