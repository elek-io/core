# Markdown content

elek.io stores rich body content as a structured [mdast](https://github.com/syntax-tree/mdast) tree (markdown abstract syntax tree), not as a markdown source string. This document explains why and how to use it.

For the field reference, see [`fields.md`](./fields.md).

## The data shape

A `markdown` field on a Collection or Component produces an `MdAstValue` on the Entry. Its `content` is keyed per language:

```typescript
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

Every node has a `type` field. Nested content lives in `children`. Empty markdown values are canonically `null` per language - not an empty tree.

## Why a tree and not a markdown string?

- **References are first-class**: `entryReference` and `assetReference` nodes carry UUIDs (and `collectionId` for Entry refs), not opaque URLs. Consumers can resolve them to whatever URL structure or component they want at render time.
- **Per-field validation works directly on the tree**: the `features` allowlist on each markdown field controls which node types are accepted at write time. Disallowed nodes are rejected by Core's schema layer - they never reach disk.

## Rendering markdown content in Astro

Core ships `mdastRender` from `@elek-io/core/astro`. It walks the mdast tree, dispatches each node type to a renderer, and returns an Astro JSX element ready to interpolate.

Three things to know before writing a renderer:

- **Astro's `render()` does not apply to an elek.io Entry.** It hands back the rendered HTML an entry carries with it, and the loaders store none, because a finished HTML string cannot keep the `entryReference` and `assetReference` nodes a page needs the UUIDs from.
  - Calling it anyway is not an error and produces nothing: `<Content />` renders empty, `headings` is `[]` and `remarkPluginFrontmatter` is `{}`, with no warning anywhere. Body content arrives on `entry.data` as a tree instead, and `mdastRender` is what turns it into markup.
- **Three node types require an explicit override**, `html`, `assetReference` and `entryReference`. The other 21 have semantic HTML defaults that render every field their node carries, except the six in [what a default leaves to you](#what-a-default-leaves-to-you).
  - The type system surfaces the required keys because content editors can flip `features.rawHtml`, `features.assetReferences` and `features.entryReferences`, or extend `ofCollections`, on any field at any time.
  - Forcing a documented decision per key stops the renderer from silently no-opping when a new node type appears. Choosing `() => null` is a valid decision and documents "render nothing if this ever appears."
- **JSX belongs in the template, not in the frontmatter.** That is a property of Astro rather than of `mdastRender`. The `---` fence of an `.astro` file is TypeScript, not TSX, so a handler written as `(node) => <em>{node.alt}</em>` up there is a parse error.
  - Write the renderers object inline at the `mdastRender` call in the template, as below. What `mdastRender` returns is an ordinary Astro template result, so it renders wherever you put it, including inside a component you pass it to.

```astro
---
// src/pages/posts/[slug].astro
import { getCollection } from 'astro:content';
import { Image } from 'astro:assets';
import { elekSlugPaths, mdastRender } from '@elek-io/core/astro';
import DOMPurify from 'isomorphic-dompurify';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return elekSlugPaths(posts, { slugField: 'slug', language: 'en' });
}

// Every path carries the language it was built for
const { entry: post, language } = Astro.props;

// Sync lookup maps. mdastRender's handlers run synchronously, so build
// them once per page from the already-awaited collections.
const assets = await getCollection('assets');
const posts = await getCollection('posts');
const assetById = new Map(assets.map((a) => [a.id, a.data]));
// References carry UUIDs, the page URLs are slugs, so the renderer
// needs the same mapping the routes were built from
const slugById = new Map(posts.map((p) => [p.id, p.data.slug[language]]));

// An optional field is null in a language nobody filled in
const body = post.data.body[language];
---
<article>
  {body !== null &&
    mdastRender(body, {
      // Required - sign off on each, even if your fields don't currently use them.
      html: (node) => <Fragment set:html={DOMPurify.sanitize(node.value)} />,
      assetReference: (node) => {
        const asset = assetById.get(node.assetId);
        // src is Astro's own image for image Assets, href the public URL
        // for every other Asset, and each is null for the other kind
        return asset?.src ? (
          <Image src={asset.src} alt={node.alt} />
        ) : (
          <a href={asset?.href ?? '#'}>{node.alt}</a>
        );
      },
      entryReference: (node, children) => {
        const slug = slugById.get(node.entryId);
        // No slug means the referenced Entry has no page in this language
        return slug ? (
          <a href={`/posts/${slug}`}>{children}</a>
        ) : (
          <Fragment>{children}</Fragment>
        );
      },
    })}
