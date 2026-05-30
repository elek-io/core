import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  uuidSchema,
  partialTranslatableRecordOf,
  type Uuid,
} from './baseSchema.js';

export const valueTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'reference',
  'component',
  'mdast',
]);
export type ValueType = z.infer<typeof valueTypeSchema>;

export const valueContentReferenceBase = z.object({
  id: uuidSchema,
});

export const valueContentReferenceToAssetSchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.enum.asset),
  });
export type ValueContentReferenceToAsset = z.infer<
  typeof valueContentReferenceToAssetSchema
>;

export const valueContentReferenceToCollectionSchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.enum.collection),
  });
export type ValueContentReferenceToCollection = z.infer<
  typeof valueContentReferenceToCollectionSchema
>;

export const valueContentReferenceToEntrySchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.enum.entry),
    collectionId: uuidSchema,
  });
export type ValueContentReferenceToEntry = z.infer<
  typeof valueContentReferenceToEntrySchema
>;

export const valueContentReferenceSchema = z.union([
  valueContentReferenceToAssetSchema,
  valueContentReferenceToCollectionSchema,
  valueContentReferenceToEntrySchema,
]);
export type ValueContentReference = z.infer<typeof valueContentReferenceSchema>;

export const directValueBaseSchema = z.object({
  objectType: z.literal(objectTypeSchema.enum.value).readonly(),
});

export const directStringValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.string).readonly(),
  content: partialTranslatableRecordOf(z.string().trim().min(1).nullable()),
});
export type DirectStringValue = z.infer<typeof directStringValueSchema>;

export const directNumberValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.number).readonly(),
  content: partialTranslatableRecordOf(z.number().nullable()),
});
export type DirectNumberValue = z.infer<typeof directNumberValueSchema>;

export const directBooleanValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.boolean).readonly(),
  // A boolean Value is never nullable, since it's always either true or false
  content: partialTranslatableRecordOf(z.boolean()),
});
export type DirectBooleanValue = z.infer<typeof directBooleanValueSchema>;

export const directValueSchema = z.union([
  directStringValueSchema,
  directNumberValueSchema,
  directBooleanValueSchema,
]);
export type DirectValue = z.infer<typeof directValueSchema>;

export const referencedValueSchema = z.object({
  objectType: z.literal(objectTypeSchema.enum.value).readonly(),
  valueType: z.literal(valueTypeSchema.enum.reference).readonly(),
  content: partialTranslatableRecordOf(z.array(valueContentReferenceSchema)),
});
export type ReferencedValue = z.infer<typeof referencedValueSchema>;

export const componentItemSchema = z.object({
  id: uuidSchema.readonly(),
  componentId: uuidSchema,
  get values() {
    return z.record(slugSchema, valueSchema);
  },
});
export type ComponentItem = z.infer<typeof componentItemSchema>;

export const componentValueSchema = z.object({
  objectType: z.literal(objectTypeSchema.enum.value).readonly(),
  valueType: z.literal(valueTypeSchema.enum.component).readonly(),
  content: z.array(componentItemSchema),
});
export type ComponentValue = z.infer<typeof componentValueSchema>;

//
// Mdast (Markdown AST) node schemas
//
// Mdast is the structured representation of body content produced by a
// `markdown` field. On disk, an MdAstValue's content is a tree of typed
// nodes - not a markdown source string. References to Assets and Entries
// are first-class typed nodes (entryReference / assetReference).
//
// These are the fully-permissive schemas: every modelled node type is
// accepted. Per-field narrowing (based on the field's `features` config)
// happens via `buildMdAstSchemaForField` in `./buildMdAstSchema.ts`. The
// permissive version here is what a raw entry JSON conforms to when
// loaded without a field-definition context.
//
// `position` info (start/end source coordinates emitted by markdown
// parsers) is intentionally NOT part of any node schema. The mdast spec
// emits it on every node when parsing from a source string; Core's
// canonical form omits it. Zod strips unknown keys on parse, so position
// info from any parser-produced tree is dropped at validation time.
//
// Recursive types use the Zod 4 pattern: explicit interfaces for nodes
// whose `children` reference a union, and `z.ZodType<T>` annotations on
// the recursive schemas. Non-recursive members use plain `z.infer`.
//

//
// Non-recursive phrasing (inline) nodes
//

export const mdAstTextSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
});
export type MdAstText = z.infer<typeof mdAstTextSchema>;

