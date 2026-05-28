/**
 * Public helper: serialize an mdast tree to a markdown string.
 *
 * elek.io stores body content as structured mdast trees (see
 * `MdAstValue`). Most consumer rendering paths walk the tree directly
 * (per-node component rendering — full control over output). This helper
 * is for use cases where a flat markdown string is the right output:
 *
 *   - Search indexing
 *   - AI prompt construction
 *   - Export to a markdown file
 *
 * See `docs/markdown-content.md` for guidance on choosing tree-walk
 * rendering vs. this serializer.
 *
 * Custom nodes (`entryReference`, `assetReference`) are transformed into
 * standard mdast `link` / `image` nodes before serialization. If the
 * caller provides `resolveEntry` / `resolveAsset`, the resolved URL is
 * used; otherwise, sentinel URLs (`elekio://entry/<cid>/<eid>`,
 * `elekio://asset/<aid>`) are emitted so the reference identity round-trips
 * back into Core if the markdown is later re-imported.
 */

import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import type { Image, Link, Nodes as MdastNodes } from 'mdast';
import type { Uuid } from '../schema/baseSchema.js';
import type {
  MdAstAssetReference,
  MdAstEntryReference,
  MdAstRoot,
} from '../schema/valueSchema.js';

export interface MdastToMarkdownOptions {
  /**
   * Resolves an `entryReference` node to the URL to render in the
   * serialized `[text](url)` link.
   *
   * When omitted, references serialize as
   * `[text](elekio://entry/<collectionId>/<entryId>)` sentinels.
   * The sentinel preserves the reference identity for round-trips back
   * into Core.
   */
  resolveEntry?: (ref: { collectionId: Uuid; entryId: Uuid }) => string;
  /**
   * Resolves an `assetReference` node to the URL to render in the
   * serialized `![alt](url)` image.
   *
   * When omitted, references serialize as
   * `![alt](elekio://asset/<assetId>)` sentinels.
   */
  resolveAsset?: (ref: { assetId: Uuid }) => string;
}

/**
 * Serialize an mdast tree to a markdown string.
 *
 * Output is human-readable and pipeable through external markdown tooling
 * but is **not byte-identical to the writer's original input**:
 * list-marker style, fence backtick counts, and line wrapping are
 * normalized by `mdast-util-to-markdown`'s defaults.
 */
export function mdastToMarkdown(
  root: MdAstRoot,
  options?: MdastToMarkdownOptions
): string {
  const transformed = transformCustomNodes(root, options) as MdastNodes;
  return toMarkdown(transformed, { extensions: [gfmToMarkdown()] });
}

/**
 * Recursively replaces every `entryReference` / `assetReference` node in
 * the tree with a standard mdast `link` / `image` node. Other nodes are
 * returned unchanged (children are recursed into so deep references are
 * also transformed).
 *
 * Typed loosely (`unknown`-shaped tree input) because the modeled
 * `MdAstRoot` type doesn't include `link`/`image` as members of every
 * phrasing container — the transformation widens the shape, and the
 * result is cast to upstream `MdastNodes` at the call site.
 */
function transformCustomNodes(
  node: unknown,
  options: MdastToMarkdownOptions | undefined
): unknown {
  if (node === null || typeof node !== 'object' || !('type' in node)) {
    return node;
  }

  const typedNode = node as { type: string; children?: unknown[] };

  if (typedNode.type === 'entryReference') {
    const ref = typedNode as unknown as MdAstEntryReference;
    const url =
      options?.resolveEntry?.({
        collectionId: ref.collectionId,
        entryId: ref.entryId,
      }) ?? `elekio://entry/${ref.collectionId}/${ref.entryId}`;
    const link: Link = {
      type: 'link',
      url,
      title: null,
      children: ref.children.map(
        (child) => transformCustomNodes(child, options) as Link['children'][number]
      ),
    };
    return link;
  }

  if (typedNode.type === 'assetReference') {
    const ref = typedNode as unknown as MdAstAssetReference;
    const url =
      options?.resolveAsset?.({ assetId: ref.assetId }) ??
      `elekio://asset/${ref.assetId}`;
    const image: Image = {
      type: 'image',
      url,
      title: ref.title,
      alt: ref.alt,
    };
    return image;
  }

  if (Array.isArray(typedNode.children)) {
    return {
      ...typedNode,
      children: typedNode.children.map((child) =>
        transformCustomNodes(child, options)
      ),
    };
  }

  return typedNode;
}