</article>
```

The object is checked against `MdastAstroRenderers` by the call itself, so a missing required key or a mistyped node property is an error without annotating it.

`entryReference` nodes carry the referenced Entry's UUID, which is also its store id, so `getEntry('posts', node.entryId)` resolves a reference from anywhere without a map. The map above exists only to turn that UUID into the same URL the routes were built from.

A Collection without a slug field routes by UUID instead, with a `getStaticPaths` that returns:

```typescript
posts.map((post) => ({ params: { id: post.id }, props: { post } }));
```

The three required handlers are ~20 lines for the typical case. Without the helper the equivalent hand-rolled switch (see the [fallback recipe](#fallback-recipe-for-frameworks-without-an-official-wrapper) below) takes ~90, and it grows with every node type Core adds.

### Defaults and what you'll commonly override

The defaults emit plain semantic HTML - no class names, no `rel`/`target`, no slug anchors, no syntax highlighting. The shape is `(node, children) => ...` for parents and `(node) => ...` for leaves. Each snippet below goes into the renderers object at the `mdastRender` call in the template, next to the three required handlers. Common override patterns:

**Slug-id anchors on headings (table of contents).** `extractText` is exported from `@elek-io/core` and returns the concatenated plain text of an mdast node.

```typescript
heading: (node, children) => {
  const id = slugify(extractText(node));
  const Tag = `h${node.depth}` as const;
  return <Tag id={id}>{children}</Tag>;
},
```

**Syntax highlighting on code blocks.** Most highlighters (Prism / Shiki / Highlight.js) look for `class="language-${lang}"` on the `<code>` element. The default ships without any class - override to wire the format your highlighter expects:

```typescript
code: (node) => (
  <pre>
    <code class={node.lang ? `language-${node.lang}` : undefined}>
      {node.value}
    </code>
  </pre>
),
```

**External-link policy on `link`.** The default emits a plain `<a>` because the same tree mixes internal site URLs (`/path`, `#section`, `./sibling`) with external `https://` ones - a single auto policy would be wrong for half. Override when you know your tree's URL mix:

```typescript
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

```typescript
image: (node) => (
  <Image src={node.url} alt={node.alt} inferSize />
),
```

**Collected footnotes section at the bottom.** The default renders each `footnoteDefinition` inline in tree order, matching mdast structure. Most articles want a single collected footnotes section at the end.

Declare the accumulator in the frontmatter, override the handler to fill it and return `null`, then render your section after the article. Astro evaluates template expressions in order, so the list is complete by the time the second one is reached:

```astro
---
import { mdastRender } from '@elek-io/core/astro';

const footnotes: astroHTML.JSX.Element[] = [];
---
<article>
  {body !== null &&
    mdastRender(body, {
      // ...
      footnoteDefinition: (node, children) => {
        footnotes.push(<li id={`fn-${node.identifier}`}>{children}</li>);
        return null;
      },
    })}
