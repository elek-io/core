---
'@elek-io/core': minor
---

A Project's default language must now be one of its supported languages. `settings.language.default` was previously validated only against the universe of language codes Core knows, so a Project could declare `de` as its default while supporting `['en']`. Nothing then produced content in the default language, because translatable content is validated against the supported set. The rule is checked on create and update alike, so a Project also cannot drop a supported language while it is still the default. The issue is reported on `settings.language.default`.

Existing Projects whose default sits outside their supported languages are rejected on the next update until the settings are corrected, either by adding the default to the supported languages or by choosing a default from among them.
