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

**A name with an uppercase umlaut, a ligature or a digraph now slugifies as one word.** `slug()` is the helper a Project, Collection, Entry or Asset name goes through, and slugify 4 fixed the word break those characters used to cause:

| Name       | Before        | Now         |
| ---------- | ------------- | ----------- |
| `ÄPFEL`    | `ae-pfel`     | `aepfel`    |
| `ÜBER UNS` | `ue-ber-uns`  | `ueber-uns` |
| `ÅNGSTRÖM` | `angstr-oe-m` | `angstroem` |
| `Œuvre`    | `o-euvre`     | `oeuvre`    |
| `Þór`      | `t-hor`       | `thor`      |
| `ﬁsh`      | `sh`          | `fish`      |
| `ǅungla`   | `ungla`       | `dzungla`   |

A lowercase umlaut was never affected, so `über-cool` and `äöü` are unchanged. A fullwidth letter and a titlecase digraph used to be dropped entirely and are transliterated now, so a name made only of them has a slug at all instead of being rejected as empty.

**Nothing stored stops validating.** A `slug` field accepts a value only when it equals its own slugified form, and every slug the old version produced is still canonical under the new one, measured on both versions over the characters this fix touches. An Asset's `name` is slugified on write, and re-slugifying a stored one gives the same value for the same reason. What changes is the slug a _new_ name gets, so a slug you generated from such a name before and one you generate now differ. Where a permalink has to stay as it is, keep the stored value rather than regenerating it.

**The local API answers `400` to a request whose path holds a raw backslash.** `@hono/node-server` used to hand the path to the WHATWG URL parser, which reads `\` as `/`, so `GET /content\v1/projects` reached the router as `/content/v1/projects` and answered `200`. Such a request is now refused before routing, with an empty body, so that one status carries no JSON. A percent-encoded `%5C` and a backslash in the query string are read as before.

**hono 4.13.16 carries five security fixes**, and none of them changes what the local API does. Four cover `mount()`, `validator('form')`, the `css` helper and `csrf()`, none of which Core uses. The fifth is the router skipping wildcard middleware for three kinds of path. Two of them need a route pattern Core declares nowhere, and on the third, a path carrying an encoded line terminator, the request id, the trailing slash trim, CORS and the request logger Core installs already ran before the fix.

`@scalar/hono-api-reference` only moves its renderer. The page `elek api:start` serves at `/` is byte-identical to the previous release's, and the OpenAPI document behind it is identical and still lists the same 15 content routes. `semver`'s release is a range parsing speedup.

**The published declarations no longer end in a `sourceMappingURL` comment** for a map the package never shipped. That comes from the declaration generator in Core's build, and a tool that followed the comment stopped at a missing file before.
