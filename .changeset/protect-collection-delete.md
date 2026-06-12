---
'@elek-io/core': minor
---

Protect Collections from deletion while their Entries are still referenced

Deleting a Collection that still has Entries referenced by another surviving Entry now fails with a `Conflict` error instead of silently leaving dangling references, mirroring the Asset, Entry and Component delete protection. Detection is a single on-demand scan over the Entries outside the Collection, matching any reference that points into it (every Entry reference carries its Collection id), across flat `reference` fields, `entryReference` nodes inside `mdast` fields, and references nested inside `dynamic` / component blocks. References between Entries that are all being deleted together, including an Entry that references only itself, do not block, since they vanish cleanly. The `Conflict` carries the same `ReferencingEntry` list as the single-entity guards, so consumers get one error contract across all deletes.

A direct reference to a Collection as a whole is also detected and blocked as a defensive measure, even though no field type produces one. Only the current `work` tree is considered, not entities preserved in released (`production`) history.
