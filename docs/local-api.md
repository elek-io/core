# Local REST API

Core ships a local, read-only REST API (Hono + OpenAPI) for reading Project content over HTTP. It is meant for building static sites and apps against local data during development, and is never intended to be exposed to the internet.

For a typed wrapper over this API, see [`api-clients.md`](./api-clients.md).

## Starting and stopping

```typescript
core.api.start(31310); // default port
core.api.isRunning(); // -> true
core.api.stop();
```

Or from the CLI, without writing code:

```bash
elek api:start [port]   # port defaults to 31310
```

`ElekIoCore.dispose()` stops the API if it is running.

When using Core directly, the API only runs when you start it explicitly. The User's `localApi.isEnabled` preference (set via `core.user.set()`) records whether the API should auto-start, but Core itself does not act on it. That preference is for elek.io clients such as elek.io Desktop, which reads the flag and starts the API on launch. So when you embed Core yourself, start the API with `core.api.start()` or `elek api:start`.

## Read-only by design

Every endpoint is a **`GET`**. There are no create, update or delete routes - writes go through the service layer (`core.projects`, `core.collections`, and so on). See [`usage.md`](./usage.md).

## Endpoints

All content routes are mounted under `/content/v1`. Each resource offers the same three shapes: list, count, and get-one.

| Method | Path                                                                                  | Returns                     |
| ------ | ------------------------------------------------------------------------------------- | --------------------------- |
| GET    | `/content/v1/projects`                                                                | `PaginatedList<Project>`    |
| GET    | `/content/v1/projects/count`                                                          | `number`                    |
| GET    | `/content/v1/projects/{projectId}`                                                    | `Project`                   |
| GET    | `/content/v1/projects/{projectId}/collections`                                        | `PaginatedList<Collection>` |
| GET    | `/content/v1/projects/{projectId}/collections/count`                                  | `number`                    |
| GET    | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}`                   | `Collection`                |
| GET    | `/content/v1/projects/{projectId}/components`                                         | `PaginatedList<Component>`  |
| GET    | `/content/v1/projects/{projectId}/components/count`                                   | `number`                    |
| GET    | `/content/v1/projects/{projectId}/components/{componentIdOrSlug}`                     | `Component`                 |
| GET    | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries`           | `PaginatedList<Entry>`      |
| GET    | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/count`     | `number`                    |
| GET    | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/{entryId}` | `Entry`                     |
| GET    | `/content/v1/projects/{projectId}/assets`                                             | `PaginatedList<Asset>`      |
| GET    | `/content/v1/projects/{projectId}/assets/count`                                       | `number`                    |
| GET    | `/content/v1/projects/{projectId}/assets/{assetId}`                                   | `Asset`                     |

Collections and Components accept either a UUID or a slug in the path (`{collectionIdOrSlug}` / `{componentIdOrSlug}`). Core resolves the slug to an id.

## Pagination

List endpoints take `limit` and `offset` query parameters. `limit` defaults to **15** and `offset` to **0** (note this differs from the service-layer `list()`, where `limit: 0` means "everything"). The response is a `PaginatedList`:

```typescript
{
  total: number,   // total items across all pages
  limit: number,   // the limit that was applied
  offset: number,  // the offset that was applied
  list: T[],       // the items for this page
}
```

```
GET /content/v1/projects/abc-123/collections/blog-posts/entries?limit=10&offset=20
```

## Responses and errors

Single-resource and count endpoints return the raw object or number. Thrown `CoreError`s are mapped to HTTP responses by the API's error handler, with the embedded `statusCode` becoming the HTTP status:

```json
{
  "error": {
    "type": "NotFound",
    "message": "...",
    "statusCode": 404,
    "stack": "..."
  }
}
```

The stack trace is included deliberately - the API is a local developer tool, never public. See [`error-handling.md`](./error-handling.md#stack-traces-in-api-error-responses).

## Built-in documentation

With the server running:

- `GET /` serves an interactive [Scalar](https://scalar.com/) API reference UI.
- `GET /openapi.json` serves the OpenAPI 3.0 document.

Both are generated from the same Zod schemas the routes use, so they always match the running version. Requests are logged through Core's logger, and CORS is restricted to `http://localhost`.

## See Also

- [`api-clients.md`](./api-clients.md) - a typed client generated over this API
- [`usage.md`](./usage.md) - starting the API and writing content through the services
- [`error-handling.md`](./error-handling.md) - the error envelope and `CoreError`
- [`fields.md`](./fields.md) - the shape of the `Entry` values these endpoints return
