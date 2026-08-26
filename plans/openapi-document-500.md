# The OpenAPI document answers 500

`GET /openapi.json` on a running local API returns 500 with a two byte body. [`../docs/local-api.md`](../docs/local-api.md) documents it as serving the OpenAPI 3.0 document, and the Scalar reference UI at `GET /` fetches it, so the built-in documentation is broken with it.

Find the cause, fix it, and close the testing gap that hid it. It has been reproduced twice independently, so start from the reproduction rather than re-establishing it.

## The reproduction

Start a real server and fetch the document. An in-process `app.request()` is not enough, see below.

```typescript
await core.api.start(port);
const res = await fetch(`http://127.0.0.1:${port}/openapi.json`);
// status 500, body two bytes
```

`.doc('/openapi.json', ...)` is registered in `src/api/index.ts`, and the Scalar UI points at the same path a few lines below it.

## Why nothing caught it

`src/api/api.test.ts` drives the app through Hono's in-process client, which never exercises `.doc()`. So the whole route is untested, and the reference UI that depends on it is untested with it.

That gap is the more valuable half of this task. A fix without a test that starts a real server leaves the next regression just as invisible.

## Worth checking while you are in there

- Whether the failure is the document failing to generate or the response failing to serialize. A two byte body suggests `{}` reached the client, which points at generation rather than routing.
- Whether any route's schema is what breaks generation. `@hono/zod-openapi` builds the document from every registered route, so one unrepresentable schema takes the whole document down, and Core registers `z.union` and recursive mdast schemas that are the usual suspects.
- Whether `GET /` renders at all, or renders an empty reference. Both are broken outcomes and they read differently to a user.
- Whether `pnpm build` and the generated client are affected. [`../docs/api-clients.md`](../docs/api-clients.md) describes generating a typed client, and if that reads the same document it is broken by the same cause.

## What to produce

The fix, a test that starts a real server and asserts the document is served and parses as OpenAPI 3.0, and a changeset if the behavior a consumer sees changes.

If the cause turns out to be a schema that cannot be represented in OpenAPI, say so before working around it. Reshaping a content schema to satisfy a document generator is a trade worth making deliberately.

## What to escalate

Do not resolve these alone, collect them and report them back to Nils:

- A fix that requires changing a request or response schema, which changes the API's contract.
- Any other route the in-process client never reaches, found while closing the gap.

## See also

- [`../docs/local-api.md`](../docs/local-api.md) - what the local API promises to serve, including this document
- [`../docs/api-clients.md`](../docs/api-clients.md) - the typed client generated from this document
- [`jsdoc-findings.md`](./jsdoc-findings.md) - the review that found it, listed as unrelated to the JSDoc work
