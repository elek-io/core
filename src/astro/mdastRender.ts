/// <reference types="astro/astro-jsx" />

/**
 * Astro-bound `mdastRender`. Takes an `MdAstRoot` and a renderers override
 * object; returns an Astro JSX element ready to interpolate in an `.astro`
 * file.
 *
 * Three keys are required from the consumer (`html`, `assetReference`,
 * `entryReference`) — defaults can't be safe and correct for those, and
 * content editors can flip the corresponding `features` flags or extend
 * `ofCollections` at any time, so the type system forces a documented
 * decision per key. Choosing `() => null` is valid and documents "render
 * nothing if this ever appears."
 *
 * Every other node type has a default that emits a plain semantic HTML
 * element — no class names, no `rel`/`target`, no slug ids, no syntax
 * highlighting. Consumers override only what they want to change.
 *
 * Defaults are constructed via `jsx` / `Fragment` from `astro/jsx-runtime`,
 * so they produce the same vnode shape as JSX written directly in a
 * consumer's `.astro` file — spread/override composition is type-safe and
 * runtime-clean.
 */

import { jsx, Fragment } from 'astro/jsx-runtime';
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

export const astroDefaults: Pick<
  MdastRenderersBase<AstroElement>,
  DefaultedRendererKey
> = {
  root: (_, children) => jsx(Fragment, { children }),
  paragraph: (_, children) => jsx('p', { children }),
  heading: (node, children) => jsx(`h${node.depth}`, { children }),
  blockquote: (_, children) => jsx('blockquote', { children }),
  list: (node, children) => jsx(node.ordered ? 'ol' : 'ul', { children }),
  listItem: (_, children) => jsx('li', { children }),
  code: (node) =>
    jsx('pre', {
      children: jsx('code', { children: node.value }),
    }),
  thematicBreak: () => jsx('hr', {}),
  table: (_, children) => jsx('table', { children }),
  tableRow: (_, children) => jsx('tr', { children }),
  tableCell: (_, children) => jsx('td', { children }),
  footnoteDefinition: (node, children) =>
    jsx('div', {
      id: `fn-${node.identifier}`,
      children,
    }),
  text: (node) => node.value,
  inlineCode: (node) => jsx('code', { children: node.value }),
  emphasis: (_, children) => jsx('em', { children }),
  strong: (_, children) => jsx('strong', { children }),
  delete: (_, children) => jsx('del', { children }),
  link: (node, children) =>
    jsx('a', {
      href: node.url,
      title: node.title ?? undefined,
      children,
    }),
  image: (node) =>
    jsx('img', {
      src: node.url,
      alt: node.alt,
      title: node.title ?? undefined,
    }),
  break: () => jsx('br', {}),
  footnoteReference: (node) =>
    jsx('sup', {
      children: jsx('a', {
        href: `#fn-${node.identifier}`,
        children: node.label ?? node.identifier,
      }),
    }),
};

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
