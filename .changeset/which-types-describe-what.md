---
'@elek-io/core': patch
---

The documentation now says which of Core's types describe what. Content reaches a consumer typed three ways, through Core's own exported types, through `elek generate:types` and through the Astro loaders, and the docs only ever compared them on one axis: that the generated ones narrow translatable content to a Project's languages while Core's static types do not. That made them read as one artifact in three widths, when two of them describe an Entry as it is stored, envelopes and all, and the third describes the shape the Astro loaders transform it into. `entry.values.title.content.en` and `entry.data.title.en` are not the same type of thing, and nothing said so. `api-clients.md` gains a section comparing all three with the shape each describes and when to reach for it, and the field reference points at it rather than filing the Astro loaders under generated client code.

One pointer was wrong as a result. `generate:types` was described as a way to type content loaded "through the Astro integration", which does not work: an Astro site gets its types from the loaders, for a payload the loaders reshaped first. It now names the local API, an export, Core's own methods and a custom fetch layer instead, and says outright that an Astro site does not need it.

A `dynamic` field is where the two generators diverge most, since both emit a discriminated union but not on the same discriminant. `generate:types` emits an id constant per Component and types the union on `componentId`, so items are dispatched with `case HeroComponentId:`, while the Astro loaders carry a `componentSlug` on every item and dispatch with `case 'hero':`. Both are documented next to each other, so neither reads as an inconsistency.
