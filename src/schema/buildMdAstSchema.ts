/**
 * Per-field mdast schema construction.
 *
 * `buildMdAstSchemaForFeatures` narrows the fully-permissive mdast tree
 * schema (from `valueSchema.ts`) to only those node types enabled by a
 * field's `features` config. The resulting schema:
 *   - rejects nodes whose `type` isn't in the allowed set
 *   - enforces `ofCollections` structurally on `entryReference` node
 *     `collectionId` claims
 *   - rejects `headings` of depths outside the configured set
 *   - enforces block-count `min`/`max` on the root's children array
 *   - accepts `null` when the field is not required (matching the existing
 *     pattern for text/number/boolean fields at
 *     `schemaFromFieldDefinition.ts:118-122`)
 *
 * Reference-existence and `ofAssetMimeTypes` checks are NOT done here -
 * those live in `EntryService.validateValueReferences` because they
 * require IO (read the target asset/entry file).
 */

import { z } from '@hono/zod-openapi';
import { uuidSchema, type Uuid } from './baseSchema.js';
import {
  mdAstAssetReferenceSchema,
  mdAstBreakSchema,
  mdAstCodeSchema,
  mdAstFootnoteReferenceSchema,
  mdAstHtmlSchema,
  mdAstImageSchema,
  mdAstInlineCodeSchema,
  mdAstTableCellSchema,
  mdAstTableRowSchema,
  mdAstTableSchema,
  mdAstTextSchema,
  mdAstThematicBreakSchema,
  isEmptyParagraphOnly,
  type MdAstBlockNode,
  type MdAstPhrasingNode,
  type MdAstRoot,
} from './valueSchema.js';

/**
 * Maximum nesting depth (1-based: root = 1) tolerated in a stored tree.
 * Mirrors `markdown-it`'s `maxNesting` default of 100 - the most widely
 * deployed Markdown parser's ceiling. Generous enough that no real
 * document hits it; tight enough to stop adversarially deep trees from
 * exhausting renderer stacks.
 */
export const MAX_MDAST_DEPTH = 100;

/**
 * Returns true when any node in `root` sits at depth > `maxDepth`.
 * Depth is 1-based: root = 1, its children = 2, etc. Walks the tree
 * once, bailing on the first overshoot.
 */
function exceedsMaxDepth(root: unknown, maxDepth: number): boolean {
  function walk(node: unknown, depth: number): boolean {
    if (depth > maxDepth) return true;
    if (typeof node !== 'object' || node === null) return false;
    const children = (node as { children?: unknown }).children;
    if (!Array.isArray(children)) return false;
    for (const child of children) {
      if (walk(child, depth + 1)) return true;
    }
    return false;
  }
  return walk(root, 1);
}

/**
 * Heading depth - one of 1..6. Empty array on the field config disables
 * headings entirely.
 */
export const markdownHeadingDepthSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type MarkdownHeadingDepth = z.infer<typeof markdownHeadingDepthSchema>;

/**
 * Feature allowlist for a markdown field. Every key is required at the
 * schema level - no defaults; field-definition authors must commit to a
 * config explicitly. Desktop's UI defaults all toggles off; that's a UX
 * concern, not a schema concern.
 *
 * `paragraph` and `text` are intentionally NOT togglable - they're the
 * floor that any non-empty tree needs.
 */
