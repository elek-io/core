# Organizations, Projects and plans on elek.io Cloud

The decisions behind `core.cloud.organizations`, `core.cloud.projects`, `core.cloud.plans` and `core.projects.removeRemoteOrigin()`, and behind the two additions to `CoreError` they brought, `QuotaExceeded` and `retryAt`. The repository owner decided each choice marked as theirs. For what a consumer sees, read [`../docs/cloud-projects.md`](../docs/cloud-projects.md).

Read it before changing one of these calls, the caps on a Project's name or description, or how a Cloud refusal maps onto a `CoreError`.

## The calls stay thin

Each call sends one request through [`CloudClient`](../src/util/cloud.ts), and the read after a taken id is the only second one. Moving a Project is the host's to compose: create, wait for `ready`, set `origin`, synchronize.

| Rejected | Why |
| --- | --- |
| One `moveToCloud()` doing every step | Waiting for `ready` is a poll with no bound Core can pick, and a failure halfway leaves a state the host has to explain step by step anyway |
| `core.cloud.projects.delete()` removing `origin` too | A Cloud call would change a local Project, which may not be on this machine at all |

## The refusals

Every refusal not listed takes the shared mapping in [`cloud.md`](./cloud.md).

| Answer | Type | Why |
| --- | --- | --- |
| `402 project_quota_exceeded` | `QuotaExceeded` | The owner's choice, see below |
| `409 project_id_taken` | the read below | Something holds the id, and only the chosen organization can say whether it is this Project |
| `409 no_cell_available`, `502`, `504` | `PreconditionFailed` | Nothing was created, so it reads as an outage and the create can be sent again |
| `403 forbidden`, `403 not_a_member` | `Unauthorized` | A role refuses one call, so the token stays |
| `400 ORGANIZATION_SLUG_ALREADY_TAKEN` on the check | `false` | It is the answer to the question, not a failure |
| `400 ORGANIZATION_ALREADY_EXISTS` on create | `Conflict` | Valid input the state refuses, as a slug clash is elsewhere |
| `409 PLAN_BELOW_CURRENT_USAGE` | `Conflict` | The same |
| the plan's two `403` codes | `Unauthorized` | elek.io Cloud answers them with `403` rather than the Stripe plugin's `401`, the owner's choice, so a `401` still means the session ended |

Core never explains a refusal in terms of how elek.io Cloud places a Project, because that is Cloud's inside and changes without Core.

### A 402 is its own type

A `402` is a race, since Desktop offers only organizations with room. `Conflict` was the alternative, and the owner rejected it:

- It shares `Conflict` with an id held in another organization, which needs different copy.
- Telling the two apart by listing the organizations again is itself racy.
- Desktop keys its copy by type, so a type of its own needs no parsing.

The shared mapping turns every `402` into `QuotaExceeded`, so a later quota on members or storage reuses it.

### A taken id

On `409 project_id_taken` Core reads the Project in the organization the person chose. A `200` is a Project an earlier create made, so the create answers it. A `404` throws `Conflict`, the id is in another organization and the Project stays local. Core never makes a fresh id, since the id names the remote and every working copy shares it.

Every other failure of the read keeps its own type, the owner's choice. Treating anything but a `200` as elsewhere was rejected, because a dropped connection or a dead session would then tell the person their Project is in another organization.

## The code a refusal carries

Core reads a refusal's code from `code` on every route, which is Better Auth's key. The owner decided elek.io Cloud answers `{ code, message, detail? }` under `/management/v1` too.

Reading `error` beside `code` was rejected, because two keys for one meaning would hold on both sides for good. The code is read only to pick a type and never reaches a message, see [`cloud.md`](./cloud.md#invariants).

## When to call again

Every `RateLimited` from `CloudClient` carries `retryAt`, epoch milliseconds or `null`, the owner's choice. A host shows the wait from it.

| Rejected | Why |
| --- | --- |
| `retryAfter` in seconds, the header's unit | Relative to when Core made the error, so it goes stale while the error crosses IPC or waits in a queue |
| A `core.cloud.notBefore` getter and no field | Another call's `429` can change it between the catch and the read |

It is a field on every `CoreError` rather than a subclass, so `error.type === 'RateLimited'` stays the whole check. Desktop's IPC serializer has to carry it, as it carries `type`.

## A session, and read-only mode

- Every call sets `isSessionRequired`, so without a token it throws `Unauthorized` before sending. Sent anyway, an offline host would get `PreconditionFailed` and ask the person to reconnect rather than to sign in.
- Creating, renaming and deleting a Project throw in read-only mode, which promises never to change a Project or its remote. Listing, reading, organizations and plans touch no remote, so they run.

## What Core reads of an answer

- A role Core does not know is dropped from `roles`. It grants nothing Core can check, and failing the list would lock an older Core out when elek.io Cloud adds a role.
- A plan Core does not know fails the list with `Internal`. A host cannot show a room or a price for it, so there is nothing to fall back to.
- `remoteUrl` and the checkout `url` must be `http` or `https`, so a host never sets a remote or opens a page of another scheme it was handed.
- `successUrl` and `cancelUrl` come from the caller, an absolute URL or a path starting with `/`. elek.io Cloud serves no page to return to and checks the origin itself, so Core does not guess one.

## A Project's name and description

A name holds 1 to 200 after trimming, elek.io Cloud's cap counted in UTF-16 code units as Cloud counts, so every local Project can move there. A description holds 1 to 500. Both caps sit on `projectFileSchema`, the owner's choice, with no migration because Core had no users yet.

| Rejected | Why |
| --- | --- |
| Capping only the create and update props | A longer existing name would still read, and that Project could not move |
| Cutting a longer name in a migration | Core would change authored text without asking |
| No cap on a local Project | A Project could be named in a way elek.io Cloud refuses |

Both stay plain strings, the owner's choice. Making the description translatable and optional like a Component's was rejected. A Project is listed outside its own languages, on the Projects page and on elek.io Cloud, whose column would hold an object keyed by languages it does not know. It would also break every reader of `description`.

## Invariants

- No log line and no message carries an organization's name or slug or a Project's name. Ids are what a line carries, see [`logging.md`](./logging.md).
- `projects.create()` sends the id it was given, on every attempt.
- A `RateLimited` from `CloudClient` carries `retryAt` whenever the `429` carried a `Retry-After` Core could read.
- `removeRemoteOrigin()` changes git state only, so it leaves `project.json`, the commits and the tags as they were.

## See also

- [`../docs/cloud-projects.md`](../docs/cloud-projects.md) - the calls as a consumer sees them
- [`cloud.md`](./cloud.md) - the seam every call goes through, and the shared mapping
- [`naming.md`](./naming.md#organizations-projects-and-plans) - why the calls carry the names they do
- [`logging.md`](./logging.md) - why names and slugs never reach a log file
