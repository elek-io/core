---
'@elek-io/core': minor
---

**A Collection's icon is the name of a Lucide icon**, rather than one of the two names Core listed. `core.collections.create()` and `core.collections.update()` take any name in Lucide's spelling of lowercase words joined by single dashes, at most 64 characters, so `newspaper`, `car` and `settings` all pass. A name that is empty, carries an uppercase letter, a space, an underscore, a leading, trailing or doubled dash, or passes the cap is refused with `BadRequest`, and nothing is written. Every Collection stored with `home` or `plus` reads back as it was, with no migration.

**`SupportedIcon` is `string`** where it was `'home' | 'plus'`, and `supportedIconSchema` is a string schema rather than a `z.enum`. So a caller that read `supportedIconSchema.options` to offer a list of icons reads Lucide's own catalog instead: Core holds no list of Lucide's names and depends on no icon library. Core checks the spelling and the length rather than the name itself, so a name Lucide does not ship passes too, and an app draws a fallback icon for a name it does not know.

See `docs/usage.md`.
