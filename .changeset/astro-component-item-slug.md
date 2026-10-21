---
'@elek-io/core': minor
---

**Component items in Astro name their Component.** A `dynamic` field arrived on `entry.data` as `{ id, componentId, values }`, so `componentId` was the only thing a page could dispatch on. That is a UUID: nothing you want in a template, and a different one after the content is re-created. Every item now carries `componentSlug`, the slug you named the Component, beside the id it already had:

```astro
---
function unhandled(section: never): never {
  throw new Error(`Unhandled Component "${String(section)}"`);
}
---
{
  sections.map((section) => {
    switch (section.componentSlug) {
      case 'hero':
        return <Hero values={section.values} />;
      case 'quote':
        return <Quote values={section.values} />;
      default:
        return unhandled(section);
    }
  })
}
```

The item type is a union discriminated on `componentSlug`, so `values` narrows to the Component of its branch. With that `default` branch, `astro check` then reports a Component the field allows that the dispatch does not handle, and a Component it handles that was renamed. `astro build` writes the types without reading them, so run both. `@elek-io/core/docs/usage.md` shows the dispatch, one component per Component, and what an open `ofComponents` needs instead of an exhaustive one.

`componentId` stays on every item and on every member of the union, so nothing that reads it has to change and it still addresses the Component through Core's own methods, the local API and `elek generate:types`.

Nothing is migrated. The loaders derive what they store from the Project on every sync, so the key appears after the upgrade. Astro builds a collection's schema and types once, when it loads the content config, so restart a running dev server to pick them up.

**Two slugs that derive one name fail the build**, naming both sides and the name they share. Two Components carrying one slug name the `dynamic` field with them, because that is what it discriminates its items on. One of the two was zod's `Duplicate discriminator value` while an Entry was validated, the other was two declarations of one type name in the file you compile, and `hero-1` and `hero1` are enough to reach it. A `dynamic` field with an empty `ofComponents` in a Project that has no Components also emits a well formed item type now, `never`, where it emitted a type alias with no right hand side.

**The loaders raise `CoreError`** while they load content, the way the rest of Core does, rather than a plain `Error`. An item whose Component the Project cannot resolve names the Entry, the field and the Component, and nothing an editor typed.