export const markdownFeaturesSchema = z.object({
  // Block (8 booleans + 1 array)
  /** Allowed heading depths. `[]` disables headings entirely. */
  headings: z.array(markdownHeadingDepthSchema),
  blockquotes: z.boolean(),
  lists: z.boolean(),
  codeBlocks: z.boolean(),
  thematicBreak: z.boolean(),
  /**
   * Raw HTML node (mdast `html`). Same flag covers both block and inline
   * contexts. SECURITY: enabling this allows authors to embed arbitrary
   * HTML - including scripts. Consumer renderers MUST sanitize the output
   * (e.g. DOMPurify). Core does not sanitize. See docs/markdown-content.md.
   */
  rawHtml: z.boolean(),
  tables: z.boolean(),
  /** Requires `lists === true` (enforced via field-level refinement). */
  taskListItems: z.boolean(),
  footnotes: z.boolean(),
  // Inline (9)
  emphasis: z.boolean(),
  strong: z.boolean(),
  inlineCode: z.boolean(),
  /**
   * mdast `link` with absolute http(s)/mailto URL. Covers `[text](url)`
   * and CommonMark autolinks `<url>` (which parse to `link` nodes). GFM
   * `autolinkLiteral` (bare URLs in body text) is excluded entirely.
   */
  externalLinks: z.boolean(),
  /** Custom `entryReference` node (typed reference to another Entry). */
  entryReferences: z.boolean(),
  /** mdast `image` with absolute http(s) URL. */
  externalImages: z.boolean(),
  /** Custom `assetReference` node (typed reference to an Asset). */
  assetReferences: z.boolean(),
  strikethrough: z.boolean(),
  hardLineBreaks: z.boolean(),
});
export type MarkdownFeatures = z.infer<typeof markdownFeaturesSchema>;

/**
 * Context needed to build a per-field schema. The caller (typically
 * `markdownFieldDefinitionSchema` in fieldSchema.ts, or the per-field
 * branch in schemaFromFieldDefinition.ts) extracts these from the full
 * field definition.
 *
 * Passing the pieces individually (rather than the whole field def) keeps
 * this module from depending on `MarkdownFieldDefinition`, breaking what
 * would otherwise be a circular import with `fieldSchema.ts`.
 */
export interface BuildMdAstSchemaContext {
  features: MarkdownFeatures;
  ofCollections: Uuid[];
  /** `null` means "no explicit minimum". */
  min: number | null;
  /** `null` means "no explicit maximum". */
  max: number | null;
  isRequired: boolean;
}

/**
 * Builds a Zod schema that validates an `MdAstRoot | null` against the
 * given features and ofCollections.
 *
 * Behaviour:
 *   - `null` accepted when `isRequired === false`; rejected when `true`.
 *   - Tree shape: only allowed node types per the features map.
 *   - Block count: at least `effectiveMin` and at most `max ?? Infinity`,
 *     where `effectiveMin = min ?? (isRequired ? 1 : 0)` - mirrors
 *     `.min(1)` for required strings.
 *   - Empty-paragraph-only trees are rejected (Desktop normalizes to
 *     null).
 *   - `entryReference.collectionId` must be in `ofCollections` when that
 *     array is non-empty.
 */
