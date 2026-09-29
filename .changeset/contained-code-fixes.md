---
'@elek-io/core': minor
---

Fixed seven bugs that each made a documented promise untrue.

**Disposing twice no longer hangs.** `LogService.close()` ended winston's underlying stream, and an ended stream never emits `finish` again, so a second `close()` returned a promise that never resolved and took `ElekIoCore.dispose()` with it. The first call's promise is now kept and handed back to every later one, so a double dispose and two concurrent disposes both resolve.

A write after `close()` is dropped rather than thrown along with it. It used to raise `ERR_STREAM_WRITE_AFTER_END`, which is what a host still holding `core.logger` saw, and what `dispose()` itself hit on its second run. The payload is still validated, so a malformed record fails whether or not teardown has run.

**A dynamic field survives a schema change.** Neither the Collection cascade nor the Component cascade passed a `componentResolver`, so an updated `dynamic` field reached schema generation without one and the update failed as `Internal`. What `docs/schema-changes.md` promises for that field, re-validating the existing value and raising a `Conflict` when it no longer fits, could not happen at all. Both cascades now pre-load the Components their field definitions reach.

**A Component can hold any Component.** `create` and `update` walked a dynamic field with an empty `ofComponents` as if it named every Component in the Project, its own id included, so updating such a Component reported it as its own cycle and a second one could not be created. An empty `ofComponents` declares no edge, because schema generation answers it with a permissive item schema and never recurses, so the cycle check skips it.

**A deep markdown tree is rejected rather than fatal.** The nesting depth guard was a root-level `.refine`, which runs after zod has walked the whole tree. A tree deep enough to matter overflowed the stack during that walk, so `safeParse` threw `RangeError` instead of returning the issue. The guard now runs in front of the object schema.

**`isProject` means Project.** The guard narrows to `Project` and validated against the file schema, so a `project.json` read straight off disk passed while carrying neither `remoteOriginUrl` nor `isProvisioned`. It validates against `projectSchema` now.

**A slug resolves against the tree git left behind.** Collections and Components are looked up by slug through an in-memory index, and nothing dropped it when git changed the working tree. After `core.projects.synchronize()` pulled a renamed Collection, its old slug still resolved to it, and the slug another Collection now held could be taken a second time. The index is now dropped on every clone, pull, merge, rebase, switch and hard reset, together with the file cache.

**A failed re-run in watch mode says so.** `elek export`, `elek generate:client` and `elek generate:types` discarded the promise of every watch triggered re-run, so a failure after the first run became an unhandled rejection. Each now prints the same message the binary prints and goes on watching.
