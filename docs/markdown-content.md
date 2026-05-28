# Markdown Content

elek.io stores rich body content as a structured mdast tree (markdown abstract syntax tree), not as a markdown source string. This document explains why, how to render it, and how to convert it to markdown when you need a string.

For the field reference, see [`fields.md`](./fields.md).

## The data shape

A `markdown` field on a Collection or Component produces an `MdAstValue` on the Entry. Its `content` is keyed per language:

```ts
entry.values.body.content.en === {
  type: 'root',
  children: [
    { type: 'heading', depth: 2, children: [{ type: 'text', value: 'Hello' }] },
    { type: 'paragraph', children: [
      { type: 'text', value: 'See ' },
      {
        type: 'entryReference',
        collectionId: '...',
        entryId: '...',
        children: [{ type: 'text', value: 'tutorial' }]
      },
      { type: 'text', value: '.' }
    ]}
  ]
}
```

Every node has a `type` field; nested content lives in `children`. Empty markdown values are canonically `null` per language — not an empty tree.

## Why a tree and not a markdown string?

- **References are first-class**: `entryReference` and `assetReference` nodes carry UUIDs (and `collectionId` for entry refs), not opaque URLs. Consumers resolve them to whatever URL structure they want at render time.
- **No double parse**: Core stores the structured form; consumers never need to re-parse markdown.
- **Per-field validation works directly on the tree**: the `features` allowlist on each markdown field controls which node types are accepted at write time. Disallowed nodes are rejected by Core's schema layer — they never reach disk.

## Recommended: render by walking the tree

For most display use cases, walk the tree and emit a component (or HTML element) per node type. You get full control over how every node renders, including references.

```tsx
import type { MdAstBlockNode, MdAstPhrasingNode } from '@elek-io/core';

function renderBlock(node: MdAstBlockNode): astroHTML.JSX.Element {
  switch (node.type) {
    case 'heading':
      return <Heading depth={node.depth}>{node.children.map(renderPhrasing)}</Heading>;
    case 'paragraph':
      return <p>{node.children.map(renderPhrasing)}</p>;
    case 'blockquote':
      return <blockquote>{node.children.map(renderBlock)}</blockquote>;
    case 'list':
      return node.ordered
        ? <ol>{node.children.map(renderListItem)}</ol>
        : <ul>{node.children.map(renderListItem)}</ul>;
    case 'code':
      return <pre><code class={node.lang ?? undefined}>{node.value}</code></pre>;
    case 'thematicBreak':
      return <hr />;
    case 'html':
      // SECURITY: see §"Security note: rawHtml" below.
      return <Fragment set:html={sanitize(node.value)} />;
    case 'table':
      return <Table node={node} />;
    case 'footnoteDefinition':
      return <FootnoteDefinition node={node} />;
  }
}

function renderPhrasing(node: MdAstPhrasingNode): astroHTML.JSX.Element {
  switch (node.type) {
    case 'text':
      return <>{node.value}</>;
    case 'inlineCode':
      return <code>{node.value}</code>;
    case 'emphasis':
      return <em>{node.children.map(renderPhrasing)}</em>;
    case 'strong':
      return <strong>{node.children.map(renderPhrasing)}</strong>;
    case 'delete':
      return <del>{node.children.map(renderPhrasing)}</del>;
    case 'link':
      return <a href={node.url} title={node.title ?? undefined}>{node.children.map(renderPhrasing)}</a>;
    case 'image':
      return <img src={node.url} alt={node.alt} title={node.title ?? undefined} />;
    case 'entryReference':
      return <a href={`/${node.collectionId}/${node.entryId}`}>{node.children.map(renderPhrasing)}</a>;
    case 'assetReference':
      return <img src={`/assets/${node.assetId}`} alt={node.alt} title={node.title ?? undefined} />;
    case 'break':
      return <br />;
    case 'html':
      return <Fragment set:html={sanitize(node.value)} />;
    case 'footnoteReference':
      return <sup><a href={`#fn-${node.identifier}`}>{node.identifier}</a></sup>;
  }
}

const root = entry.values.body.content.en;
if (root !== null) {
  for (const block of root.children) {
    renderBlock(block);
  }
}
```

Each markdown field's `features` config controls which node types can appear on disk. The generated `types.ts` (from `@elek-io/cli generate-types`) emits the `features` map as a literal in the narrowed `fieldDefinitions` tuple, so you can introspect at compile time:

```ts
import type { ArticlesCollection } from './types.js';

