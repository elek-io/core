---
'@elek-io/core': minor
---

Component items in Astro now name their Component. A `dynamic` field arrived on `entry.data` as `{ id, componentId, values }`, which is enough while a field allows a single Component and not enough once it allows several. The page-builder shape, a `sections` field mixing a `prose`, a `comparison` and a `features` Component, has to dispatch each item to a renderer, and `componentId` was the only thing to dispatch on. That is a UUID: nothing you want to write in a template, and a different one after a Project is seeded or re-provisioned. Every item now carries `componentSlug` alongside the id it already had:

```astro
{
  entry.data.sections.map((section) => {
    switch (section.componentSlug) {
      case 'prose':
        return <Prose values={section.values} />;
      case 'comparison':
        return <Comparison values={section.values} />;
    }
  })
}
```

The generated types are a union discriminated on `componentSlug` rather than on `componentId`, so `values` narrows per branch and a Component the site does not render yet is a type error instead of a blank section. The zod schema the loaders hand Astro requires the field and discriminates on it too, which is what makes the item shape and the type agree. `componentId` stays on both, nothing that reads it has to change.

Nothing has to be migrated. The loaders derive what they store from the Project on every sync, so the field simply appears after upgrading. Astro builds a collection's schema and types once, when it loads the content config, so restart a running dev server to pick up the new types.
