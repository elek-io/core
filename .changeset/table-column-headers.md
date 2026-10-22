---
'@elek-io/core': minor
---

**A rendered table has column headers.** Core's renderers emitted every cell of a table as `<td>` in one flat `<table>`, so a screen reader announced no column headers and the table failed WCAG 1.3.1 Info and relationships at level A. Nothing could be done about it from the outside either: `table.align` reached the `table` handler, and the cell that had to apply it was given only its own node and its rendered children.

**The output changes for every consumer who never touched a renderer**, which is the point of the fix. The defaults of `@elek-io/core/astro` now emit:

- The first row's cells as `<th scope="col">` inside `<thead>`, and every row below as `<td>` inside `<tbody>`. Neither wrapper is emitted empty, so a table of one row is a header with no body and a table of no rows is an empty `<table>`.
- A column's alignment as `style="text-align:left|center|right"` on every cell of that column, header and body alike. A column the markdown left unaligned gets no style at all, so its cells keep the start edge of the reading direction.

There is no migration step, because what changed is the markup. CSS that reached a table's header cells through `tr td` selects `thead th` now.

**Every renderer is handed a third argument**, `MdastNodeContext`, holding `index` and `ancestors` with the root first and the direct parent last. It is what a handler cannot read off its own node. A handler that does not need it declares fewer parameters, so every renderers object that compiles today keeps compiling.

**New exports** `MdastNodeContext`, and `isTableHeaderCell` and `tableCellAlign`, which answer a table cell's two questions from its context so an override of `tableCell` does not have to reimplement the default. `MdAstTableAlign` and `mdAstTableAlignSchema` name a column's alignment.

A table still has no `<caption>`, because mdast has no caption node for Core to render one from. A page that puts a wide table into a horizontally scrolling box has to name that region itself. See `docs/markdown-content.md`.
