/**
 * Compile-time drift detection between Core's MdAst* types and the upstream
 * mdast spec types from `@types/mdast`.
 *
 * The check is one-directional assignability, so an assertion fails when
 * Core's type stops being assignable to upstream's: a required scalar field
 * added, one Core widened narrowed again, or a rename to a required name. An
 * upstream widening passes, and so do an added optional field, a removed
 * field, a rename to an optional name and a change in a children shape.
 *
 * @see ../../contributing/markdown-internals.md
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
 * Catches drift in scalar fields and `type` literals. `position` and `data`
 * are excluded because Core's recursive types omit them on every node, and
 * `children` because a deep comparison through them would be fragile.
 *
 * @see ../../contributing/markdown-internals.md
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