export const mdAstInlineCodeSchema = z.object({
  type: z.literal('inlineCode'),
  value: z.string(),
});
export type MdAstInlineCode = z.infer<typeof mdAstInlineCodeSchema>;

export const mdAstBreakSchema = z.object({
  type: z.literal('break'),
});
export type MdAstBreak = z.infer<typeof mdAstBreakSchema>;

/**
 * Inline raw HTML node. Same `type: 'html'` value as block HTML - the mdast
 * spec uses a single node type for both contexts.
 */
export const mdAstHtmlSchema = z.object({
  type: z.literal('html'),
  value: z.string(),
});
export type MdAstHtml = z.infer<typeof mdAstHtmlSchema>;

/**
 * External image URL. Internal assets use `assetReference` instead — the
 * `image` node is for external sources only. Allows `http`/`https`; rejects
 * relative paths (use the asset library), `data:` URIs (payload bloat, SVG
 * XSS), and exotic schemes.
 */
export const mdAstImageUrlSchema = z.url({ protocol: /^https?$/ });

export const mdAstImageSchema = z.object({
  type: z.literal('image'),
  url: mdAstImageUrlSchema,
  title: z.string().nullable(),
  alt: z.string(),
});
export type MdAstImage = z.infer<typeof mdAstImageSchema>;

export const mdAstFootnoteReferenceSchema = z.object({
  type: z.literal('footnoteReference'),
  identifier: z.string(),
  label: z.string().nullable(),
});
export type MdAstFootnoteReference = z.infer<
  typeof mdAstFootnoteReferenceSchema
>;

/**
 * Custom node: typed reference to an Asset stored in the same Project.
 * Mirrors `valueContentReferenceToAssetSchema` - assets live at a flat
 * path so `assetId` alone is enough for resolution.
 */
export const mdAstAssetReferenceSchema = z.object({
  type: z.literal('assetReference'),
  assetId: uuidSchema,
  alt: z.string(),
  title: z.string().nullable(),
});
export type MdAstAssetReference = z.infer<typeof mdAstAssetReferenceSchema>;

//
// Recursive phrasing nodes - types declared explicitly so the schemas can
// reference the union via `z.ZodType<T>` without TS hitting circularity.
//

export interface MdAstEmphasis {
  type: 'emphasis';
  children: MdAstPhrasingNode[];
}
export interface MdAstStrong {
  type: 'strong';
  children: MdAstPhrasingNode[];
}
export interface MdAstDelete {
  type: 'delete';
  children: MdAstPhrasingNode[];
}
export interface MdAstLink {
  type: 'link';
  url: string;
  title: string | null;
  children: MdAstPhrasingNode[];
}
/**
 * Custom node: typed reference to an Entry stored in the same Project.
 * Carries both `collectionId` and `entryId` - Core's filesystem layout
 * (`projects/<pid>/collections/<cid>/entries/<eid>/…`) requires both for
 * path resolution, and the schema-level `ofCollections` constraint check
 * (in `buildMdAstSchemaForField`) uses `collectionId` directly.
 */
export interface MdAstEntryReference {
  type: 'entryReference';
  collectionId: Uuid;
  entryId: Uuid;
  children: MdAstPhrasingNode[];
}

export type MdAstPhrasingNode =
  | MdAstText
  | MdAstInlineCode
  | MdAstBreak
  | MdAstHtml
  | MdAstImage
  | MdAstFootnoteReference
  | MdAstAssetReference
  | MdAstEmphasis
  | MdAstStrong
  | MdAstDelete
  | MdAstLink
  | MdAstEntryReference;

export const mdAstEmphasisSchema: z.ZodType<MdAstEmphasis> = z.object({
  type: z.literal('emphasis'),
  get children() {
    return z.array(mdAstPhrasingNodeSchema);
  },
});

export const mdAstStrongSchema: z.ZodType<MdAstStrong> = z.object({
  type: z.literal('strong'),
  get children() {
    return z.array(mdAstPhrasingNodeSchema);
  },
});

export const mdAstDeleteSchema: z.ZodType<MdAstDelete> = z.object({
  type: z.literal('delete'),
  get children() {
    return z.array(mdAstPhrasingNodeSchema);
  },
});

