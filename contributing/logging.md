# Logging

Core logs with winston through [`LogService`](../src/service/LogService.ts), to the console and to daily rotated files under `pathTo.logs`, kept 30 days.

A log file is read by the person whose machine wrote it, and it can be handed to someone else when they ask for help. Both of those make what goes into it a decision rather than an accident. Two invariants follow, and every new log call has to satisfy both.

## What a log file may contain

**Core's log files never contain what a User typed.**

Allowed, and wanted:

- ids and file paths, which is what makes a line resolvable against the repository
- what happened, when, and in what order
- counts, lengths, languages, field slugs, versions, durations
- error types, messages and stacks Core itself raised

Never:

- the content of an Entry, an Asset or any other authored value
- **a name**: of a Project, Collection, Component, Entry or Asset. Anything a User typed, not only what they wrote into a field
- a User's name or email, including inside a git command line
- the remote access token, which today only ever travels by environment variable

**Names go even though they are not content.** They buy a reader nothing: every line already carries the id, and an id resolves to the object, its name included, the moment the repository is on hand. A name is the one part of a line that reads as somebody's words, and it is the part that survives being read by someone the User never expected to read it. So it goes, and the ids stay.

Two things are allowed that look like they should not be:

- **The absolute data directory**, because it is the reader's own machine. Anything that ships a log file elsewhere is responsible for scrubbing the home directory prefix out of it.
- **Stacks from uncaught exceptions**, which winston writes through its own handler. Core did not author that text and cannot type it, so it is the one record whose contents are not decidable at the call site.

### Core's log files, not everything Core prints

The invariant is about the files under `pathTo.logs`. It does not cover output Core writes through a **host's** logger, which is a different surface: terminal output during that developer's own build, on their own machine, never written to a file.

Two places do that on purpose and keep their names:

- [`astro/core.ts`](../src/astro/core.ts) `logReadingProject`, which the loaders call with Astro's `context.logger`. Its `Reading Project "Website" version 1.4.0 (production)` line is documented consumer behavior in [`usage.md`](../docs/usage.md).
- [`index.astro.ts`](../src/index.astro.ts), which uses the `logger` Astro hands to `astro:config:setup`.

A build that will not say which Project it read is worse at its job, and none of that output leaves the machine.

So the test for a call site is not "does it mention a name" but **"does it go through `core.logger`"**.

### Enforced at the call site, not at the sink

An error tracker guesses at the objects it is handed, because it does not own the code that produced them. Core writes every one of its own log calls, so the safe set is decidable rather than guessable, and a matcher that has to be right every time is not the mechanism. Pattern matching is a backstop for records Core did not author, which is a short list: elek.io Desktop's `meta` arriving over IPC, and winston's uncaught exception records.

Practically: **log the shape, never the payload.** For a migration bug, "12 Values, languages `en` and `de`, changed `title` and `body`" is more diagnostic than the bodies and gives nothing away. Where the content already exists somewhere better, point at it instead of copying it. Git history holds every entity file at the exact commit, which is a stronger record than a log line can be.

### Redacting a command line

[`redactGitArgs`](../src/service/GitService.ts) takes the User's identity out of a git command before it reaches a log record or an error message: the `--author` of a commit, the values of `config --local user.name` and `user.email`, and credentials embedded in a remote URL. Ids, paths and flags pass through untouched.

Anything that builds a string from git arguments has to go through it. There is more than one identity site, and a rule written for only the one in front of you will miss the others.

## The record shape

