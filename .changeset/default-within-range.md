---
'@elek-io/core': minor
---

Field definitions now validate that a non-null `defaultValue` respects the field's own bounds. For `text` and `textarea` the default's length must sit within `min`/`max`, and for `number` and `range` the default must sit within the numeric `min`/`max`. Previously an out-of-range default was accepted even though the same value would be rejected on write, letting a definition ship a default it could never store.
