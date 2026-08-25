---
'@elek-io/core': minor
---

Add the schemas a report is made of, a `RateLimited` error type and a configurable elek.io Cloud URL.

The service that sends a report comes next. These are the parts around it that other repositories need first: an application building a report form imports the schemas, and elek.io Cloud is built against the request they describe.

**The schemas.** `createBugReportSchema` and `createFeedbackReportSchema` describe what an application collects, both extending `createReportBaseSchema`, and `createReportSchema` is the discriminated union of the two. A report is a message, who sent it and what they were running. A bug adds whether to attach logs, which is consent.

They are exported from the browser entry, so a renderer that cannot touch the filesystem can still validate a form against the same schema Core will, and the cap is readable off the schema (`createBugReportSchema.shape.message.maxLength`) rather than copied into a character counter.

Who sent it is the User, both kinds of them, or null when there is no User yet. It is prefilled from `user.get()` and meant to stay editable, so somebody can be reached at an address other than the one their commits are signed with, and so a report still has a way back on a broken first run, which is when the button matters most. All of it is self-declared and none of it is proof of anything: whether a sender is who they claim is what a session says once Cloud sign-in exists, never what a body says.

What they were running is the one part Core cannot know, so elek.io Desktop hands over its own version and the Electron, Chrome and Node versions underneath it.

`reportRequestSchema` is the whole body Core sends and `reportResponseSchema` is what comes back. The request extends the same base, so the cap a form enforces and the cap Cloud is promised are the same one, and adds the two things only Core knows: the Core version and machine it ran on, and the log tail when it was asked for.

**`RateLimited`, a new `CoreError` type**, mapping to 429. Sending a report is the first thing Core does over the network that is not git, and being turned away for sending too much is not the same as a precondition failing. Anything switching exhaustively on `CoreErrorType` gains a case.

**`cloud.url`, a new option**, defaulting to `https://api.elek.io` and overridable through `ELEK_IO_CLOUD_URL`. A hardcoded host would make an outbound call untestable at every layer, from Core's own suite to an application's end to end run. A trailing slash is dropped. A value that is not a URL throws rather than falling back, because falling back would send to production on the strength of a typo.
