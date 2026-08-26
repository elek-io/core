---
'@elek-io/core': patch
---

Fix `GET /openapi.json` on the local API, which answered 500 with a two byte body.

The document is generated from every registered route's Zod schemas, and `@hono/zod-openapi` inlines a schema unless it carries an OpenAPI component name. Three of Core's schemas are recursive - `Value`, because a component Value holds items whose own values are Values, and the two mdast node unions - so the generator inlined them until the stack ran out and no document was produced at all. Each of the three is named now, which turns the nested occurrences into a `$ref` and ends the walk.

With it, the Scalar reference UI at `GET /` renders the API rather than an empty page. Nothing about the endpoints, their requests or their responses changed, only whether the document describing them is served.

The generated client (`elek generate:client`) is unaffected, since it is built from a Project's field definitions rather than from this document.