</article>
{footnotes.length > 0 && (
  <section class="footnotes">
    <ol>{footnotes}</ol>
  </section>
)}
```

An override replaces the default whole, so the way back to the reference is yours to re-add here, as is the `fn-` id if you want another scheme.

**Custom top-level wrap via `root`.** The default wraps the rendered blocks in a Fragment so `<article>{rendered}</article>` works at the call site. You can override `root` to do the wrapping at the renderer level instead - useful when the renderer is responsible for the whole article shell:

```typescript
root: (_, children) => <article class="prose">{children}</article>,
```

### What a default leaves to you

Every default renders every field of its node except these six. Nothing else of a node is dropped, so an ordered list keeps the number it counts from and a task item keeps its checked state without you writing a handler.

| Field | What the default does with it | Override to get |
| --- | --- | --- |
| `code.lang` | nothing, `<pre><code>` carries no class | the class name your highlighter reads, see `code` above |
| `code.meta` | nothing, it is the option string of a highlighter Core does not ship | whatever your highlighter makes of it |
| `list.spread` | nothing, see the tight list below | nothing, an override cannot reach it either |
| `listItem.spread` | the same | the same |
| `footnoteDefinition.label` | nothing, the authored spelling of the identifier shows on the reference instead | it on the note as well |
| `table.align` | nothing, see the table below | nothing, an override cannot reach it either |

### Where a handler cannot reach

A handler is given its own node and its already rendered children, never its position or its siblings. Five things follow, and the defaults ship them visibly rather than working around them.

- **A task item's checkbox precedes its text** instead of opening the item's first paragraph, which is where remark puts it. The paragraph arrives already rendered, so an override cannot reach inside it either. `li > p { display: inline }` is the CSS that puts box and text on one line, and it keeps the list marker, which the default leaves in place by adding no class name.
- **A task item's checkbox is named with the item's own text.** A `<label>` cannot wrap blocks that arrive already rendered, so the name goes on an `aria-label` instead, and a screen reader reads the item's text twice: once as the name of the box, once as the text.
- **A note's way back follows its blocks** instead of ending its last paragraph, for the same reason.
- **A tight list item keeps its paragraph**, so `<li><p>text</p></li>` rather than `<li>text</li>`. It is valid and semantic, and it is one `<p>` of margin away from what other renderers emit.
- **Footnote ids are built from the identifier alone.** Two trees on one page claim the same `fn-` and `fnref-` ids, and an anchor then lands on whichever rendered first. A note referenced twice repeats its reference id, so its way back lands on the first reference. A default cannot take a prefix, because one `astroDefaults` object serves every render. Give both handlers one of your own:

```typescript
footnoteReference: (node) => (
  <sup id={`${prefix}fnref-${node.identifier}`}>
    <a href={`#${prefix}fn-${node.identifier}`}>
      {node.label ?? node.identifier}
    </a>
  </sup>
),
footnoteDefinition: (node, children) => (
  <div id={`${prefix}fn-${node.identifier}`}>
    {children}
    <a href={`#${prefix}fnref-${node.identifier}`} aria-label="Back to content">
      ↩
    </a>
  </div>
),
```

The back-link's `aria-label` is English, so a site in another language overrides `footnoteDefinition` for that too.

**A table's header cells are out of reach of an override as well.** `tableCell` is handed its own node and its children, and nothing tells it which row or column it sits in. So `<th scope="col">` and `table.align` are out of reach of a default and of your override alike: every cell renders as `<td>` and alignment is lost. Follow [issue 244](https://github.com/elek-io/core/issues/244) for the fix.

### Reusable per-site renderer

For sites that render markdown in multiple places, write the overrides once in a small Astro component. The per-site rendering policy then lives in one file, and every page passes a tree to it:

```astro
---
// src/components/MdastContent.astro
import { mdastRender } from '@elek-io/core/astro';
import type { MdAstRoot } from '@elek-io/core';

interface Props {
  root: MdAstRoot | null;
}

const { root } = Astro.props;
---
{root !== null &&
  mdastRender(root, {
    html: (node) => /* ... */,
    assetReference: (node) => /* ... */,
    entryReference: (node, children) => /* ... */,
    // any standard-node overrides your site applies everywhere
  })}
```

Use it from any page:

```astro
<article><MdastContent root={post.data.body.en} /></article>
```

The overrides stay in the component's template, for the same reason as everywhere else: the frontmatter above them is TypeScript. A page that needs one more override for one article can always call `mdastRender` itself instead.

Core does not ship this component itself - it would be a thin one-file wrapper, project-specific (your overrides, your styling), and shipping a generic default would freeze opinions you should own.

### Fallback recipe for frameworks without an official wrapper

If you're targeting a framework Core doesn't ship a wrapper for yet (React, Vue, Solid, SvelteKit and so on), use the framework-agnostic primitive directly. `mdastRender` and `MdastRenderersBase<T>` are exported from `@elek-io/core`.

The primitive is the same typed fold the Astro binding wraps. `T` is your framework's element type, and you supply one handler per node type. Parents receive their already-rendered `children`, leaves receive just the node.

The example below uses React (`T = ReactNode`). For Vue bind `T = VNode`, for Solid `T = JSX.Element`. Only the element factory changes, the structure stays identical.

```tsx
import {
  extractText,
  mdastRender,
  type MdastRenderersBase,
} from '@elek-io/core';
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
    node.ordered ? (
      // A start of 1 is what an <ol> counts from anyway
      <ol start={node.start === 1 ? undefined : (node.start ?? undefined)}>
        {children}
      </ol>
    ) : (
      <ul>{children}</ul>
    ),
  listItem: (node, children) =>
    // A checked of null is an ordinary item, true and false are a task
    node.checked === null ? (
      <li>{children}</li>
    ) : (
      <li>
        <input
          type="checkbox"
          aria-label={extractText(node) || undefined}
          checked={node.checked}
          disabled
          readOnly
        />
        {children}
      </li>
    ),
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
    <div id={`fn-${node.identifier}`}>
      {children}
      <a href={`#fnref-${node.identifier}`} aria-label="Back to content">
        ↩
      </a>
    </div>
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
    <sup id={`fnref-${node.identifier}`}>
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

If you're building a reusable binding (what `@elek-io/core/astro` is) rather than a one-off, layer defaults on top so your consumers override only what they want. Mirror `astroDefaults`:

