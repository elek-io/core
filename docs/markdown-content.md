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

## Recommended: render by walking the tree

For most display use cases, walk the tree and emit a component (or HTML element) per node type. You get full control over how every node renders, including references.

```tsx
import type { MdAstBlockNode, MdAstPhrasingNode } from '@elek-io/core';

function renderBlock(node: MdAstBlockNode): astroHTML.JSX.Element {
  switch (node.type) {
    case 'heading':
      return (
        <Heading depth={node.depth}>
          {node.children.map(renderPhrasing)}
        </Heading>
      );
    case 'paragraph':
      return <p>{node.children.map(renderPhrasing)}</p>;
    case 'blockquote':
      return <blockquote>{node.children.map(renderBlock)}</blockquote>;
    case 'list':
      return node.ordered ? (
        <ol>{node.children.map(renderListItem)}</ol>
      ) : (
        <ul>{node.children.map(renderListItem)}</ul>
      );
    case 'code':
      return (
        <pre>
          <code class={node.lang ?? undefined}>{node.value}</code>
        </pre>
      );
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
      return (
        <a href={node.url} title={node.title ?? undefined}>
          {node.children.map(renderPhrasing)}
        </a>
      );
    case 'image':
      return (
        <img src={node.url} alt={node.alt} title={node.title ?? undefined} />
      );
    case 'entryReference':
      return (
        <a href={`/${node.collectionId}/${node.entryId}`}>
          {node.children.map(renderPhrasing)}
        </a>
      );
    case 'assetReference':
      return (
        <img
          src={`/assets/${node.assetId}`}
          alt={node.alt}
          title={node.title ?? undefined}
        />
      );
    case 'break':
      return <br />;
    case 'html':
      return <Fragment set:html={sanitize(node.value)} />;
    case 'footnoteReference':
      return (
        <sup>
          <a href={`#fn-${node.identifier}`}>{node.identifier}</a>
        </sup>
      );
  }
}

const root = entry.values.body.content.en;
if (root !== null) {
  for (const block of root.children) {
    renderBlock(block);
  }
}
```

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

## Security note: link and image URLs

Core's schema rejects exotic URL schemes on `link` and `image` nodes: `javascript:`, `data:`, `file:`, `vbscript:`, and protocol-relative URLs (`//host`) cannot be persisted. `link.url` accepts `http`/`https`/`mailto`/`tel` plus site-relative (`/path`), sibling/parent-relative (`./`, `../`), and fragment-only (`#section`) forms. `image.url` accepts only absolute `http`/`https` (use `assetReference` for internal images).

Renderers should still apply their own per-context policy on top of this. Examples: a closed-corpus site might want to allow only same-origin links; an email-rendering pipeline might want to strip `tel:` links. The schema check eliminates the most dangerous classes; the rendering layer owns the rest.

## Out of scope in Core

- **HTML rendering / sanitization**: not provided. Consumers walk the tree and own any sanitization (especially for `rawHtml`-enabled fields).
- **Markdown serialization itself**: not provided. Since `assetReference` and `entryReference` are custom mdast nodes that do not have a standard way of being represented in markdown - especially since Core does not know about the locations of referenced files in the output, every consumer needs to resolve elek.io-specific reference nodes into standard mdast how they see fit. Then consumers compose with `mdast-util-to-markdown` (and any extensions they want) for the string conversion.
- **Markdown-to-mdast parsing**: not provided. Same reasoning as above.
- **Reference integrity on delete**: Currently deleting an Asset or Entry doesn't block or cascade through entries that reference it. Dangling refs can result; renderers should handle missing references gracefully.
- **Tree depth limit**: enforced at 100 levels of nesting (matches `markdown-it`'s `maxNesting` default). Trees deeper than that are rejected at write time. Renderers don't need their own bound, but it remains good hygiene for any consumer that processes trees from outside Core.
