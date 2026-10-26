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
- **Three node types require an explicit override**, `html`, `assetReference` and `entryReference`. The other 21 have semantic HTML defaults that render every field their node carries, except the three in [what a default leaves to you](#what-a-default-leaves-to-you).
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

The defaults emit plain semantic HTML - no class names, no `rel`/`target`, no slug anchors, no syntax highlighting.

A handler's shape is `(node, children, context) => ...` for a parent and `(node, context) => ...` for a leaf, and one that does not need the [context](#where-a-node-sits) leaves the parameter out. Each snippet below goes into the renderers object at the `mdastRender` call in the template, next to the three required handlers. Common override patterns:

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

An override replaces the default whole, so the way back to the reference is yours to re-add here, as is the `fn-` id if you want another scheme. No paragraph places a way back once `footnoteDefinition` is yours, so the collected section carries exactly the one you write.

**Custom top-level wrap via `root`.** The default wraps the rendered blocks in a Fragment so `<article>{rendered}</article>` works at the call site. You can override `root` to do the wrapping at the renderer level instead - useful when the renderer is responsible for the whole article shell:

```typescript
root: (_, children) => <article class="prose">{children}</article>,
```

### What a default leaves to you

Every default renders every field of its node except these three. Nothing else of a node is dropped, so an ordered list keeps the number it counts from and a task item keeps its checked state without you writing a handler.

| Field | What the default does with it | Override to get |
| --- | --- | --- |
| `code.lang` | nothing, `<pre><code>` carries no class | the class name your highlighter reads, see `code` above |
| `code.meta` | nothing, it is the option string of a highlighter Core does not ship | whatever your highlighter makes of it |
| `footnoteDefinition.label` | nothing, the authored spelling of the identifier shows on the reference instead | it on the note as well |

### Three placements the paragraph makes

A parent's handler is given its children already rendered, so three placements are out of its reach. The `paragraph` default makes all three, because its [context](#where-a-node-sits) names the list item or the note it sits in:

| What | Where it lands |
| --- | --- |
| The text of an item of a tight list | `<li>text</li>`, without the `<p>` a loose item keeps |
| A task item's checkbox | inside a `<label>` that opens the item's text, on one line with it |
| A footnote's way back | at the end of the note's last paragraph |

```text
<ul><li><label><input type="checkbox" checked disabled> Pay the rent</label></li></ul>
<div id="fn-1"><p>The note. <a href="#fnref-1" aria-label="Back to content">↩</a></p></div>
```

- **A list is tight or loose as a whole**, which is what mdast records in `list.spread` and `listItem.spread`. The list is loose when its own `spread` is true, when any item's is, or when an item that carries none holds more than one block. Every item of a loose list keeps its `<p>`.
- **Only a paragraph directly inside the item loses its `<p>`.** A quote in a tight item keeps the one around its own text.
- **The `<label>` names the checkbox**, so a screen reader reads the item's text once. A nested list stays outside the label, and an item whose text is an image is named by that image's alt text.
- **Three helpers answer the placements from a context**, so an override does not walk the tree: `isInTightListItem`, `taskItemChecked` and `footnoteWayBackIdentifier`, all exported from `@elek-io/core`. The first two are what a `paragraph` override needs to keep the tight item and the box.

```typescript
paragraph: (_, children, context) => {
  const checked = taskItemChecked(context); // true | false | null
  const inner = checked === null ? children : (
    <label><input type="checkbox" checked={checked} disabled /> {children}</label>
  );
  return isInTightListItem(context) ? <>{inner}</> : <p>{inner}</p>;
},
```

Where a paragraph cannot take one of them, the item and the note place it themselves:

- An item whose first block is not a paragraph, or which holds no block at all, carries its checkbox before its first block. Its name goes on an `aria-label` there, which a screen reader reads beside the item's text, and an item with no text at all gets no name.
- A note whose last block is a list or a code block lets the way back follow its blocks. A paragraph nested in that block never takes it.

An override moves whatever it takes over, so none of the three ever lands twice or nowhere:

- **An override of `paragraph` hands both back**, so the item places every checkbox and the note every way back, and your own paragraph loses neither.
- **An override of `listItem` keeps every checkbox**, because the box sits inside the item's text rather than in the `<li>` your handler writes.
- **An override of `footnoteDefinition` takes the way back over whole**, its wording included, and no paragraph places one. That is how a site in another language replaces "Back to content" without touching `paragraph`:

```typescript
footnoteDefinition: (node, children) => (
  <div id={`fn-${node.identifier}`}>
    {children}
    <a href={`#fnref-${node.identifier}`} aria-label="Zurück zum Text">
      ↩
    </a>
  </div>
),
```

### Where a default cannot reach

One `astroDefaults` object serves every render, so footnote ids are built from the identifier alone. A default cannot take a prefix, because that would mean state in a shared object.

- Two trees on one page claim the same `fn-` and `fnref-` ids, and an anchor then lands on whichever rendered first.
- A note referenced twice repeats its reference id, so its way back lands on the first reference.

Give both handlers one of your own:

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

A `footnoteDefinition` of your own owns the way back, so the prefixed version above is the only one the page shows.

### Where a node sits

An mdast node does not carry its own position, and some of what a handler has to decide is only knowable from it. A table cell is the clear case: nothing on the cell says whether it heads a column, and the alignment of its column sits on the table.

So every handler receives an `MdastNodeContext` as its last argument, exported from `@elek-io/core`:

| Field | Holds |
| --- | --- |
| `index` | the node's position among its parent's children, 0 for the root |
| `ancestors` | every ancestor, the root first and the direct parent last, so `ancestors.at(-1)` is the parent |

Two things follow from that shape:

- There is no `parent` field, because `ancestors.at(-1)` already is one.
- The `ancestors` array is shared by a node's siblings. Read it, never write to it.

A handler that does not need it declares fewer parameters, which is why every renderers object written before the context existed still compiles.

### Tables

A table's header is its first row, which is all mdast records. The defaults turn that into the markup a screen reader needs:

```text
<table>
  <thead><tr><th scope="col">Field</th><th scope="col">Type</th></tr></thead>
  <tbody><tr><td>slug</td><td>string</td></tr></tbody>
