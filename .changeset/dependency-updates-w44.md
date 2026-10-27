---
'@elek-io/core': minor
---

**Every dependency is up to date.** Two of the dependencies Core ships inside its bundles moved:

| Dependency                   | From    | To      |
| ---------------------------- | ------- | ------- |
| `@scalar/hono-api-reference` | 0.12.13 | 0.12.14 |
| `hono`                       | 4.13.13 | 4.13.14 |

No export of any entry point was added, removed or renamed, and no public type changed. The reference page `elek api:start` serves at `/` is byte-identical to the previous release's, and it lists the same 15 content routes.

**On TypeScript 7, `generate:types js` asks for a different setting and `generate:client js` stops working.** The `js` language of both commands compiles through tsdown, the optional peer you install yourself, and tsdown 0.23.2 no longer drives TypeScript 7's declarations through `tsgo`:

- `generate:types js` needs `isolatedDeclarations` switched on in your `tsconfig.json`. With it, the output directory stops mattering. Without it the command exits 1 saying TypeScript 7 "does not provide the classic TypeScript API required by tsc".
- `generate:client js` has no route left. `isolatedDeclarations` rejects the client Core generates with `TS9007`, naming a function without an explicit return type, and without the option the failure above applies.

With no Project to generate from, `generate:types js` writes nothing and exits 0 instead, and `isolatedDeclarations` has no Collection function of the client left to reject.

TypeScript 6 compiles both, with no `tsconfig.json` at all and into any directory, so install it as the dev dependency `elek` compiles with. Generating with the default `ts` language is unaffected on every TypeScript the peer range allows. Core's own build and the published declarations are unaffected either way. See `docs/api-clients.md`.