/**
 * External link URL. Internal entries use `entryReference` instead — the
 * `link` node is for external destinations only. Accepts:
 *  - `http`/`https` absolute URLs
 *  - `mailto:` and `tel:` for contact links
 *  - site-relative (`/path`), sibling/parent-relative (`./`, `../`), and
 *    fragment-only (`#section`) URLs
 *
 * Rejects exotic schemes (`javascript:`, `data:`, `file:`, `vbscript:`) and
 * protocol-relative URLs (`//host`, which inherit the page's scheme and
 * make a malicious target indistinguishable from a benign one).
 */
export const mdAstLinkUrlSchema = z.union([
  z.url({ protocol: /^(https?|mailto|tel)$/ }),
  z.string().regex(/^\/(?!\/)|^\.\.?\/|^#/),
]);

export const mdAstLinkSchema: z.ZodType<MdAstLink> = z.object({
  type: z.literal('link'),
  url: mdAstLinkUrlSchema,
  title: z.string().nullable(),
  get children() {
    return z.array(mdAstPhrasingNodeSchema);
  },
});

export const mdAstEntryReferenceSchema: z.ZodType<MdAstEntryReference> =
  z.object({
    type: z.literal('entryReference'),
    collectionId: uuidSchema,
    entryId: uuidSchema,
    get children() {
      return z.array(mdAstPhrasingNodeSchema);
    },
  });

/**
 * Union of all phrasing (inline) node types.
 *
 * Uses `z.union` (not `z.discriminatedUnion`) because the recursive members
 * are annotated with `z.ZodType<T>`, which hides the literal discriminator
 * field from `z.discriminatedUnion`'s type-level check. Runtime cost is
 * negligible for a 12-member union.
 */
export const mdAstPhrasingNodeSchema: z.ZodType<MdAstPhrasingNode> = z.union([
  mdAstTextSchema,
  mdAstInlineCodeSchema,
  mdAstBreakSchema,
  mdAstHtmlSchema,
  mdAstImageSchema,
  mdAstFootnoteReferenceSchema,
  mdAstAssetReferenceSchema,
  mdAstEmphasisSchema,
  mdAstStrongSchema,
  mdAstDeleteSchema,
  mdAstLinkSchema,
  mdAstEntryReferenceSchema,
]);

//
// Non-recursive block nodes
//

export const mdAstThematicBreakSchema = z.object({
  type: z.literal('thematicBreak'),
});
export type MdAstThematicBreak = z.infer<typeof mdAstThematicBreakSchema>;

export const mdAstCodeSchema = z.object({
  type: z.literal('code'),
  lang: z.string().nullable(),
  meta: z.string().nullable(),
  value: z.string(),
});
export type MdAstCode = z.infer<typeof mdAstCodeSchema>;

export const mdAstParagraphSchema = z.object({
  type: z.literal('paragraph'),
  children: z.array(mdAstPhrasingNodeSchema),
});
export type MdAstParagraph = z.infer<typeof mdAstParagraphSchema>;

export const mdAstHeadingSchema = z.object({
  type: z.literal('heading'),
  depth: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  children: z.array(mdAstPhrasingNodeSchema),
});
export type MdAstHeading = z.infer<typeof mdAstHeadingSchema>;

export const mdAstTableCellSchema = z.object({
  type: z.literal('tableCell'),
  children: z.array(mdAstPhrasingNodeSchema),
});
export type MdAstTableCell = z.infer<typeof mdAstTableCellSchema>;

export const mdAstTableRowSchema = z.object({
  type: z.literal('tableRow'),
  children: z.array(mdAstTableCellSchema),
});
export type MdAstTableRow = z.infer<typeof mdAstTableRowSchema>;

export const mdAstTableSchema = z.object({
  type: z.literal('table'),
  align: z.array(
    z.union([
      z.literal('left'),
      z.literal('right'),
      z.literal('center'),
      z.null(),
    ])
  ),
  children: z.array(mdAstTableRowSchema),
});
export type MdAstTable = z.infer<typeof mdAstTableSchema>;

//
// Recursive block nodes - same pattern as recursive phrasing.
//

export interface MdAstBlockquote {
  type: 'blockquote';
  children: MdAstBlockNode[];
}
export interface MdAstListItem {
  type: 'listItem';
  spread: boolean | null;
  checked: boolean | null;
  children: MdAstBlockNode[];
}
export interface MdAstFootnoteDefinition {
  type: 'footnoteDefinition';
  identifier: string;
  label: string | null;
  children: MdAstBlockNode[];
}

export interface MdAstList {
  type: 'list';
  ordered: boolean;
  start: number | null;
  spread: boolean | null;
  children: MdAstListItem[];
}

export type MdAstBlockNode =
  | MdAstParagraph
  | MdAstHeading
  | MdAstBlockquote
  | MdAstList
  | MdAstCode
  | MdAstThematicBreak
  | MdAstHtml
  | MdAstTable
  | MdAstFootnoteDefinition;

export const mdAstBlockquoteSchema: z.ZodType<MdAstBlockquote> = z.object({
  type: z.literal('blockquote'),
  get children() {
    return z.array(mdAstBlockNodeSchema);
  },
});

export const mdAstListItemSchema: z.ZodType<MdAstListItem> = z.object({
  type: z.literal('listItem'),
  spread: z.boolean().nullable(),
  checked: z.boolean().nullable(),
  get children() {
    return z.array(mdAstBlockNodeSchema);
  },
});

export const mdAstListSchema: z.ZodType<MdAstList> = z.object({
  type: z.literal('list'),
  ordered: z.boolean(),
  start: z.number().int().nullable(),
  spread: z.boolean().nullable(),
  children: z.array(mdAstListItemSchema),
});

export const mdAstFootnoteDefinitionSchema: z.ZodType<MdAstFootnoteDefinition> =
  z.object({
    type: z.literal('footnoteDefinition'),
    identifier: z.string(),
    label: z.string().nullable(),
    get children() {
      return z.array(mdAstBlockNodeSchema);
    },
  });

/**
 * Union of all block-level node types. Same `mdAstHtmlSchema` appears in
 * both block and phrasing unions - the mdast spec uses a single `html`
 * node type for both contexts.
 */
export const mdAstBlockNodeSchema: z.ZodType<MdAstBlockNode> = z.union([
  mdAstParagraphSchema,
  mdAstHeadingSchema,
  mdAstBlockquoteSchema,
  mdAstListSchema,
  mdAstCodeSchema,
  mdAstThematicBreakSchema,
  mdAstHtmlSchema,
  mdAstTableSchema,
  mdAstFootnoteDefinitionSchema,
]);

/**
 * Returns true if the tree contains exactly one child that is an empty
 * paragraph (`{ type: 'paragraph', children: [] }`). This is Milkdown /
 * ProseMirror's natural "user opened the editor and typed nothing" state.
 *
 * Used by the schema-level refinement to reject this shape - empty
 * markdown values must be serialised as `null` per language, not as a
 * tree containing only an empty paragraph. Desktop is responsible for
 * normalising effectively-empty editor state to `null` before saving.
 */
export function isEmptyParagraphOnly(root: {
  children: MdAstBlockNode[];
}): boolean {
  if (root.children.length !== 1) {
    return false;
  }
  const child = root.children[0];
  if (child === undefined || child.type !== 'paragraph') {
    return false;
  }
  return child.children.length === 0;
}

/**
 * Markdown abstract syntax tree (mdast) - structured representation of body content.
 *
 * Recommended for rendering: walk the tree via `node.type` and emit per-node
 * components/HTML. Gives full control over how entryReference / assetReference
 * nodes render (resolve to your URL structure of choice).
 *
 * See docs/markdown-content.md for rendering patterns and security notes
 * (especially around `rawHtml`-enabled fields).
 */
export const mdAstRootSchema = z
  .object({
    type: z.literal('root'),
    children: z.array(mdAstBlockNodeSchema),
  })
  .refine((root) => root.children.length >= 1, {
    message:
      'Empty markdown values must be serialised as null per language, not as an empty tree',
    path: ['children'],
  })
  .refine((root) => !isEmptyParagraphOnly(root), {
    message:
      'Empty markdown values must be serialised as null per language, not as a tree containing only an empty paragraph',
    path: ['children'],
  });
export type MdAstRoot = z.infer<typeof mdAstRootSchema>;

//
// MdAst Value
//

export const mdastValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.mdast).readonly(),
  content: partialTranslatableRecordOf(mdAstRootSchema.nullable()),
});
export type MdAstValue = z.infer<typeof mdastValueSchema>;

export const valueSchema = z.union([
  directValueSchema,
  referencedValueSchema,
  componentValueSchema,
  mdastValueSchema,
]);
export type Value = z.infer<typeof valueSchema>;
