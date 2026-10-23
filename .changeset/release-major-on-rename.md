---
'@elek-io/core': minor
---

**A rename that breaks a build releases as a major.** A Project that changes a Component's slug or a Collection's plural slug now gets a major Release where it got a patch before. A Project at 0.2.0 that changes a Component's slug now releases 1.0.0 where it released 0.2.1 before. `prepare()` reports each of these as a change of its own, and `create()` takes the bump from it:

- **A Component's slug changed.** Its generated type names are built from the slug, the slug addresses it in the API, and in Astro every item of the Component carries it as `componentSlug`, which a page's dispatch switches on. `componentChanges` carries `slugChanged`.
- **A Collection's plural slug changed.** Its generated type names, its generated client key and its Astro collection name are built from the plural slug, and the plural slug addresses it in the API. `collectionChanges` carries `slugChanged`. A changed singular slug stays a patch, because no generated name, key or path is built from it.
- **A `dynamic` field's `ofComponents` changed.** The generated types restate the list, so narrowing it, widening it and replacing an empty list with an explicit one all change them. Narrowing also permanently strips the Component items it no longer allows. `fieldChanges` and `componentFieldChanges` carry `ofComponentsChanged`.

Nothing else changes its bump, and no Project is migrated: one released before this version keeps the version it got.

**Three new values.** `CollectionChangeType` and `ComponentChangeType` gain `slugChanged`, `FieldChangeType` gains `ofComponentsChanged`. An exhaustive `switch` or a map keyed by one of them stops compiling until it handles them.

`@elek-io/core/docs/releases.md` now lists every change a diff can carry with the bump it contributes, and says what a major Release asks of a consumer. The `release` channel follows the newest Release whatever its bump, so pin an exact version to decide yourself when to move.
