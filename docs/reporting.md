# Reporting

Core can send a report to elek.io Cloud, and it can hand a window of its own log files to whoever asks for one. The two are deliberately separate, because collecting diagnostics and sending them are different things and only one of them needs a network.

| Method | What it does |
| --- | --- |
| `core.cloud.reports.create()` | Sends a bug report or feedback to elek.io Cloud and returns the id it was filed under |
| `core.logger.tail()` | Returns the last 24 hours of log files as one gzipped blob, sending nothing anywhere |

A report attaches a tail when whoever wrote it consented to that. A "save my diagnostics to a file" button uses the same tail and no network at all.

Where a report goes is the `cloud.url` option, which defaults to `https://api.elek.io` and is overridable through `ELEK_IO_CLOUD_URL`. See [`usage.md`](./usage.md#options).

## Sending a report

```typescript
const { id } = await core.cloud.reports.create({
  type: 'bug',
  message: 'Deleting a Collection spins forever after confirming the dialog.',
  user: await core.user.get(),
  desktop: {
    version: '0.5.0',
    runtime: { electron: '40.1.0', chrome: '142.0.0.0', node: '24.12.0' },
  },
  includeLogs: true,
});
```

There are two types of report and they take different fields:

| Type       | Fields                                                     |
| ---------- | ---------------------------------------------------------- |
| `bug`      | `message`, `user`, `desktop`, and `includeLogs`            |
| `feedback` | `message`, `user`, `desktop`. It never carries a log tail. |

Three keys carry what the sender wrote:

- **`message`.** The report itself, between 10 and 5000 characters. There is no separate summary field, because a second free text box for the first line of the first one is one more thing to fill in and one more to validate.
- **`user`.** Who to answer, and `null` is valid. It is meant to be prefilled from `core.user.get()` and left editable, so somebody can be reached at an address other than the one their commits are signed with, and so a report still has a way back before a User exists at all, which is when a report is worth most.
- **`desktop`.** The application the report was written in, which is the one part Core cannot know. A report is written in front of a user interface, and that interface is elek.io Desktop, so the block is named for it.

**Core does not read the User for you.** What you pass is what is sent. All of it is self-declared and none of it is proof of anything. Whether a sender is who they claim is a question a credential answers, never a question the body answers.

Inside `desktop`, `version` is a semantic version while the three runtime versions are plain strings, because a Chrome version has four segments and an application may not have been able to read one at all.

The schemas are exported from the browser entry as well as the node one, so a renderer that cannot touch the filesystem still validates a form against the same schema Core will, and a character counter reads its cap off `createBugReportSchema.shape.message.maxLength` rather than from a copy of the number.

## What leaves the machine

Core fills in exactly two things, `core` and `logs`. Everything else passes through from the caller, validated:

```jsonc
{
  "type": "bug",
  "message": "Deleting a Collection spins forever after confirming the dialog.",

  // Passed through from the caller
  "user": {
    "name": "Nils",
    "email": "me@example.com",
    "userType": "local",
    "language": "en",
    "id": null,
  },
  "desktop": {
    "version": "0.5.0",
    "runtime": {
      "electron": "40.1.0",
      "chrome": "142.0.0.0",
      "node": "24.12.0",
    },
  },

  // Filled in by Core
  "core": {
    "version": "0.24.0",
    "platform": "linux",
    "arch": "x64",
    "osRelease": "6.19.14",
  },

  // Filled in by Core, null unless a bug report consented to it
  "logs": {
    "encoding": "gzip+base64",
    "from": "2026-08-20T14:02:11.000Z",
    "to": "2026-08-21T14:02:11.000Z",
    "isTruncated": false,
    "data": "H4sIAAAA...",
  },
}
```

`platform` and `arch` are the Node spellings (`linux`, `x64`), not the OpenTelemetry ones a log record carries. This describes the machine, and it is not a log record. `osRelease` is included because a desktop bug is often specific to one version of an operating system.

`includeLogs` is consent to attaching a tail rather than part of the report, so it is answered by what `logs` holds and is never sent on. The request is `reportRequestSchema` and the answer is `reportResponseSchema`, both exported.

## The log tail

`core.logger.tail()` reads the last 24 hours of log files back as one blob:

```typescript
const tail = await core.logger.tail();
// { encoding: 'gzip+base64', from, to, isTruncated: false, data: 'H4sIAAAA...' }
```

The records come back oldest first, one JSON object per line, gzipped and then base64 encoded. Two things keep a tail small enough to attach:

- Log files are read line by line and gunzipped on the way, so a very large one is never held in memory.
- A run of identical records collapses into the first of them plus `elek.log.repeat.count` and `elek.log.repeat.last_timestamp`. A measured day of 78 MB, two thirds of it one stack repeating, came to 4 KB, and an ordinary day is 1 to 25 KB.

**What a tail holds.** Ids, paths, timestamps, counts and error messages, which is to say what happened and in what order. Ids and timestamps are exact, and paths keep their structure below the data directory, because those are the join: a tail plus the repository replays what was done, in order, with the commit for every step. Hashing or truncating an id would destroy that and buy nothing.

**What a tail does not hold.** The content of an Entry, the name of a Project, Collection or Asset, and the git signature of the User were never written to a log file in the first place, so they cannot be in a tail.

What the tail itself removes is the short list a log file may hold because it is written for the machine it is on:

- The home directory prefix becomes `~`.
- An attribute whose key name is on Sentry's default denylist (`token`, `secret`, `password`, `auth` and the rest) is dropped with its value.
- A git signature, a credential in a URL, or an address anywhere in the text is redacted.

Nothing goes silently. What was replaced says what it was (`~`, `[redacted]`, `[email]`), and a record that changed carries `redaction.masked.count` and `redaction.redacted.count`, so a reader can tell a deliberate gap from an empty one.

**A tail is still personal data.** The ids in it resolve against the repository, which makes it pseudonymised rather than anonymous. Scrubbing lowers what a tail carries. It does not change what it is. Ask for consent before collecting one, and decide how long you keep one.

For what Core writes into a log file in the first place, and the level each thing lands at, see [`usage.md`](./usage.md#log-files).

## Errors

`create()` throws a `CoreError` like every other service method. See [`error-handling.md`](./error-handling.md).

| Type | When |
| --- | --- |
| `BadRequest` | The report failed validation, or elek.io Cloud rejected the body (400, 413) |
| `Unauthorized` | elek.io Cloud refused the credential, or wanted one (401, 403) |
| `RateLimited` | This client passed its rate limit (429) |
| `PreconditionFailed` | elek.io Cloud could not be reached, or did not answer within 15 seconds |
| `Internal` | elek.io Cloud failed (5xx), or accepted the report and answered with something unreadable |

`PreconditionFailed` is the one worth designing a form around, because it is also what a send answers with while there is no network. Keep the text somebody wrote and let them send again.

The rest holds whatever the answer is:

- **Core never retries.** A retry after a timeout can duplicate a report elek.io Cloud already accepted, and Core cannot tell the difference from the outside. Sending again is a decision somebody makes, not one Core makes for them.
- **A body over 2 MB is refused before it is sent**, as a `BadRequest`. Base64 inflates a gzipped tail by a third, so the 1 MB a log blob may be is 1.33 MB on the wire. This is a backstop rather than something a realistic tail meets.
- **Read-only mode does not block a report.** `isReadOnly` protects a Project and its remote, and a report mutates nothing local. Being unable to write is a reason to send one.
- **The report itself is never written to a log file.** A failure is logged at the service boundary with the error type, the method and the status code, and never with what somebody wrote.

## See also

- [`usage.md`](./usage.md#log-files) - what Core writes into a log file, and the `cloud.url` option
- [`error-handling.md`](./error-handling.md) - `CoreError` and how to catch failures
- [`features.md`](./features.md#limitations) - the limitations of a tail and of sending one
