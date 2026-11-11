---
'@elek-io/core': minor
---

**Five dependencies npm installs alongside Core moved:**

| Dependency                   | From    | To      |
| ---------------------------- | ------- | ------- |
| `@hono/node-server`          | 2.1.5   | 2.1.6   |
| `@scalar/hono-api-reference` | 0.12.16 | 0.12.18 |
| `@sindresorhus/slugify`      | 3.0.1   | 4.0.1   |
| `hono`                       | 4.13.14 | 4.13.17 |
| `semver`                     | 7.8.5   | 7.8.6   |

They add, remove or rename no export of any entry point and change no public type. Two of them change behavior you can see.

**An uppercase umlaut or ligature no longer splits the word it sits in.** `slug()` is the helper Core runs over an Asset's `name` on write, over the slug you give a Collection or a Component, and over a `slug` field's Value to check it is already canonical. A Project's name never goes through it. Transliterating `Ä` to `ae` used to read as a camel case boundary to the `decamelize` step, so a name in capitals broke apart where the umlaut was:

| Name       | Before        | Now         |
| ---------- | ------------- | ----------- |
| `ÄPFEL`    | `ae-pfel`     | `aepfel`    |
| `MÜNCHEN`  | `m-ue-nchen`  | `muenchen`  |
| `ÜBER UNS` | `ue-ber-uns`  | `ueber-uns` |
| `ÅNGSTRÖM` | `angstr-oe-m` | `angstroem` |
| `Æon`      | `a-eon`       | `aeon`      |
| `Þór`      | `t-hor`       | `thor`      |

An umlaut followed by a lowercase letter was never affected, so `Über` and `Ärger im Büro` are unchanged, and a `slug` field with `decamelize` off never saw the split at all.

**Three character classes that used to be dropped now transliterate.** A ligature, a titlecase digraph and a fullwidth letter: `ﬁsh` gave `sh` and gives `fish`, `ǅungla` gave `ungla` and gives `dzungla`, and a name written in fullwidth letters gave nothing at all, which a `slug` field rejects as empty.

**Nothing stored stops validating.** A `slug` field accepts a value only when it equals its own slugified form, and every slug the old version produced is still canonical under the new one, measured on both versions over the characters this fix touches. An Asset's `name` is slugified on write, and re-slugifying a stored one gives the same value for the same reason. What changes is the slug a _new_ name gets, so a slug you generated from such a name before and one you generate now differ. Where a permalink has to stay as it is, keep the stored value rather than regenerating it.

**The local API answers `400` to a request whose path holds a raw backslash.** `@hono/node-server` used to hand the path to the WHATWG URL parser, which reads `\` as `/`, so `GET /content\v1/projects` reached the router as `/content/v1/projects` and answered `200`. Such a request is now refused before routing, with an empty body, so that one status carries no JSON. A percent-encoded `%5C` and a backslash in the query string are read as before.

**hono 4.13.16 carries five security fixes**, and none of them changes what the local API does. Four cover `mount()`, `validator('form')`, the `css` helper and `csrf()`, none of which Core uses. The fifth is the router skipping wildcard middleware for three kinds of path. Two of them need a route pattern Core declares nowhere, and on the third, a path carrying an encoded line terminator, the request id, the trailing slash trim, CORS and the request logger Core installs already ran before the fix.

`@scalar/hono-api-reference` only moves its renderer. The page `elek api:start` serves at `/` comes out of this bump byte for byte unchanged, and so does the OpenAPI document behind it. `semver`'s release is a range parsing speedup.

**The published declarations no longer end in a `sourceMappingURL` comment** for a map the package never shipped. That comes from the declaration generator in Core's build, and a tool that followed the comment stopped at a missing file before.
