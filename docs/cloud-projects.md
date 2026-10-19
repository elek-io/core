# Organizations, Projects and plans on elek.io Cloud

Core manages what an elek.io account holds on elek.io Cloud: the organizations it is a member of, the Projects in them and each organization's plan. This page covers the calls on `core.cloud.organizations`, `core.cloud.projects` and `core.cloud.plans`, and how a local Project moves to elek.io Cloud and back. Read it to build a Projects page, or to script elek.io Cloud.

## The calls

| Call | Answers | Sends |
| --- | --- | --- |
| `organizations.list()` | `CloudOrganization[]`, oldest first | `GET /management/v1/organizations` |
| `organizations.isSlugAvailable({ slug })` | `boolean` | `POST /api/auth/organization/check-slug` |
| `organizations.create({ name, slug })` | `{ id, name, slug }` | `POST /api/auth/organization/create` |
| `projects.create({ organizationId, id, name })` | `CloudProject` | `POST /management/v1/organizations/{organizationId}/projects` |
| `projects.list()` | `CloudProject[]`, oldest first | `GET /management/v1/projects` |
| `projects.read({ organizationId, id })` | `CloudProject` | `GET /management/v1/organizations/{organizationId}/projects/{id}` |
| `projects.update({ organizationId, id, name })` | `CloudProject` | `PATCH /management/v1/organizations/{organizationId}/projects/{id}` |
| `projects.delete({ organizationId, id })` | nothing | `DELETE /management/v1/organizations/{organizationId}/projects/{id}` |
| `plans.upgrade({ organizationId, plan, successUrl, cancelUrl })` | `{ url }` | `POST /api/auth/subscription/upgrade` |

Every call hangs off `core.cloud`. Every path is appended to the `cloud.url` option and carries the session's token, see [`cloud-account.md`](./cloud-account.md).

- Without a session every call throws `Unauthorized` and sends nothing.
- In read-only mode `projects.create()`, `projects.update()` and `projects.delete()` throw `PreconditionFailed`, because they change a Project's remote.
- No call is retried.

`core.projects.removeRemoteOrigin({ id })` belongs with them, although it calls nothing. It removes a local Project's `origin`, see [deleting a Project](#deleting-a-project).

## Organizations

An organization is `{ id, name, slug, roles, plan, projects: { count, limit } }`:

| Key | Holds |
| --- | --- |
| `roles` | the account's roles there, any of `owner`, `admin` and `member` |
| `plan` | `hobby`, `pro` or `business` |
| `projects.count` | every Project the organization holds, including ones the account cannot see |
| `projects.limit` | how many Projects the plan has room for |

An organization has room while `count` is below `limit`. Only an `owner` or an `admin` creates, renames or deletes a Project there, and only an `owner` changes the plan. A role Core does not know is left out of `roles`.

A slug is 2 to 48 lowercase letters, in words joined by single hyphens, with no digit: `^[a-z]+(-[a-z]+)*$`. Core refuses any other with `BadRequest` before sending, and `cloudOrganizationSlugSchema` checks the same rule under a form field. `isSlugAvailable()` says whether another organization holds a slug, never whether it keeps the rule.

```typescript
import ElekIoCore, { cloudOrganizationSlugSchema } from '@elek-io/core';

const core = new ElekIoCore({ cloud: { token: process.env['CLOUD_TOKEN'] } });
const slug = 'studio-penkuhl';

if (
  cloudOrganizationSlugSchema.safeParse(slug).success &&
  (await core.cloud.organizations.isSlugAvailable({ slug }))
) {
  const organization = await core.cloud.organizations.create({
    name: 'Studio Penkuhl',
    slug,
  });
  console.log(`Created ${organization.id}, its plan is hobby`);
}
```

Creating an organization makes the account its `owner`.

## Creating a Project

A Project on elek.io Cloud is `{ id, organizationId, teamId, name, remoteUrl, remoteStatus, createdAt, updatedAt }`:

- `id` is the id of the local Project, and the remote is named after it. Names may repeat.
- `teamId` is `null` for a Project every member of the organization can see.
- `remoteStatus` is `pending`, `ready` or `failed`, and only a `ready` remote can be cloned or pushed to.

`projects.create()` takes the name under the same cap a local Project has, 1 to 200 after trimming. Core then moves the Project in three steps:

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore({ cloud: { token: process.env['CLOUD_TOKEN'] } });
const organizationId = '1f0f5c2e-8a5b-4f6e-9d3c-2b7a1e4c9f00';
const local = await core.projects.read({
  id: '550e8400-e29b-41d4-a716-446655440000',
});