type BodyFieldDef = ArticlesCollection['fieldDefinitions'][0];
// BodyFieldDef['features']['assetReferences'] is `true` (or `false`) as a literal.
```

Astro consumers receive whatever's on disk. Core's write path enforces reference existence and MIME constraints; dangling references can only result from manual edits or external bugs. Renderers should handle missing references gracefully (null check before resolving).

## When you need a markdown string

For export workflows (search indexing, AI prompt construction, writing entries to `.md` files), use `mdastToMarkdown`:

```ts
import { mdastToMarkdown } from '@elek-io/core';

const root = entry.values.body.content.en;
if (root !== null) {
  const markdown = mdastToMarkdown(root, {
    resolveEntry: ({ collectionId, entryId }) => `/posts/${entryId}`,
    resolveAsset: ({ assetId }) => `/cdn/${assetId}.jpg`,
  });
  // markdown is a string of CommonMark + GFM extensions.
}
```

The `resolveEntry` / `resolveAsset` callbacks turn typed reference nodes into the URLs you want in the link/image markdown. If you omit them, references serialize as sentinel URLs:

- `[text](elekio://entry/<collectionId>/<entryId>)`
- `![alt](elekio://asset/<assetId>)`

Sentinel URLs preserve the reference identity for round-trips back into Core. (`markdownToMdast`, the inverse helper, ships in a future release — see §"Out of scope" below.)

Output is human-readable markdown but **not byte-identical** to the writer's original input: list-marker style, fence backtick counts, and line wrapping are normalized by `mdast-util-to-markdown`'s defaults.

## When you need plain text (no markdown)

If you only need plain text (e.g. for fulltext search), walk the tree and concatenate `text` node values. Going through markdown serialization is overkill for that case:

```ts
function extractText(node: MdAstBlockNode | MdAstPhrasingNode): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'inlineCode' || node.type === 'code') return node.value;
  if ('children' in node) return node.children.map(extractText).join('');
  return '';
}
```

## Security note: rawHtml

If a markdown field's `features.rawHtml: true`, authors can embed arbitrary HTML in entries — including `<script>` tags. **Core does not sanitize.** Your renderer MUST sanitize at render time:

```tsx
import DOMPurify from 'isomorphic-dompurify';

case 'html':
  return <Fragment set:html={DOMPurify.sanitize(node.value)} />;
```

This is non-optional when `rawHtml` is enabled. Partial sanitization in Core would create false confidence — consumers might stop sanitizing themselves, and any bypass becomes a production XSS incident. Putting the responsibility entirely on the rendering layer (where the output context is known: HTML doc? JSX? plain text?) is the correct layering.

Desktop's field-definition editor should show a confirmation modal when an author enables `rawHtml`, explaining the implication. This is a Desktop-side concern; if you're embedding Core in your own UI, surface a similar warning.

## Security note: link and image URLs

Core's schema rejects exotic URL schemes on `link` and `image` nodes: `javascript:`, `data:`, `file:`, `vbscript:`, and protocol-relative URLs (`//host`) cannot be persisted. `link.url` accepts `http`/`https`/`mailto`/`tel` plus site-relative (`/path`), sibling/parent-relative (`./`, `../`), and fragment-only (`#section`) forms. `image.url` accepts only absolute `http`/`https` (use `assetReference` for internal images).

Renderers should still apply their own per-context policy on top of this. Examples: a closed-corpus site might want to allow only same-origin links; an email-rendering pipeline might want to strip `tel:` links. The schema check eliminates the most dangerous classes; the rendering layer owns the rest.

## Out of scope in Core

- **HTML rendering / sanitization**: not provided. Consumers walk the tree and own any sanitization (especially for `rawHtml`-enabled fields).
- **Markdown-to-mdast parsing**: ships in a follow-up release when a concrete consumer (CLI import script, migration tool) materializes. Until then, `mdastToMarkdown` is one-way.
- **Pre-serialized markdown alongside mdast in entry reads**: would either contain sentinel URLs (useless for display) or require Core to know about consumer URL structures (wrong layering). Call `mdastToMarkdown` at the consumer when you need the string form.
- **Reference integrity on delete**: deleting an Asset or Entry doesn't block or cascade through entries that reference it. Dangling refs can result; renderers should handle missing references gracefully.
- **Tree depth limit**: enforced at 100 levels of nesting (matches `markdown-it`'s `maxNesting` default). Trees deeper than that are rejected at write time. Renderers don't need their own bound, but it remains good hygiene for any consumer that processes trees from outside Core.
