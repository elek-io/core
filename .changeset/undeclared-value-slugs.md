---
'@elek-io/core': minor
---

`core.entries.create()` and `core.entries.update()` reject a Value whose slug the Collection does not declare, instead of dropping it.

Values were checked against an object keyed by field slug that stripped every key it did not name. A misspelled slug was accepted, the Entry was written without that Value and nothing was reported. A form opened before a field was renamed lost its edit the same way, since the rename had moved the stored Value to the new slug. Both now fail with a `BadRequest` naming the slug, in a Component item's values inside a dynamic field too.

Reading is unchanged. `getEntrySchemaFromFieldDefinitions`, which generated API clients parse responses with, still strips a slug it does not know, so a client generated before a field was added keeps working.