let project = await core.cloud.projects.create({
  organizationId,
  id: local.id,
  name: local.name,
});
while (project.remoteStatus === 'pending') {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  project = await core.cloud.projects.read({ organizationId, id: local.id });
}
if (project.remoteStatus === 'ready') {
  await core.projects.setRemoteOriginUrl({
    id: local.id,
    url: project.remoteUrl,
  });
  await core.projects.synchronize({ id: local.id });
}
```

`synchronize()` makes the first push, see [`git-and-sync.md`](./git-and-sync.md#the-first-push). git reaches the remote with the session, see [`cloud-git.md`](./cloud-git.md).

### Sending a create again

A refused create leaves nothing behind, and so does one that got no answer, so send it again as it was. Core never makes a fresh id. When elek.io Cloud already holds a Project under the id, Core reads it in the chosen organization:

| The read answers | `create()` |
| --- | --- |
| the Project | answers it, as an earlier create made it |
| no such Project there | throws `Conflict`, the id is in another organization and the Project stays local |
| anything else | throws that call's error, see [errors](#errors) |

## Renaming and listing

`projects.update()` renames a Project on elek.io Cloud, and its remote stays the same. It does not rename the local Project, which `core.projects.update()` does. `projects.list()` answers every Project the account can see, in every organization.

## Deleting a Project

`projects.delete()` deletes the Project and its repository on elek.io Cloud, for every member of the organization. The local Project keeps its files, its history and its `origin`, which then points at nothing. Remove it to make the Project local only again:

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore({ cloud: { token: process.env['CLOUD_TOKEN'] } });
const organizationId = '1f0f5c2e-8a5b-4f6e-9d3c-2b7a1e4c9f00';
const id = '550e8400-e29b-41d4-a716-446655440000';

await core.cloud.projects.delete({ organizationId, id });
await core.projects.removeRemoteOrigin({ id });
```

`removeRemoteOrigin()` removes `origin` with its remote-tracking branches and the upstream of each branch. It changes nothing on the remote and does nothing for a Project without an `origin`, see [`git-and-sync.md`](./git-and-sync.md#removing-the-remote).

A `PreconditionFailed` from `delete()` keeps the Project on elek.io Cloud, so send it again.

## Changing the plan

`plans.upgrade()` answers the page where the person pays. Open its `url` in the browser. `plan` is `pro` or `business`, the plans with a price, and only an `owner` may change it.

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore({ cloud: { token: process.env['CLOUD_TOKEN'] } });
const organizationId = '1f0f5c2e-8a5b-4f6e-9d3c-2b7a1e4c9f00';

const { url } = await core.cloud.plans.upgrade({
  organizationId,
  plan: 'business',
  successUrl: 'https://example.com/billing/done',
  cancelUrl: 'https://example.com/billing/cancelled',
});
console.log(`Open ${url} to pay`);
```

- `successUrl` and `cancelUrl` are where the browser goes afterwards. Each is an absolute URL or a path starting with `/`, and elek.io Cloud refuses an origin it does not allow.
- `url` is always `http` or `https`.
- The plan changes once the payment counts. List the organizations to see it, since `plan` and `projects.limit` follow.

## Errors

Every call throws a `CoreError`, see [`error-handling.md`](./error-handling.md).

| Type | When |
| --- | --- |
| `BadRequest` | The props failed validation, a slug that breaks the rule included, or elek.io Cloud refused them (400) |
| `Unauthorized` | Core holds no session, elek.io Cloud answered 401 and Core forgot the token, or the account's role may not do this (403) |
| `NotFound` | The organization holds no Project under the id that the account can see (404) |
| `Conflict` | `organizations.create()` for a slug another organization holds, `projects.create()` for an id in another organization, or `plans.upgrade()` to a plan with room for fewer Projects than the organization holds (409) |
| `QuotaExceeded` | `projects.create()` in an organization whose plan has no room for another Project (402) |
| `RateLimited` | This client called too often (429), see [waiting to call again](#waiting-to-call-again) |
| `PreconditionFailed` | elek.io Cloud could not be reached or did not answer within 15 seconds, could not take a new Project, or could not reach the git host (502, 504). Also a create, rename or delete in read-only mode |
| `Internal` | elek.io Cloud failed otherwise, or answered with something Core cannot read |

A `PreconditionFailed` or `QuotaExceeded` from `projects.create()` created nothing. No message repeats what elek.io Cloud answered, a name or a slug.

## Waiting to call again

A `RateLimited` from any elek.io Cloud call carries `retryAt`, when to call again in epoch milliseconds, at most an hour ahead. It is `null` when elek.io Cloud did not say.

```typescript
import ElekIoCore, { CoreError } from '@elek-io/core';

const core = new ElekIoCore({ cloud: { token: process.env['CLOUD_TOKEN'] } });

try {
  await core.cloud.organizations.list();
} catch (error) {
  if (
    error instanceof CoreError &&
    error.type === 'RateLimited' &&
    error.retryAt !== null
  ) {
    const seconds = Math.ceil((error.retryAt - Date.now()) / 1000);
    console.log(`Try again in ${seconds} seconds`);
  }
}
```

## See also

- [`cloud-account.md`](./cloud-account.md) - signing in, and the session every call here carries
- [`cloud-git.md`](./cloud-git.md) - git against a Project's remote on elek.io Cloud
- [`git-and-sync.md`](./git-and-sync.md) - setting and removing `origin`, and the first push
- [`error-handling.md`](./error-handling.md) - `CoreError` and how to catch failures
