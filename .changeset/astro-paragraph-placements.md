---
'@elek-io/core': minor
---

**A tight list, a checklist and a footnote land where the markdown puts them.** Three placements were out of reach of the handler that was given them, because a parent in `@elek-io/core/astro` is handed its children already rendered. A tight item kept the `<p>` around its text, a task item's checkbox sat before that text instead of opening it, and a footnote's way back followed the note instead of ending its last paragraph. The `paragraph` default makes all three now, because its context names the list item or the note it sits in.

**The markup changes for every site that uses the defaults**, which is the point of the fix:

- An item of a tight list renders `<li>text</li>` rather than `<li><p>text</p></li>`. A list is loose when its own `spread` is true, when any item's is, or when an item that carries none holds more than one block, which is how `mdast-util-to-hast` decides it. Every item of a loose list keeps its `<p>`, and a quote in a tight item keeps the one around its own text.
- A task item renders `<li><label><input type="checkbox" checked disabled> text</label></li>`. The box opens the item's text in a tight list and its first `<p>` in a loose one, and the `<label>` around box and text names it, so a screen reader reads that text once instead of once as the box's name and once as the text.
- A footnote's way back ends the note's last paragraph, as `<p>The note. <a href="#fnref-1" aria-label="Back to content">↩</a></p>`.

There is no migration step, because what changed is the markup. Four things to check in your own site:

- CSS that reached a list item's text through `li > p` selects the `li` itself for a tight list now. The box and its text share a line in both a tight and a loose item, so `li > p { display: inline }`, which the docs named for that, is no longer what puts them there.
- An override of `listItem` keeps every checkbox, where it used to drop it. The box sits inside the item's text rather than in the `<li>` your handler writes.
- An override of `paragraph` keeps every checkbox and every way back. The item and the note place them around their blocks then, which is where the defaults put them before.
- An override of `footnoteDefinition` owns the way back alone, so its wording is yours and no paragraph adds a second link. That is how a site in another language replaces "Back to content".

Where no paragraph can take one of the three, the item and the note still place it. An item whose first block is not a paragraph carries its box before that block, named through `aria-label`, and a note whose last block is a list or a code block lets the way back follow its blocks.

**New exports** `isInTightListItem`, `taskItemChecked` and `footnoteWayBackIdentifier`, which answer the three from a node's context the way `isTableHeaderCell` and `tableCellAlign` answer a table cell's two questions, so an override does not have to walk the tree.

`list.spread` and `listItem.spread` leave the fields a default drops, which are three now: `code.lang`, `code.meta` and `footnoteDefinition.label`. See `docs/markdown-content.md`.
