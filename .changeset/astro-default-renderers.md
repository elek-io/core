---
'@elek-io/core': patch
---

**Astro's default renderers render every field their node carries.** Four defaults in `@elek-io/core/astro` dropped part of the node they were given, so a consumer who supplied only the three required handlers got markup the markdown does not say. Their output changes with no change to your code, so look at your CSS where you style these:

- **`list`** writes `<ol start="5">` for a list authored as "5.". Nothing is written for a list that starts at 1 or carries no start, and a list starting at 0 keeps `start="0"`.
- **`listItem`** renders `<input type="checkbox" disabled>` ahead of a task item's text, with `checked` on it only where the item is checked. The box is named through `aria-label` with the text of the item's own blocks, a list directly inside the item left out, so a screen reader meets more than a checked state and that list's items keep their names to themselves. An item carrying no text, or only whitespace, gets no name. An item whose `checked` is null renders as before. No class name is added, so such an item keeps its list marker beside the box, and `li > p { display: inline }` is the CSS that puts box and text on one line.
- **`footnoteReference`** carries `id="fnref-<identifier>"`, which is what the way back below points at.
- **`footnoteDefinition`** ends with `<a href="#fnref-<identifier>" aria-label="Back to content">↩</a>`.

`docs/markdown-content.md` gained two sections: the five fields a default still drops and what to override for each, and where a default cannot reach, which names the placements the defaults leave as they are and what an override or CSS does about them.
