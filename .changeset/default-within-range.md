---
'@elek-io/core': minor
---

Field definitions now validate that a non-null `defaultValue` respects the field's own bounds. For `text` and `textarea` the default's length must sit within `min`/`max`, and for `number` and `range` the default must sit within the numeric `min`/`max`. Previously an out-of-range default was accepted even though the same value would be rejected on write, letting a definition ship a default it could never store.

The related "a unique field cannot carry a non-null `defaultValue`" rule now lives on the shared string field definition base instead of only the string union, so every string field type inherits it, current and future ones alike. The set of accepted definitions is unchanged, but a single field definition is now rejected on its own, so an editor validating one field against its per-type schema catches the invalid unique + default combination before the Collection is assembled.
