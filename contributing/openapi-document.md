# The OpenAPI document

How `GET /openapi.json` is generated, and the one rule a schema has to follow to stay in it. For what the local API serves, see [`../docs/local-api.md`](../docs/local-api.md).

`@hono/zod-openapi` builds the document from every route registered on the app, walking the Zod schemas in each route's request and response. One schema it cannot represent takes the whole document down, and with it the Scalar reference UI at `GET /`.

## Every recursive schema carries a component name

A schema reachable from a route and part of a reference cycle has to carry an OpenAPI component name:

```typescript
export const valueSchema = z.union([...]).openapi('Value');
```

The generator inlines a schema unless it is named. A named one is emitted once under `components.schemas` and every later occurrence becomes a `$ref` to it, which is what ends the walk. An unnamed cycle inlines itself until the stack runs out.

The three cycles today, each named at the point it closes:

| Component | The cycle |
| --- | --- |
| `Value` | a component Value holds items whose own values are Values |
| `MdAstBlockNode` | a blockquote, list item or footnote definition holds block nodes |
| `MdAstPhrasingNode` | emphasis, strong, delete, link and entry reference hold phrasing nodes |

Naming the entity schemas (`Project`, `Collection`, `Component`, `Entry`, `Asset`) is a readability choice. Naming these three is not optional.

## What a violation looks like

Nothing points at the schema. `.doc()` catches the generator's `RangeError` and answers `c.json(error, 500)`, and `JSON.stringify` of an `Error` is `{}`, so the whole failure reaches the caller as a 500 with a two byte body and reaches the log as a status code. `GET /` still serves its Scalar shell, so the reference renders empty rather than erroring.

## Only a real server reaches it

`.doc()` registers a plain route that the Hono test client in [`../src/api/api.test.ts`](../src/api/api.test.ts) cannot address, because that client is typed off the routes declared with `createRoute`. The document is covered by the tests in that file that `fetch` a started server instead, and a new route or schema is only proven by those.

## See also

- [`../docs/local-api.md`](../docs/local-api.md) - what the local API serves, including this document
- [`../docs/api-clients.md`](../docs/api-clients.md) - the generated client, which is built from field definitions and not from this document
- [`markdown-internals.md`](./markdown-internals.md) - the mdast schemas two of the three names sit on
- [`testing.md`](./testing.md) - how the suite runs, and why each file gets its own port