- Build a `Pick<MdastRenderersBase<T>, DefaultedRendererKey>` of safe defaults.
- Expose `FrameworkRenderers<T>` as the consumer-facing override shape.
- Merge `{ ...defaults, ...overrides }` before calling `mdastRender`.

`REQUIRED_RENDERER_KEYS` names the three keys (`html`, `assetReference`, `entryReference`) that stay required because no default is safe for them. All four are exported from `@elek-io/core`.

## When you need plain text (no markdown)

If you only need plain text (e.g. for fulltext search, excerpts or heading slugs), Core ships `extractText` from `@elek-io/core`. It walks any mdast node and concatenates `text`, `inlineCode` and `code` values in document order. Raw html and image/reference alt text are skipped. Going through markdown serialization is overkill for that case.

Block-level siblings (paragraphs, list items, table rows and cells) are joined with a separator that defaults to a single space, so a heading followed by a paragraph reads as `Title Body` rather than `TitleBody`. Inline content keeps its own spacing, so a sentence is never broken up.

Pass a second argument to change the separator, for example `'\n'` when producing a plain-text document that should keep block breaks.

```typescript
import { extractText } from '@elek-io/core';

const plain = body !== null ? extractText(body) : '';
const asLines = body !== null ? extractText(body, '\n') : '';
```

## Security note: rawHtml

If a markdown field's `features.rawHtml: true`, authors can embed arbitrary HTML in entries - including `<script>` tags. **Core does not sanitize.** Your renderer MUST sanitize at render time:

```tsx
import DOMPurify from 'isomorphic-dompurify';

case 'html':
  return <Fragment set:html={DOMPurify.sanitize(node.value)} />;
```

This is non-optional when `rawHtml` is enabled. Partial sanitization in Core would create false confidence - consumers might stop sanitizing themselves, and any bypass becomes a production XSS incident. Putting the responsibility entirely on the rendering layer (where the output context is known: HTML doc? JSX? plain text?) is the correct layering.

## Security note: the URL a link or image may hold

Core's schema rejects exotic URL schemes on `link` and `image` nodes. `javascript:`, `data:`, `file:`, `vbscript:` and protocol-relative URLs (`//host`) cannot be persisted.

- `link.url` accepts `http`, `https`, `mailto` and `tel`, plus site-relative (`/path`), sibling and parent-relative (`./`, `../`) and fragment-only (`#section`) forms.
- `image.url` accepts only absolute `http` and `https`. Use `assetReference` for internal images.

A relative `link.url` is resolved before it is accepted, and has to keep the origin it is relative to. `/\evil.com` reads as a path and resolves to `https://evil.com/`, and so does the same shape holding a tab, a line feed or a carriage return.

Renderers should still apply their own per-context policy on top of this. Examples: a closed-corpus site might want to allow only same-origin links. An email-rendering pipeline might want to strip `tel:` links. The schema check eliminates the most dangerous classes. The rendering layer owns the rest.

## Out of scope in Core

- **HTML rendering / sanitization**: not provided. Consumers walk the tree and own any sanitization (especially for `rawHtml`-enabled fields).
- **Markdown serialization itself**: not provided. `assetReference` and `entryReference` are custom mdast nodes with no standard markdown representation, and Core does not know where referenced files end up in the output.
  - Every consumer resolves elek.io-specific reference nodes into standard mdast how they see fit, then composes with `mdast-util-to-markdown` (and any extensions they want) for the string conversion.
- **Markdown-to-mdast parsing**: not provided. Same reasoning as above.
- **Reference integrity on delete**: deleting an Asset, Entry or Collection that is still referenced is blocked with a `Conflict`, and create / update reject a reference to content that does not exist. Projects are managed only through Core or elek.io Desktop, so these gates cover every supported change.
  - See [`references.md`](./references.md) for the full model and the one case, a sync that merges concurrent changes, they cannot fully prevent.
- **Tree depth limit**: enforced at 100 levels of nesting (matches `markdown-it`'s `maxNesting` default). Trees deeper than that are rejected at write time. Renderers don't need their own bound, but it remains good hygiene for any consumer that processes trees from outside Core.

## See also

- [`fields.md`](./fields.md) - the `markdown` field definition and its `features` allowlist
- [`references.md`](./references.md) - how `assetReference` / `entryReference` fit the wider reference model and its integrity rules
- [`asset-management.md`](./asset-management.md) - the Assets that `assetReference` nodes point to
- [`usage.md`](./usage.md) - the Astro integration in context
- [`concepts.md`](./concepts.md) - Values and the overall data model
