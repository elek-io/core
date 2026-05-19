/**
 * Compile-time drift detection between our MdAst* types and the upstream
 * mdast spec types from `@types/mdast`.
 *
 * Purpose: when `@types/mdast` updates, these assertions fail at compile
 * time if upstream:
 *   - adds a new required scalar field to a node type we model
 *   - changes the shape of an existing scalar field (e.g. narrows `depth`)
 *   - renames a field
 *
 * Acceptable false negatives (we don't try to catch these):
 *   - upstream adds an optional field - additive; we can ignore until needed
 *   - upstream removes a field - we may keep it deliberately
 *   - children-shape changes - our recursive types are structurally distinct
 *     from upstream's (we omit `position`/`data` from every node), so a deep
 *     children comparison is fragile. We compare only the non-recursive,
 *     non-metadata fields per node.
 *
 * Why we keep `@types/mdast` as a devDep: this drift check is the sole
 * runtime-zero reason. Our schemas are hand-written for Zod, and inferred
 * types are derived via `z.infer<typeof xSchema>` - not from `@types/mdast`.
 */

import type {
  Blockquote,
  Break,
  Code,
  Delete,
  Emphasis,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  Root,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
  ThematicBreak,
} from 'mdast';

import type {
  MdAstBlockquote,
  MdAstBreak,
  MdAstCode,
  MdAstDelete,
  MdAstEmphasis,
  MdAstFootnoteDefinition,
  MdAstFootnoteReference,
  MdAstHeading,
  MdAstHtml,
  MdAstImage,
  MdAstInlineCode,
  MdAstLink,
  MdAstList,
  MdAstListItem,
  MdAstParagraph,
  MdAstRoot,
  MdAstStrong,
  MdAstTable,
  MdAstTableCell,
  MdAstTableRow,
  MdAstText,
  MdAstThematicBreak,
} from './valueSchema.js';

/**
 * Compares our type against the upstream type with `position`, `data`, and
 * `children` removed. Catches drift in scalar fields and `type` literals.
 */
type MatchesUpstream<Ours, Upstream> =
  Ours extends Omit<Upstream, 'position' | 'data' | 'children'> ? true : false;

// Phrasing - leaves (no children)
const _text: MatchesUpstream<MdAstText, Text> = true;
const _inlineCode: MatchesUpstream<MdAstInlineCode, InlineCode> = true;
const _break: MatchesUpstream<MdAstBreak, Break> = true;
const _html: MatchesUpstream<MdAstHtml, Html> = true;
const _image: MatchesUpstream<MdAstImage, Image> = true;
const _footnoteReference: MatchesUpstream<
  MdAstFootnoteReference,
  FootnoteReference
> = true;

// Phrasing - recursive
const _emphasis: MatchesUpstream<MdAstEmphasis, Emphasis> = true;
const _strong: MatchesUpstream<MdAstStrong, Strong> = true;
const _delete: MatchesUpstream<MdAstDelete, Delete> = true;
const _link: MatchesUpstream<MdAstLink, Link> = true;

// Block - leaves / non-recursive
const _thematicBreak: MatchesUpstream<MdAstThematicBreak, ThematicBreak> = true;
const _code: MatchesUpstream<MdAstCode, Code> = true;
const _paragraph: MatchesUpstream<MdAstParagraph, Paragraph> = true;
const _heading: MatchesUpstream<MdAstHeading, Heading> = true;
const _tableCell: MatchesUpstream<MdAstTableCell, TableCell> = true;
const _tableRow: MatchesUpstream<MdAstTableRow, TableRow> = true;
const _table: MatchesUpstream<MdAstTable, Table> = true;

// Block - recursive
const _blockquote: MatchesUpstream<MdAstBlockquote, Blockquote> = true;
const _list: MatchesUpstream<MdAstList, List> = true;
const _listItem: MatchesUpstream<MdAstListItem, ListItem> = true;
const _footnoteDefinition: MatchesUpstream<
  MdAstFootnoteDefinition,
  FootnoteDefinition
> = true;

// Root
const _root: MatchesUpstream<MdAstRoot, Root> = true;

// Mark all constants as intentionally unused (linter / tsc noUnusedLocals).
// The drift check is the type-level assertion on the right-hand side.
void [
  _text,
  _inlineCode,
  _break,
  _html,
  _image,
  _footnoteReference,
  _emphasis,
  _strong,
  _delete,
  _link,
  _thematicBreak,
  _code,
  _paragraph,
  _heading,
  _tableCell,
  _tableRow,
  _table,
  _blockquote,
  _list,
  _listItem,
  _footnoteDefinition,
  _root,
];
