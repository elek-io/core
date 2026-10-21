---
'@elek-io/core': patch
---

**Astro's default renderers render every field their node carries.** Four defaults in `@elek-io/core/astro` dropped part of the node they were given, so a consumer who supplied only the three required handlers got markup the markdown does not say. Their output changes with no change to your code, so look at your CSS where you style these:

- **`list`** writes `<ol start="5">` for a list authored as "5.". Nothing is written for a list that starts at 1 or carries no start, and a list starting at 0 keeps `start="0"`.
- **`listItem`** renders `<input type="checkbox" checked disabled>` ahead of a task item's text, for a checked and an unchecked item alike. An item whose `checked` is null renders as before. No class name is added, so such an item keeps its list marker beside the box.
- **`footnoteReference`** carries `id="fnref-<identifier>"`, which is what the way back below points at.
- **`footnoteDefinition`** ends with `<a href="#fnref-<identifier>" aria-label="Back to content">↩</a>`.

`docs/markdown-content.md` gained two sections: the six fields a default still drops and what to override for each, and the three placements a handler cannot reach plus the one thing an override cannot fix either.
