# Markdown Content

elek.io stores rich body content as a structured [mdast](https://github.com/syntax-tree/mdast) tree (markdown abstract syntax tree), not as a markdown source string. This document explains why and how to use it.

For the field reference, see [`fields.md`](./fields.md).

## The data shape

A `markdown` field on a Collection or Component produces an `MdAstValue` on the Entry. Its `content` is keyed per language:

```ts
entry.values.body.content.en ===
  {
    type: 'root',
    children: [
      {
        type: 'heading',
        depth: 2,
        children: [{ type: 'text', value: 'Hello' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'See ' },
          {
            type: 'entryReference',
            collectionId: '...',
            entryId: '...',
            children: [{ type: 'text', value: 'tutorial' }],
          },
          { type: 'text', value: '.' },
        ],
      },
    ],
  };
```

Every node has a `type` field; nested content lives in `children`. Empty markdown values are canonically `null` per language — not an empty tree.

## Why a tree and not a markdown string?

- **References are first-class**: `entryReference` and `assetReference` nodes carry UUIDs (and `collectionId` for Entry refs), not opaque URLs. Consumers can resolve them to whatever URL structure or component they want at render time.
- **Per-field validation works directly on the tree**: the `features` allowlist on each markdown field controls which node types are accepted at write time. Disallowed nodes are rejected by Core's schema layer — they never reach disk.

## Rendering markdown content in Astro

Core ships `mdastRender` from `@elek-io/core/astro`. It walks the mdast tree, dispatches each node type to a renderer, and returns an Astro JSX element ready to interpolate.

Three node types require an explicit override (`html`, `assetReference`, `entryReference`); the other 20 have semantic HTML defaults you can keep or override. The required keys are surfaced by the type system because content editors can flip `features.rawHtml` / `features.assetReferences` / `features.entryReferences` (or extend `ofCollections`) on any field at any time — the API forces a documented decision per key so the renderer can't silently no-op when a new node type appears. Choosing `() => null` is a valid decision and documents "render nothing if this ever appears."

```astro
---
import { getEntry, getCollection } from 'astro:content';
import { Image } from 'astro:assets';
import { mdastRender, type MdastAstroRenderers } from '@elek-io/core/astro';
import DOMPurify from 'isomorphic-dompurify';

const post = await getEntry('posts', Astro.params.slug);

// Sync lookup maps. mdastRender's handlers run synchronously, so build the
// maps once per request from the already-awaited collections.
const assets = await getCollection('assets');
const posts = await getCollection('posts');
const assetById = new Map(assets.map((a) => [a.id, a.data]));
const postById = new Map(posts.map((p) => [p.id, p.data]));

const overrides: MdastAstroRenderers = {
  // Required — sign off on each, even if your fields don't currently use them.
  html: (node) => <Fragment set:html={DOMPurify.sanitize(node.value)} />,
  assetReference: (node) => {
    const asset = assetById.get(node.assetId);
    return asset?.mimeType.startsWith('image/')
      ? <Image src={asset.absolutePath} alt={node.alt} />
      : <a href={`/assets/${asset?.id}.${asset?.extension}`}>{node.alt}</a>;
  },
  entryReference: (node, children) => {
    const target = postById.get(node.entryId);
    return <a href={`/posts/${target?.slug ?? '#'}`}>{children}</a>;
  },
};

const body = post.data.body.en;
---
<article>
  {body !== null && mdastRender(body, overrides)}
</article>
```

Consumer code is now ~10 lines for the typical case. Without the helper the equivalent hand-rolled switch (see the [fallback recipe](#fallback-recipe-for-frameworks-without-an-official-wrapper) below) takes ~90.

### Defaults and what you'll commonly override

The defaults emit plain semantic HTML — no class names, no `rel`/`target`, no slug anchors, no syntax highlighting. The shape is `(node, children) => …` for parents and `(node) => …` for leaves. Common override patterns:

**Slug-id anchors on headings (table of contents):** `extractText` is exported from `@elek-io/core` and returns the concatenated plain text of an mdast node.

```ts
heading: (node, children) => {
  const id = slugify(extractText(node));
  const Tag = `h${node.depth}` as const;
  return <Tag id={id}>{children}</Tag>;
},
```

**Syntax highlighting on code blocks.** Most highlighters (Prism / Shiki / Highlight.js) look for `class="language-${lang}"` on the `<code>` element. The default ships without any class — override to wire the format your highlighter expects:

```ts
code: (node) => (
  <pre>
    <code class={node.lang ? `language-${node.lang}` : undefined}>
      {node.value}
    </code>
  </pre>
),
```

**External-link policy on `link`.** The default emits a plain `<a>` because the same tree mixes internal site URLs (`/path`, `#section`, `./sibling`) with external `https://` ones — a single auto policy would be wrong for half. Override when you know your tree's URL mix:

```ts
link: (node, children) => {
  const isExternal = /^https?:\/\//.test(node.url);
  return (
    <a
      href={node.url}
      title={node.title ?? undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      target={isExternal ? '_blank' : undefined}
    >
      {children}
    </a>
  );
},
```

**Optimized `<Image>` for the `image` node.** The default emits a plain `<img>` because Astro's `<Image>` for remote URLs needs `image.remotePatterns` config the consumer may not have, and dimensions the mdast `image` node doesn't carry. If you control the external image hosts, override to opt into optimization:

```ts
image: (node) => (
  <Image src={node.url} alt={node.alt} inferSize />
),
```

**Collected footnotes section at the bottom.** The default renders each `footnoteDefinition` inline in tree order (matching mdast structure). Most articles want a single collected footnotes section at the end. Override the handler to accumulate, return `null`, then render your section after `mdastRender`:

```ts
const footnotes: astroHTML.JSX.Element[] = [];

const overrides: MdastAstroRenderers = {
  // …
  footnoteDefinition: (node, children) => {
    footnotes.push(<li id={`fn-${node.identifier}`}>{children}</li>);
    return null;
  },
};

const rendered = mdastRender(body, overrides);
---
<article>{rendered}</article>
{footnotes.length > 0 && (
  <section class="footnotes">
    <ol>{footnotes}</ol>
  </section>
)}
```

**Custom top-level wrap via `root`.** The default wraps the rendered blocks in a Fragment so `<article>{rendered}</article>` works at the call site. You can override `root` to do the wrapping at the renderer level instead — useful when one component is responsible for the whole article shell:

```ts
root: (_, children) => <article class="prose">{children}</article>,
```

### Reusable per-site renderer

For sites that render markdown in multiple places, define the overrides once and wrap them in a tiny Astro component. The per-site rendering policy lives in one file:

```astro
---
// src/components/MdastContent.astro
import { mdastRender, type MdastAstroRenderers } from '@elek-io/core/astro';
import type { MdAstRoot } from '@elek-io/core';

interface Props {
  root: MdAstRoot | null;
}

const { root } = Astro.props;

const overrides: MdastAstroRenderers = {
  html: (node) => /* … */,
  assetReference: (node) => /* … */,
  entryReference: (node, children) => /* … */,
  // any standard-node overrides your site applies everywhere
};
---
{root !== null && mdastRender(root, overrides)}
```

Use it from any page:

```astro
<article><MdastContent root={post.data.body.en} /></article>
```

Core does not ship this component itself — it would be a thin one-file wrapper, project-specific (your overrides, your styling), and shipping a generic default would freeze opinions you should own.

### Fallback recipe for frameworks without an official wrapper

If you're targeting a framework Core doesn't ship a wrapper for yet (React, Vue, Solid, SvelteKit, ...), use the framework-agnostic primitive directly. `mdastRender` and `MdastRenderersBase<T>` are exported from `@elek-io/core`. The primitive is the same typed fold the Astro binding wraps. `T` is your framework's element type, and you supply one handler per node type. Parents receive their already-rendered `children`, leaves receive just the node.

The example below uses React (`T = ReactNode`). For Vue bind `T = VNode`, for Solid `T = JSX.Element`. Only the element factory changes, the structure stays identical.

```tsx
import { mdastRender, type MdastRenderersBase } from '@elek-io/core';
import type { ReactNode } from 'react';

const renderers: MdastRenderersBase<ReactNode> = {
  root: (_, children) => <>{children}</>,
  paragraph: (_, children) => <p>{children}</p>,
  heading: (node, children) => {
    const Tag = `h${node.depth}` as const;
    return <Tag>{children}</Tag>;
  },
  blockquote: (_, children) => <blockquote>{children}</blockquote>,
  list: (node, children) =>
    node.ordered ? <ol>{children}</ol> : <ul>{children}</ul>,
  listItem: (_, children) => <li>{children}</li>,
  code: (node) => (
    <pre>
      <code>{node.value}</code>
    </pre>
  ),
  thematicBreak: () => <hr />,
  table: (_, children) => <table>{children}</table>,
  tableRow: (_, children) => <tr>{children}</tr>,
  tableCell: (_, children) => <td>{children}</td>,
  footnoteDefinition: (node, children) => (
    <div id={`fn-${node.identifier}`}>{children}</div>
  ),
  text: (node) => node.value,
  inlineCode: (node) => <code>{node.value}</code>,
  emphasis: (_, children) => <em>{children}</em>,
  strong: (_, children) => <strong>{children}</strong>,
  delete: (_, children) => <del>{children}</del>,
  link: (node, children) => (
    <a href={node.url} title={node.title ?? undefined}>
      {children}
    </a>
  ),
  image: (node) => (
    <img src={node.url} alt={node.alt} title={node.title ?? undefined} />
  ),
  break: () => <br />,
  footnoteReference: (node) => (
    <sup>
      <a href={`#fn-${node.identifier}`}>{node.label ?? node.identifier}</a>
    </sup>
  ),
  // You decide these three. See the security note on rawHtml below.
  html: (node) => (
    <span dangerouslySetInnerHTML={{ __html: sanitize(node.value) }} />
  ),
  assetReference: (node) => (
    <img src={`/assets/${node.assetId}`} alt={node.alt} />
  ),
  entryReference: (node, children) => (
    <a href={`/${node.collectionId}/${node.entryId}`}>{children}</a>
  ),
};

const root = entry.values.body.content.en;
const rendered = root !== null ? mdastRender(root, renderers) : null;
```

`MdastRenderersBase<T>` requires a handler for every node type, so a forgotten one is a compile error rather than a silent gap. The `walk` switch is exhaustiveness-checked the same way, so adding a node type in a future Core release surfaces as a type error in your renderers until you handle it.

If you're building a reusable binding (what `@elek-io/core/astro` is) rather than a one-off, layer defaults on top so your consumers override only what they want. Mirror `astroDefaults`: build a `Pick<MdastRenderersBase<T>, DefaultedRendererKey>` of safe defaults, expose `FrameworkRenderers<T>` as the consumer-facing override shape, and merge `{ ...defaults, ...overrides }` before calling `mdastRender`. `REQUIRED_RENDERER_KEYS` names the three keys (`html`, `assetReference`, `entryReference`) that stay required because no default is safe for them. All four are exported from `@elek-io/core`.

## When you need plain text (no markdown)

If you only need plain text (e.g. for fulltext search, excerpts or heading slugs), Core ships `extractText` from `@elek-io/core`. It walks any mdast node and concatenates `text`, `inlineCode` and `code` values in document order. Raw html and image/reference alt text are skipped. Going through markdown serialization is overkill for that case.

Block-level siblings (paragraphs, list items, table rows and cells) are joined with a separator that defaults to a single space, so a heading followed by a paragraph reads as `Title Body` rather than `TitleBody`. Inline content keeps its own spacing, so a sentence is never broken up. Pass a second argument to change the separator, for example `'\n'` when producing a plain-text document that should keep block breaks.

```ts
import { extractText } from '@elek-io/core';

const plain = body !== null ? extractText(body) : '';
const asLines = body !== null ? extractText(body, '\n') : '';
```

## Security note: rawHtml

If a markdown field's `features.rawHtml: true`, authors can embed arbitrary HTML in entries — including `<script>` tags. **Core does not sanitize.** Your renderer MUST sanitize at render time:

```tsx
import DOMPurify from 'isomorphic-dompurify';

case 'html':
  return <Fragment set:html={DOMPurify.sanitize(node.value)} />;
```

This is non-optional when `rawHtml` is enabled. Partial sanitization in Core would create false confidence — consumers might stop sanitizing themselves, and any bypass becomes a production XSS incident. Putting the responsibility entirely on the rendering layer (where the output context is known: HTML doc? JSX? plain text?) is the correct layering.

## Security note: link and image URLs

Core's schema rejects exotic URL schemes on `link` and `image` nodes: `javascript:`, `data:`, `file:`, `vbscript:`, and protocol-relative URLs (`//host`) cannot be persisted. `link.url` accepts `http`/`https`/`mailto`/`tel` plus site-relative (`/path`), sibling/parent-relative (`./`, `../`), and fragment-only (`#section`) forms. `image.url` accepts only absolute `http`/`https` (use `assetReference` for internal images).

Renderers should still apply their own per-context policy on top of this. Examples: a closed-corpus site might want to allow only same-origin links; an email-rendering pipeline might want to strip `tel:` links. The schema check eliminates the most dangerous classes; the rendering layer owns the rest.

## Out of scope in Core

- **HTML rendering / sanitization**: not provided. Consumers walk the tree and own any sanitization (especially for `rawHtml`-enabled fields).
- **Markdown serialization itself**: not provided. Since `assetReference` and `entryReference` are custom mdast nodes that do not have a standard way of being represented in markdown - especially since Core does not know about the locations of referenced files in the output, every consumer needs to resolve elek.io-specific reference nodes into standard mdast how they see fit. Then consumers compose with `mdast-util-to-markdown` (and any extensions they want) for the string conversion.
- **Markdown-to-mdast parsing**: not provided. Same reasoning as above.
- **Reference integrity on delete**: Currently deleting an Asset or Entry doesn't block or cascade through entries that reference it. Dangling refs can result; renderers should handle missing references gracefully.
- **Tree depth limit**: enforced at 100 levels of nesting (matches `markdown-it`'s `maxNesting` default). Trees deeper than that are rejected at write time. Renderers don't need their own bound, but it remains good hygiene for any consumer that processes trees from outside Core.
