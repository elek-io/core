# Local REST API

Core ships a local, read-only REST API (Hono + OpenAPI) for reading Project content over HTTP. It is meant for building static sites and apps against local data during development, and is never intended to be exposed to the internet.

For a typed wrapper over this API, see [`api-clients.md`](./api-clients.md).

## Starting and stopping

```typescript
await core.api.start(31310); // default port, resolves once listening
core.api.isRunning(); // -> true
await core.api.stop(); // resolves once the port is released
```

`start()` rejects with a `CoreError` instead of starting:

- `Conflict` when something else holds the port
- `PreconditionFailed` when the API is already running or still starting. Stop it first.

Or from the CLI, without writing code:

```bash
elek api:start [port]   # port defaults to 31310
```

`ElekIoCore.dispose()` stops the API if it is running, and the port is released once it resolves.

When you embed Core yourself, the API only runs once you start it, with `core.api.start()` or `elek api:start`.

## It binds loopback only

The API listens on `127.0.0.1` and the bind address is not an option. Only the machine it runs on can reach it, so nothing on the network sees a read API over every Project in your data directory. Reach it through `localhost` or `127.0.0.1`.

A tool on another host cannot connect to it. Forward a port to it, for example over SSH, rather than looking for a setting.

The User's `localApi.isEnabled` preference (set via `core.user.set()`) records whether the API should auto-start. Core never acts on it. It is there for elek.io clients such as elek.io Desktop, which read the flag and start the API on launch.

## Read-only by design

Every endpoint is a **`GET`**. There are no create, update or delete routes - writes go through the service layer (`core.projects`, `core.collections`, and so on). See [`usage.md`](./usage.md).

## Endpoints

All content routes are mounted under `/content/v1`. Each resource offers the same three shapes: list, count, and get-one.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/content/v1/projects` | `PaginatedList<Project>` |
| GET | `/content/v1/projects/count` | `number` |
| GET | `/content/v1/projects/{projectId}` | `Project` |
| GET | `/content/v1/projects/{projectId}/collections` | `PaginatedList<Collection>` |
| GET | `/content/v1/projects/{projectId}/collections/count` | `number` |
| GET | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}` | `Collection` |
| GET | `/content/v1/projects/{projectId}/components` | `PaginatedList<Component>` |
| GET | `/content/v1/projects/{projectId}/components/count` | `number` |
| GET | `/content/v1/projects/{projectId}/components/{componentIdOrSlug}` | `Component` |
| GET | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries` | `PaginatedList<Entry>` |
| GET | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/count` | `number` |
| GET | `/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/{entryId}` | `Entry` |
| GET | `/content/v1/projects/{projectId}/assets` | `PaginatedList<Asset>` |
| GET | `/content/v1/projects/{projectId}/assets/count` | `number` |
| GET | `/content/v1/projects/{projectId}/assets/{assetId}` | `Asset` |

Collections and Components accept either a UUID or a slug in the path (`{collectionIdOrSlug}` / `{componentIdOrSlug}`). Core resolves the slug to an id.

## Pagination

List endpoints take `limit` and `offset` query parameters. Both are passed straight to the service layer, so they behave exactly as `list()` does: `limit` defaults to **15**, `offset` to **0**, and `?limit=0` means everything from `offset` on. The response is a `PaginatedList`:

```typescript
{
  total: number,   // total items across all pages
  limit: number,   // the limit that was applied
  offset: number,  // the offset that was applied
  list: T[],       // the items for this page
}
```

```
GET /content/v1/projects/3f2504e0-4f89-41d3-9a0c-0305e82c3301/collections/blog-posts/entries?limit=10&offset=20
```

## Responses and errors

Single-resource and count endpoints return the raw object or number. A failure answers with one of four bodies, and which one you get depends on what failed rather than on the route.

A thrown `CoreError` keeps its `statusCode` as the HTTP status:

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

`stack` is the stack of the error the `CoreError` wraps, so it is absent when nothing was wrapped. It is included deliberately - the API is a local developer tool, never public.

Anything else that throws is not a `CoreError` and has no `type`, so the body is flatter. The status comes from the error's own `status` when it carries one, and is `500` otherwise:

```json
{
  "message": "...",
  "stack": "..."
}
```

A path no route matches answers `404` with a message and nothing else, so branch on the presence of `error` rather than on the status:

```json
{
  "message": "Not Found - /content/v1/nope"
}
```

A path or query parameter that fails its schema never reaches a service. It answers `422` with Zod's own issues, which name the parameter and why it was rejected:

```json
{
  "success": false,
  "error": {
    "name": "ZodError",
    "issues": [
      { "code": "invalid_format", "path": ["projectId"], "message": "..." }
    ]
  }
}
```

## Built-in documentation

With the server running:

- `GET /` serves an interactive [Scalar](https://scalar.com/) API reference UI.
- `GET /openapi.json` serves the OpenAPI 3.0 document.

Both are generated from the same Zod schemas the routes use, so they always match the running version. CORS is restricted to `http://localhost`.

Requests are logged through Core's logger, never as the URL. A log file can be handed to someone else, and both a `{collectionIdOrSlug}` segment and a query parameter carry whatever the caller sent. What a record holds instead is the matched route pattern and the ids the request addressed, so:

```
GET /content/v1/projects/<project-uuid>/collections/blog-posts
```

is recorded as the route `/content/v1/projects/:projectId/collections/:collectionIdOrSlug`, the Project and Collection ids, and a note that the Collection was addressed by slug rather than by id.

## See also

- [`api-clients.md`](./api-clients.md) - a typed client generated over this API
- [`usage.md`](./usage.md) - starting the API and writing content through the services
- [`error-handling.md`](./error-handling.md) - the error envelope and `CoreError`
- [`fields.md`](./fields.md) - the shape of the `Entry` values these endpoints return
