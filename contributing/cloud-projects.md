# Organizations, Projects and plans on elek.io Cloud

The decisions behind `core.cloud.organizations`, `core.cloud.projects`, `core.cloud.plans` and `core.projects.removeRemoteOrigin()`, and behind the two additions to `CoreError` they brought, `QuotaExceeded` and `retryAt`. The repository owner decided each choice marked as theirs. For what a consumer sees, read [`../docs/cloud-projects.md`](../docs/cloud-projects.md).

Read it before changing one of these calls, the caps on a Project's name or description or on an organization's name, what Core makes of a plan or role it does not know, or how a Cloud refusal maps onto a `CoreError`.

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

The rule relies on elek.io Cloud checking a taken id before the quota. Checked the other way round, a create sent again into a `hobby` organization that the first copy filled answers `QuotaExceeded` for a Project that was made, and the read never runs.

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
- Creating, updating and deleting a Project throw in read-only mode, which promises never to change a Project or its remote. Listing, reading, organizations and plans touch no remote, so they run.

## What Core reads of an answer

- `remoteUrl` and the checkout `url` must be `http` or `https`, so a host never sets a remote or opens a page of another scheme it was handed.
- `successUrl` and `cancelUrl` come from the caller, an absolute URL or a path starting with `/`. elek.io Cloud serves no page to return to and checks the origin itself, so Core does not guess one.
- A name read back, a Project's or an organization's, is any string. The caps hold what Core sends, and a read never fails over a name.

### A plan or a role Core does not know

A plan Core does not know reads as `null`, and a role Core does not know is dropped from `roles`, the owner's choice. Both are absence for one reason: which plans elek.io Cloud sells is open, and a Desktop already released has to keep its organization list the day Cloud adds one.

- The room still reads from `projects.count` and `projects.limit`, which Cloud answers whatever the plan.
- A plan that is not a string at all still throws `Internal`, since that is an answer Core cannot read rather than one it does not know.

| Rejected | Why |
| --- | --- |
| `Internal` for an unknown plan, the first version | Every released host would lose the whole list, every organization in it |
| Keeping an unknown plan or role as a string | No switch over it can be exhaustive, and a raw id is no copy a host can show |
| `plan: string`, the catalogue Cloud's alone | `plans.upgrade()` could check nothing, and a host would get no type to key its copy by |
| Dropping the organization | The account is a member of it, and its room reads without the plan |

## A Project's name and description

A name holds 1 to 200 after trimming, elek.io Cloud's cap counted in UTF-16 code units as Cloud counts, so every local Project can move there. A description holds 1 to 500. Both caps sit on `projectFileSchema`, the owner's choice, with no migration because Core had no users yet.

| Rejected | Why |
| --- | --- |
| Capping only the create and update props | A longer existing name would still read, and that Project could not move |
| Cutting a longer name in a migration | Core would change authored text without asking |
| No cap on a local Project | A Project could be named in a way elek.io Cloud refuses |

Both stay plain strings, the owner's choice. Making the description translatable and optional like a Component's was rejected. A Project is listed outside its own languages, on the Projects page and on elek.io Cloud, whose column would hold an object keyed by languages it does not know. It would also break every reader of `description`.

### The description on elek.io Cloud

elek.io Cloud keeps a description beside the name, and answers `null` for a Project created without one. The owner decided the shape of both calls:

- `projects.create()` takes it optionally, as elek.io Cloud does, and sends no key without one. Requiring it was rejected, since Core would be stricter than Cloud for nothing, and a Project without one reads as `null` anyway.
- `projects.update()` takes a name, a description or both, and sends only what it got. It refuses neither with `BadRequest` before sending, as the slug is checked.
- No `null` clears a description, because a local Project always holds one.

| Rejected for `update()` | Why |
| --- | --- |
| A union type that demands one key | Its tooltip reads worse, and zod reports a failed union from both branches, so the `BadRequest` message gets noisier |
| Sending neither and mapping Cloud's `400 invalid_request` | It spends a request, and needs a session, to learn what the props already say |

## An organization's name

An organization's name holds 1 to 200 after trimming, elek.io Cloud's rule, which the owner decided. Core checks it before sending, as the slug, and exports `cloudOrganizationNameSchema`, the owner's choice, so a host checks a name under its field by the rule Core and Cloud apply. Keeping it inside the create props was rejected, since a host would rebuild the rule and drift from it.

## Invariants

- No log line and no message carries an organization's name or slug or a Project's name or description. Ids are what a line carries, see [`logging.md`](./logging.md).
- `projects.create()` sends the id it was given, on every attempt.
- A `RateLimited` from `CloudClient` carries `retryAt` whenever the `429` carried a `Retry-After` Core could read.
- `removeRemoteOrigin()` changes git state only, so it leaves `project.json`, the commits and the tags as they were.

## See also

- [`../docs/cloud-projects.md`](../docs/cloud-projects.md) - the calls as a consumer sees them
- [`cloud.md`](./cloud.md) - the seam every call goes through, and the shared mapping
- [`naming.md`](./naming.md#organizations-projects-and-plans) - why the calls carry the names they do
- [`logging.md`](./logging.md) - why names and slugs never reach a log file
