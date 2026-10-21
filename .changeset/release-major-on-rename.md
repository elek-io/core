---
'@elek-io/core': minor
---

**A rename that breaks a build releases as a major.** A Project that renames a Component or a Collection now gets a major Release where it got a patch before, so a version number can jump further than you have seen it jump. `prepare()` reports each of these as a change of its own, and `create()` takes the bump from it:

- **A Component's slug changed.** Its generated type names are built from the slug, and the slug addresses it in the API. `componentChanges` carries `slugChanged`.
- **A Collection's plural slug changed.** Its generated type names, its generated client key and its Astro collection name are built from the plural slug, and the plural slug addresses it in the API. `collectionChanges` carries `slugChanged`. A changed singular slug stays a patch, because no generated name, key or path is built from it.
- **A `dynamic` field's `ofComponents` changed.** Narrowing the list permanently strips the Component items it no longer allows. `fieldChanges` and `componentFieldChanges` carry `ofComponentsChanged`.

Nothing else changes its bump, and no Project is migrated: one released before this version keeps the version it got. `CollectionChangeType`, `ComponentChangeType` and `FieldChangeType` each gain a value, so an exhaustive `switch` over one of them gains a case.

`docs/releases.md` now lists every change a diff can carry with the bump it contributes, and says what a major Release asks of a consumer. The `release` channel follows the newest Release whatever its bump, so pin an exact version to decide yourself when to move.
