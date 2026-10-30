---
'@elek-io/core': minor
---

**Three dependencies npm installs alongside Core moved:**

| Dependency                   | From    | To      |
| ---------------------------- | ------- | ------- |
| `@scalar/hono-api-reference` | 0.12.13 | 0.12.16 |
| `hono`                       | 4.13.13 | 4.13.14 |
| `mime`                       | 4.1.1   | 4.1.2   |

These moves add, remove or rename no export of any entry point and change no public type. The reference page `elek api:start` serves at `/` is byte-identical to the previous release's, and it lists the same 15 content routes. `mime`'s fix is to `getAllExtensions`, which Core never calls, and the `getType` and `getExtension` it does call answer identically.

**`docs/api-clients.md` is more precise about compiling on TypeScript 7.** Adding Core's default output directory to your `tsconfig.json` takes the explicit glob `".elek.io/**/*"`, because TypeScript's directory globs skip names beginning with a dot, and a bare `".elek.io"` therefore leaves the generated file out. The doc also now names `isolatedDeclarations` as the one option that takes `generate:client js` away on TypeScript 7, whatever directory you write into.
