---
'@elek-io/core': minor
---

Add `core.cloud.reports.create()`, which sends a bug report or feedback to elek.io Cloud.

```ts
const { id } = await core.cloud.reports.create({
  type: 'bug',
  message: 'Deleting a Collection spins forever after confirming the dialog.',
  user: await core.user.get(),
  desktop: {
    version: '0.5.0',
    runtime: { electron: '40.1.0', chrome: '142.0.0.0', node: '24.12.0' },
  },
  hasLogConsent: true,
});
```

This is the first thing Core does over the network that is not git. It sits under `core.cloud` rather than at the top level because elek.io Cloud is several APIs rather than one, so `core.cloud.reports` says which of them a call belongs to and leaves the others somewhere to land. Where it goes is the `cloud.url` option, so it is testable at every layer rather than a constant. No HTTP client came with it, only the `fetch` Node already has.

**Core fills in exactly two things.** The Core version and the machine it is running on, and the log tail when a bug report consented to one. Everything else passes through from the caller, validated, and nothing else is added: `hasLogConsent` is consent to attaching a tail rather than part of the report, so it is answered by what `logs` holds and is never sent on.

**Who sent it is not read for you.** Core does not call `user.get()`, because the address somebody can be reached at belongs in the form that collected the report and is meant to stay editable there. Whatever is passed is what is sent, including `null` for a machine that has no User yet, which is exactly when a report is worth having.

**Feedback never carries logs.** There is nothing on it that could turn one on, so a tail is attached only to a bug report that asked for one. What a tail holds and what it does not is `core.logger.tail()`'s answer, unchanged by being sent somewhere.

**There is no retry.** A retry after a timeout can duplicate a report elek.io Cloud already accepted, and Core cannot tell the difference from the outside. Core waits 15 seconds and hands the failure back, so sending again is a decision somebody makes rather than one Core makes for them. What comes back is typed: `BadRequest` for a rejected body, `Unauthorized` for a refused credential, `RateLimited` for too much sent from here recently, `PreconditionFailed` for a Cloud that could not be reached or did not answer, and `Internal` for a Cloud that failed or answered a created report with something that is not one. A 201 whose body does not parse throws rather than handing a caller something unvalidated.

Two smaller decisions. Read-only mode does not block a report, because `isReadOnly` protects a Project and its remote and a report mutates nothing local, so being unable to write is a reason to send one. And a body over 2 MB is refused here instead of on the wire, since base64 inflates a gzipped tail by a third and the caller learns the same thing without the round trip.

The whole feature is a privacy feature, so the report itself never reaches a log file. A failure is recorded at the service boundary with the error type, the method and the status code, and never with what somebody wrote. Cloud's own answer is deliberately not read into the error message either, because it can echo back what was sent.

All of it is documented in `docs/reporting.md`, which also covers what a log tail contains and what it does not.