A log file is one JSON object per line, following the [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) with [Semantic Convention](https://opentelemetry.io/docs/specs/semconv/) attribute names. No `@opentelemetry/*` package is involved: the shape is nearly free and expensive to change later, the SDK is a dependency Core does not need until there is a collector to send to.

```json
{
  "timestamp": "2026-08-21T14:02:11.000Z",
  "level": "info",
  "severityNumber": 9,
  "message": "Created file \"~/elek.io/projects/<uuid>/collections/<uuid>/<uuid>.json\"",
  "resource": {
    "service.name": "core",
    "service.version": "0.24.0",
    "os.type": "linux",
    "host.arch": "amd64"
  },
  "attributes": { "file.path": "..." }
}
```

| Key              | OpenTelemetry                     | Note                                                                                                  |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `timestamp`      | `Timestamp`                       | ISO 8601 UTC                                                                                          |
| `level`          | `SeverityText`                    | winston's own field name                                                                              |
| `severityNumber` | `SeverityNumber`                  | see the level table below, 0 for a level Core does not know                                           |
| `message`        | `Body`                            | winston's own field name                                                                              |
| `resource`       | `Resource`                        | what emitted the record                                                                               |
| `attributes`     | `Attributes`                      | flat dotted keys, omitted when there are none                                                         |
| absent           | `TraceId`, `SpanId`, `TraceFlags` | reserved in [`logSchema.ts`](../src/schema/logSchema.ts), unset until an OpenTelemetry SDK fills them |

**`level` and `message` keep their winston names, everything Core owns takes the OpenTelemetry one.** Those two are what a winston to OTel bridge maps to `SeverityText` and `Body` already, so renaming them would be work with no reader. `source` and `meta` were Core's own inventions, so they became `resource['service.name']` and `attributes`.

`service.name` is the `source` of the call, which is how a record elek.io Desktop logged through Core stays distinguishable. `service.version` is only set for Core's own records, because Core does not know the version of a host that logs through it. `os.type` and `host.arch` carry the Semantic Convention value rather than the Node one, so `win32` is written as `windows` and `x64` as `amd64`. A Semantic Convention name has to carry a Semantic Convention value, otherwise the name is a lie to whatever reads it later.

### Attributes are flat and dotted

OpenTelemetry Attributes may nest, and Semantic Conventions do not: `http.request.method`, `code.function.name`, `file.path`. Core follows the convention, uses a Semantic Convention name where one exists and the `elek.` namespace for the rest.

The reason is not only convention. `meta: { previous: <whole EntryFile> }` is legal OTel and still unsendable, whereas `elek.entry.value.count` and `elek.entry.value.slugs` are both the conventional shape and the shape that gives nothing away. Flattening an attribute and writing down what a payload was are the same edit.

The names that carry weight:

| Attribute                                                                                    | What it replaced                                                                 |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `error.type`, `code.function.name`                                                           | the `[BadRequest] (Asset.create)` prefix `AbstractService` packed into a message |
| `exception.type`, `exception.message`, `exception.stacktrace`                                | winston's own uncaught exception fields                                          |
| `elek.project.id`, `elek.collection.id`, `elek.object.type`, `elek.object.id`, `elek.method` | ids that were only readable by parsing a message string                          |
| `file.path`, `file.name`, `file.directory`                                                   | the same, for the file a line is about                                           |

The commit line carries the same ids the commit itself carries as trailers (`Method`, `Object-Type`, `Object-Id`, `Collection-Id`), so a log line and the commit it produced join without either being parsed.

### The record is an allowlist

[`toLogRecord`](../src/service/LogService.ts) builds the record key by key. Nothing reaches a log file because it happened to be sitting on winston's info object.

That matters most for the records Core did not author. winston's uncaught exception record carries `process.cwd`, `process.execPath`, `process.argv`, an `os` block and a parsed stack trace, none of which Core wrote and two of which are the account name and an arbitrary command line. What is kept is the exception type, its message and its stack, as `exception.*` attributes, with the stack taken out of the message so the message stays one line.

## What each level means

Taken from the [OpenTelemetry log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/), so the rule is objective rather than a matter of taste.

| Level   | OpenTelemetry                                                           | `SeverityNumber` | In Core                                                                       |
| ------- | ----------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `debug` | "A debugging event"                                                     | 5                | How something happened. Reads, cache decisions, internal steps                |
| `info`  | "An informational event. Indicates that an event happened"              | 9                | **What happened.** Every mutation of a file, a Project or a remote            |
| `warn`  | "Not an error but is likely more important than an informational event" | 13               | Something anomalous that Core recovered from                                  |
| `error` | "Something went wrong"                                                  | 17               | A `CoreError` at a service boundary, or a failure Core could not recover from |

**`info` is the load bearing line.** A packaged elek.io Desktop runs Core at `info`, so `info` is the whole of what a real User's machine records. The test for a call site is one question: _if this line is missing, can someone reconstruct what the User did?_

Creating, updating or deleting a file is that line. A cache hit is not.

### Every file mutation is logged in one place

[`JsonFileService`](../src/service/JsonFileService.ts) has `create`, `read`, `update` and `delete`, and each of the three that write logs at `info`. Nothing reaches past it to `Fs.remove`, which is how deleting an Entry, a Collection or a whole Project used to leave no trace at any level while the commit that followed sat at `debug`.

`delete` takes a file or a folder and also drops what it removed from the file cache, including everything below a folder. The cache is keyed by path, so a file read before it was deleted would otherwise still be handed out.

The one exception is the rollback cleanup in [`AbstractEntityService`](../src/service/AbstractEntityService.ts), which logs on failure and undoes a mutation that never completed. A successful rollback is not something the User did.

### git commands split by what they do

One rule, applied to the verb: a command that changes a repository, a remote or the git configuration is `info`, a command that only asks it something is `debug`. So `commit`, `add`, `push`, `pull`, `fetch`, `clone`, `init`, `merge`, `rebase`, `reset`, `switch`, `lfs` transfers, `remote add`, `config --local` writes and creating or deleting a branch or tag are the record of what happened, while `status`, `log`, `rev-parse`, `ls-remote`, `cat-file`, `branch --list`, `remote get-url`, `config --get`, `--version` and `--exec-path` are how it happened.

[`isMutatingGitCommand`](../src/service/GitService.ts) decides it, and **a command it does not know counts as a mutation**. A command added later and never classified then shows up as a noisy line rather than as a line that should have been there and is not.

**Duration is never an input to the level.** It is a value on the record. A rule that logged any git command taking 100ms or more as a warning meant every clone, merge and LFS transfer on Windows and Intel macOS during entirely normal operation, per the platform latencies in [`testing.md`](./testing.md). A slow operation is not an anomaly, it is a slow operation on a slow machine.

## Process error handlers

`handleExceptions` on a transport is what makes winston call `process.on('uncaughtException')`, so it is how a library ends up owning its host's error handling. `log.hasProcessErrorHandlers` controls it. It defaults to `true`, which is what Core has always done, and the Astro entry sets it to `false` because inside a build the host owns the process.

**Only the rotating file may handle exceptions and rejections, never the console.** winston writes an uncaught exception to every transport that declares them. A console write that fails is itself a new uncaught exception, which winston writes to the console again, and the cycle runs as fast as the event loop allows. It is not hypothetical: an Astro build whose stdout pipe had closed produced 20789 records in 13 minutes, peaking at 5450 a second. The file transport cannot join that cycle, because the sink it writes to is not the one that failed.

[`createTransports`](../src/service/LogService.ts) is exported so this policy can be asserted directly, and `LogService.test.ts` does.

## Decisions worth not relitigating

**No second tier on the record.** A `local` field, written to the file but always dropped from anything shared, was designed and rejected. It would have let the upgrade path keep logging whole entity bodies locally. The bodies are already in git history at the exact commit, which is the better record, and a field whose only job is to hold things too sensitive to share is a place for such things to accumulate. Revisit only if a concrete debugging need appears that git history cannot answer.

**Names, again.** elek.io Desktop's consent copy tells a User that a report may carry "the names of your Projects, Collections and files". Core keeps them out anyway, so it promises less than it is asked for, which is the safe direction. Do not add names back to match the copy.

## Testing the invariants

Plant a string nothing else in the suite produces, exercise the path, and assert it never reaches `pathTo.logs`. [`logPrivacy.test.ts`](../src/service/logPrivacy.test.ts) does this for names, [`ProjectService.upgradeLogging.test.ts`](../src/service/ProjectService.upgradeLogging.test.ts) for authored Entry content, and [`GitService.redaction.test.ts`](../src/service/GitService.redaction.test.ts) for the git signature.

The other half is what a log file has to contain rather than what it must not. [`logLevels.test.ts`](../src/service/logLevels.test.ts) runs a Core at `info`, the level a packaged elek.io Desktop runs at, and reads its log file back: every file mutation and the commit are in it, no cache decision and no git command that only asked something is. [`LogService.record.test.ts`](../src/service/LogService.record.test.ts) covers the record shape, including that a field winston left on the info object does not reach the file.

A sentinel test is a scanner, and a scanner cannot prove absence. As a test that is the right trade: a false negative costs a missed case rather than a User's data, and it catches call sites added later, which is the failure mode review does not.

**Check that a new one can fail.** These tests pass whether or not the path they cover leaks, if the path is never reached. Log the sentinel deliberately once, watch the test go red, then take it out again.
