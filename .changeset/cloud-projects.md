---
'@elek-io/core': minor
---

**Organizations, Projects and plans on elek.io Cloud.** Three new namespaces call elek.io Cloud with the session Core holds. Every call throws `Unauthorized` without a session, before sending anything. See `docs/cloud-projects.md`.

- `core.cloud.organizations`: `list()`, `isSlugAvailable({ slug })` and `create({ name, slug })`. A name is 1 to 200 characters after trimming, and a slug 2 to 48 lowercase letters in words joined by single hyphens. Both are checked before sending, and `cloudOrganizationNameSchema` and `cloudOrganizationSlugSchema` check the same under a form field. An organization's `plan` is `null` for a plan this version of Core does not know, and a role it does not know is left out of `roles`.
- `core.cloud.projects`: `create({ organizationId, id, name, description? })`, `list()`, `read()`, `update({ organizationId, id, name?, description? })` and `delete()`, under the id of the local Project. `update()` changes a name, a description or both, and throws `BadRequest` for neither. A Project's `description` is `null` when it was created without one. A create for an id elek.io Cloud holds already answers the Project when the chosen organization holds it, and throws `Conflict` when another organization does. Core never makes a fresh id. Read-only mode refuses creating, updating and deleting.
- `core.cloud.plans.upgrade({ organizationId, plan, successUrl, cancelUrl })` answers the `url` of the page where the person pays.

**`core.projects.removeRemoteOrigin({ id })`** removes `origin`, its remote-tracking branches and the upstream of each branch, so a Project is local only again. Calling it on a Project without an `origin` does nothing.

**New `CoreError` type `QuotaExceeded`**, status 402, for an organization whose plan has no room for another Project. Code that switches over every `CoreErrorType` has to handle it.

**`CoreError.retryAt`** says when to call again after a `RateLimited` from elek.io Cloud, in epoch milliseconds, at most an hour ahead. It is `null` when elek.io Cloud sent no `Retry-After` Core could read, and on every other error. `CoreError.rateLimited()` takes it as its second argument, before `cause`.

**A Project's name holds 1 to 200 characters and its description 1 to 500**, both after trimming, the name matching elek.io Cloud's cap. A `project.json` with a longer one no longer reads.

**New exports**: the schemas and types of the calls above, among them `cloudOrganizationSchema`, `cloudOrganizationNameSchema`, `cloudProjectSchema`, `cloudPlanSchema`, `projectNameSchema` and `projectDescriptionSchema`.