</table>
```

- The first row's cells are `<th scope="col">`, every row below holds `<td>`, and an empty header cell stays a header cell.
- `<thead>` and `<tbody>` wrap those rows, and neither is emitted empty. A table of one row is a header with no body.
- A column's alignment arrives as `style="text-align:left|center|right"` on every cell of that column, header and body alike.
- A column the markdown left unaligned gets no style at all, instead of a hard-coded left, so its body cells keep the start edge of the reading direction. Its header cell is centered, because that is what a user agent does with a `<th>` of its own accord, and only your CSS can change that.

`table.align` sits on the table and the cell is what renders it, so two helpers exported from `@elek-io/core` answer a cell's two questions from its context. Both are what the defaults use:

```typescript
import { isTableHeaderCell, tableCellAlign } from '@elek-io/core';

tableCell: (_, children, context) => {
  const align = tableCellAlign(context); // 'left' | 'center' | 'right' | null
  const style = align ? { textAlign: align } : undefined;
  return isTableHeaderCell(context) ? (
    <th scope="col" style={style}>{children}</th>
  ) : (
    <td style={style}>{children}</td>
  );
},
```

Both answer from a cell's context, so `isTableHeaderCell` is false for a row. A `tableRow` override that asks whether it is the header row reads `context.index === 0`.

**A table has no caption**, because mdast has no caption node, so there is nothing for Core to render one from. That matters when you put a wide table in a horizontally scrolling box: the box is a scrollable region, and a region needs a name and keyboard reach of its own. Name it from whatever your page knows, the heading above the table for example, rather than expecting one in the tree.

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

The primitive is the same typed fold the Astro binding wraps. `T` is your framework's element type, and you supply one handler per node type. Parents receive their already-rendered `children`, leaves receive just the node, and both receive the [context](#where-a-node-sits) last.

The example below uses React (`T = ReactNode`). For Vue bind `T = VNode`, for Solid `T = JSX.Element`. Only the element factory changes, the structure stays identical.

```tsx
import {
  extractText,
  footnoteWayBackIdentifier,
  isInTightListItem,
  isTableHeaderCell,
  mdastRender,
  tableCellAlign,
  taskItemChecked,
  type MdAstListItem,
  type MdastRenderersBase,
} from '@elek-io/core';
import type { ReactNode } from 'react';

// A task item's name where the item itself carries the box, which is where
// no paragraph of it can: the text of its own blocks, a list directly inside
// the item left out, whether its items are tasks naming a checkbox of their
// own or plain items. Trimmed, so an item whose text is only whitespace gets
// no name rather than a name of spaces.
function taskItemName(node: MdAstListItem): string | undefined {
  const ownBlocks = {
    ...node,
    children: node.children.filter((child) => child.type !== 'list'),
  };
  return extractText(ownBlocks).trim() || undefined;
}

// The way back from a footnote to the reference that names it
function wayBack(identifier: string): ReactNode {
  return (
    <a href={`#fnref-${identifier}`} aria-label="Back to content">
      ↩
    </a>
  );
}

const renderers: MdastRenderersBase<ReactNode> = {
  root: (_, children) => <>{children}</>,
  // The three placements a parent cannot reach, each answered by the
  // paragraph's context: a tight item's text, a task item's checkbox and the
  // way back that ends a note's last paragraph
  paragraph: (_, children, context) => {
    const checked = taskItemChecked(context);
    const identifier = footnoteWayBackIdentifier(context);
    const content =
      checked === null ? (
        <>{children}</>
      ) : (
        <label>
          <input type="checkbox" checked={checked} disabled readOnly />{' '}
          {children}
        </label>
      );
    const inner = (
      <>
        {content}
        {identifier !== null && <> {wayBack(identifier)}</>}
      </>
    );
    return isInTightListItem(context) ? inner : <p>{inner}</p>;
  },
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
    // A checked of null is an ordinary item, true and false are a task. The
    // item places the box only where its first block is no paragraph, since
    // the paragraph above takes it inside the item's text otherwise
    node.checked === null || node.children[0]?.type === 'paragraph' ? (
      <li>{children}</li>
    ) : (
      <li>
        <input
          type="checkbox"
          aria-label={taskItemName(node)}
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
  table: (_, children) => (
    <table>
      {children.length > 0 && <thead>{children[0]}</thead>}
      {children.length > 1 && <tbody>{children.slice(1)}</tbody>}
    </table>
  ),
  tableRow: (_, children) => <tr>{children}</tr>,
  tableCell: (_, children, context) => {
    const align = tableCellAlign(context);
    const style = align ? { textAlign: align } : undefined;
    return isTableHeaderCell(context) ? (
      <th scope="col" style={style}>
        {children}
      </th>
    ) : (
      <td style={style}>{children}</td>
    );
  },
  // The way back follows the blocks only where the note's last one is no
  // paragraph, a list or a code block for one
  footnoteDefinition: (node, children) => (
    <div id={`fn-${node.identifier}`}>
      {children}
      {node.children.at(-1)?.type !== 'paragraph' && wayBack(node.identifier)}
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
- Hand the two placements on where a consumer's own handler takes them over, which is what the Astro binding does while merging: a `paragraph` of theirs leaves the checkbox to `listItem` and the way back to `footnoteDefinition`, and a `footnoteDefinition` of theirs owns the way back alone.

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