export function buildMdAstSchemaForFeatures(
  ctx: BuildMdAstSchemaContext
): z.ZodType<MdAstRoot | null> {
  const { features, ofCollections, min, max, isRequired } = ctx;

  // Effective min block count: explicit `min`, otherwise 1 if required, else 0.
  const effectiveMin = min ?? (isRequired ? 1 : 0);
  const effectiveMax = max ?? undefined;

  //
  // Build phrasing union
  //
  const phrasingMembers: z.ZodTypeAny[] = [mdAstTextSchema];

  if (features.inlineCode) {
    phrasingMembers.push(mdAstInlineCodeSchema);
  }
  if (features.hardLineBreaks) {
    phrasingMembers.push(mdAstBreakSchema);
  }
  if (features.rawHtml) {
    phrasingMembers.push(mdAstHtmlSchema);
  }
  if (features.externalImages) {
    phrasingMembers.push(mdAstImageSchema);
  }
  if (features.footnotes) {
    phrasingMembers.push(mdAstFootnoteReferenceSchema);
  }
  if (features.assetReferences) {
    phrasingMembers.push(mdAstAssetReferenceSchema);
  }

  // Recursive phrasing members - types annotated to break the cycle.
  if (features.emphasis) {
    const mdAstEmphasisFieldSchema: z.ZodType<{
      type: 'emphasis';
      children: MdAstPhrasingNode[];
    }> = z.object({
      type: z.literal('emphasis'),
      get children() {
        return z.array(phrasingNodeSchema);
      },
    });
    phrasingMembers.push(mdAstEmphasisFieldSchema);
  }
  if (features.strong) {
    const mdAstStrongFieldSchema: z.ZodType<{
      type: 'strong';
      children: MdAstPhrasingNode[];
    }> = z.object({
      type: z.literal('strong'),
      get children() {
        return z.array(phrasingNodeSchema);
      },
    });
    phrasingMembers.push(mdAstStrongFieldSchema);
  }
  if (features.strikethrough) {
    const mdAstDeleteFieldSchema: z.ZodType<{
      type: 'delete';
      children: MdAstPhrasingNode[];
    }> = z.object({
      type: z.literal('delete'),
      get children() {
        return z.array(phrasingNodeSchema);
      },
    });
    phrasingMembers.push(mdAstDeleteFieldSchema);
  }
  if (features.externalLinks) {
    const mdAstLinkFieldSchema: z.ZodType<{
      type: 'link';
      url: string;
      title: string | null;
      children: MdAstPhrasingNode[];
    }> = z.object({
      type: z.literal('link'),
      url: z.string(),
      title: z.string().nullable(),
      get children() {
        return z.array(phrasingNodeSchema);
      },
    });
    phrasingMembers.push(mdAstLinkFieldSchema);
  }
  if (features.entryReferences) {
    // Carries the structural ofCollections check - refine when configured.
    const entryReferenceBase = z.object({
      type: z.literal('entryReference'),
      collectionId: uuidSchema,
      entryId: uuidSchema,
      get children() {
        return z.array(phrasingNodeSchema);
      },
    });

    const mdAstEntryReferenceFieldSchema: z.ZodType<{
      type: 'entryReference';
      collectionId: Uuid;
      entryId: Uuid;
      children: MdAstPhrasingNode[];
    }> =
      ofCollections.length > 0
        ? entryReferenceBase.refine(
            (node) => ofCollections.includes(node.collectionId),
            {
              message:
                'Referenced Entry must belong to one of the allowed Collections',
              path: ['collectionId'],
            }
          )
        : entryReferenceBase;

    phrasingMembers.push(mdAstEntryReferenceFieldSchema);
  }

  // Union helper handling the union-with-1-member edge case.
  function makeUnion<T>(members: z.ZodTypeAny[]): z.ZodType<T> {
    if (members.length === 0) {
      throw new Error('Cannot build union with zero members');
    }
    if (members.length === 1) {
      return members[0] as z.ZodType<T>;
    }
    return z.union(
      members as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
    ) as z.ZodType<T>;
  }

  const phrasingNodeSchema: z.ZodType<MdAstPhrasingNode> =
    makeUnion<MdAstPhrasingNode>(phrasingMembers);

  //
  // Build block union
  //
  const blockMembers: z.ZodTypeAny[] = [
    // Paragraph is always allowed (the block-level floor).
    z.object({
      type: z.literal('paragraph'),
      children: z.array(phrasingNodeSchema),
    }),
  ];

  if (features.headings.length > 0) {
    const allowedHeadingDepths = features.headings;
    const depthSchema =
      allowedHeadingDepths.length === 1
        ? z.literal(allowedHeadingDepths[0]!)
        : z.union(
            allowedHeadingDepths.map((d) => z.literal(d)) as [
              z.ZodLiteral<MarkdownHeadingDepth>,
              z.ZodLiteral<MarkdownHeadingDepth>,
              ...z.ZodLiteral<MarkdownHeadingDepth>[],
            ]
          );

    blockMembers.push(
      z.object({
        type: z.literal('heading'),
        depth: depthSchema,
        children: z.array(phrasingNodeSchema),
      })
    );
  }

  if (features.blockquotes) {
    const blockquoteFieldSchema: z.ZodType<{
      type: 'blockquote';
      children: MdAstBlockNode[];
    }> = z.object({
      type: z.literal('blockquote'),
      get children() {
        return z.array(blockNodeSchema);
      },
    });
    blockMembers.push(blockquoteFieldSchema);
  }

  if (features.lists) {
    // listItem can carry a `checked` boolean when taskListItems is enabled.
    // We don't structurally couple them - features.taskListItems false +
    // listItem.checked = boolean would still pass the tree shape. The
    // field-definition-level refinement `taskListItems requires lists`
    // (in fieldSchema.ts) catches the inverse (taskListItems without
    // lists), which is the real misconfiguration.
    const listItemFieldSchema: z.ZodType<{
      type: 'listItem';
      spread: boolean | null;
      checked: boolean | null;
      children: MdAstBlockNode[];
    }> = z.object({
      type: z.literal('listItem'),
      spread: z.boolean().nullable(),
      // `checked` is non-null only when this is a task list item.
      // When taskListItems is disabled, it should be null.
      checked: features.taskListItems
        ? z.boolean().nullable()
        : z.literal(null),
      get children() {
        return z.array(blockNodeSchema);
      },
    });

    blockMembers.push(
      z.object({
        type: z.literal('list'),
        ordered: z.boolean(),
        start: z.number().int().nullable(),
        spread: z.boolean().nullable(),
        children: z.array(listItemFieldSchema),
      })
    );
  }

  if (features.codeBlocks) {
    blockMembers.push(mdAstCodeSchema);
  }
  if (features.thematicBreak) {
    blockMembers.push(mdAstThematicBreakSchema);
  }
  if (features.rawHtml) {
    blockMembers.push(mdAstHtmlSchema);
  }
  if (features.tables) {
    // Tables compose tableRow/tableCell; cells use the per-field phrasing
    // union (so e.g. emphasis inside cells only works when emphasis is
    // enabled). The base mdAstTableSchema uses the permissive phrasing -
    // not what we want here. Rebuild with the narrowed phrasing.
    const tableCellFieldSchema = z.object({
      type: z.literal('tableCell'),
      children: z.array(phrasingNodeSchema),
    });
    const tableRowFieldSchema = z.object({
      type: z.literal('tableRow'),
      children: z.array(tableCellFieldSchema),
    });
    blockMembers.push(
      z.object({
        type: z.literal('table'),
        align: z.array(
          z.union([
            z.literal('left'),
            z.literal('right'),
            z.literal('center'),
            z.null(),
          ])
        ),
        children: z.array(tableRowFieldSchema),
      })
    );
    // Suppress unused-binding warning - the schemas are used inline.
    void [tableCellFieldSchema, tableRowFieldSchema];
  }
  if (features.footnotes) {
    const footnoteDefinitionFieldSchema: z.ZodType<{
      type: 'footnoteDefinition';
      identifier: string;
      label: string | null;
      children: MdAstBlockNode[];
    }> = z.object({
      type: z.literal('footnoteDefinition'),
      identifier: z.string(),
      label: z.string().nullable(),
      get children() {
        return z.array(blockNodeSchema);
      },
    });
    blockMembers.push(footnoteDefinitionFieldSchema);
  }

  const blockNodeSchema: z.ZodType<MdAstBlockNode> =
    makeUnion<MdAstBlockNode>(blockMembers);

  // Note: we intentionally use a generic ref-typed mdAstTableSchema /
  // tableRow / tableCell suppression by NOT including the permissive
  // versions - only the rebuilt narrowed versions appear above.
  void [mdAstTableSchema, mdAstTableRowSchema, mdAstTableCellSchema];

  //
  // Root schema with block-count enforcement + empty-paragraph rejection.
  //
  let childrenSchema = z.array(blockNodeSchema).min(effectiveMin);
  if (effectiveMax !== undefined) {
    childrenSchema = childrenSchema.max(effectiveMax);
  }

  const rootSchema = z
    .object({
      type: z.literal('root'),
      children: childrenSchema,
    })
    .refine((root) => !isEmptyParagraphOnly(root), {
      message:
        'Empty markdown values must be serialised as null per language, not as a tree containing only an empty paragraph',
      path: ['children'],
    })
    .refine((root) => !exceedsMaxDepth(root, MAX_MDAST_DEPTH), {
      message: `Markdown tree exceeds maximum nesting depth of ${MAX_MDAST_DEPTH}`,
      path: ['children'],
    });

  return isRequired ? rootSchema : rootSchema.nullable();
}
