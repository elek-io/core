---
'@elek-io/core': minor
---

Validation issues on grouped field definitions now carry their nested path instead of a flattened index. Creating or updating a Collection previously flattened its `fieldDefinitions` before checking that every label and description covers each supported language, so an issue on a grouped definition was reported at its position in the flattened list. That index does not address a grouped definition, and past the first group it addresses nothing at all: a Collection holding one field plus a group of two produced an issue at `fieldDefinitions[2]` in a two element array, leaving a consumer with no input to attach the error to. Issues now use the real path, `fieldDefinitions[1].fieldDefinitions[1].label`. Components are unaffected, they hold a flat list of field definitions and cannot use groups.

A group's own `label` and `description` are now checked too. They are admin metadata like a field definition's, but flattening dropped the group wrapper, so a partially translated group label passed validation. Both must now carry every language the Project supports. A `null` description stays allowed, a partially translated one does not. Collections created before this change that carry a partially translated group label are rejected on the next update until the missing translations are filled in.

The new `flattenFieldDefinitionsWithPaths()` is exported alongside `flattenFieldDefinitions()` for consumers that walk a Collection's field definitions and need each one's position in the nested array.
