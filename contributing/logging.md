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

An error tracker guesses at the objects it is handed, because it does not own the code that produced them. Core writes every one of its own log calls, so the safe set is decidable rather than guessable, and a matcher that has to be right every time is not the mechanism.

Pattern matching is a backstop for records Core did not author, which is a short list: elek.io Desktop's `meta` arriving over IPC, and winston's uncaught exception records. Those are scrubbed when a log file is [handed over](#handing-a-log-file-over), not when it is written.

Practically: **log the shape, never the payload.** For a migration bug, "12 Values, languages `en` and `de`, changed `title` and `body`" is more diagnostic than the bodies and gives nothing away. Where the content already exists somewhere better, point at it instead of copying it. Git history holds every entity file at the exact commit, which is a stronger record than a log line can be.

### Redacting a command line

[`redactGitArgs`](../src/service/GitService.ts) takes the User's identity out of a git command before it reaches a log record or an error message: the `--author` of a commit, the values of `config --local user.name` and `user.email`, and credentials embedded in a remote URL. Ids, paths and flags pass through untouched.

Anything that builds a string from git arguments has to go through it. There is more than one identity site, and a rule written for only the one in front of you will miss the others.

## The record shape

A log file is one JSON object per line, following the [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) with [Semantic Convention](https://opentelemetry.io/docs/specs/semconv/) attribute names.

No `@opentelemetry/*` package is involved. The shape is nearly free and expensive to change later, and the SDK is a dependency Core does not need until there is a collector to send to.

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

| Key | OpenTelemetry | Note |
| --- | --- | --- |
| `timestamp` | `Timestamp` | ISO 8601 UTC |
| `level` | `SeverityText` | winston's own field name |
| `severityNumber` | `SeverityNumber` | see the level table below, 0 for a level Core does not know |
| `message` | `Body` | winston's own field name |
| `resource` | `Resource` | what emitted the record |
| `attributes` | `Attributes` | flat dotted keys, omitted when there are none |
| absent | `TraceId`, `SpanId`, `TraceFlags` | reserved in [`logSchema.ts`](../src/schema/logSchema.ts), unset until an OpenTelemetry SDK fills them |

**`level` and `message` keep their winston names, everything Core owns takes the OpenTelemetry one.** Those two are what a winston to OTel bridge maps to `SeverityText` and `Body` already, so renaming them would be work with no reader. `source` and `meta` were Core's own inventions, so they became `resource['service.name']` and `attributes`.

Two of the Resource keys need care:

- `service.name` is the `source` of the call, which is how a record elek.io Desktop logged through Core stays distinguishable.
- `os.type` and `host.arch` carry the Semantic Convention value rather than the Node one, so `win32` is written as `windows` and `x64` as `amd64`. A Semantic Convention name has to carry a Semantic Convention value, otherwise the name is a lie to whatever reads it later.

`service.version` is Core's own version on Core's own records. Core cannot read the version of a host that logs through it, so a host declares one through `log.hostVersion` and Core writes it on that host's records only.

A host that declares nothing leaves those records unversioned rather than borrowing Core's, which would read as a lie in exactly the way above. The option is validated as semver at construction, because `logRecordSchema` validates `service.version` on the way back in, and an unparseable one would make every record of that run invisible to `tail()`.

That matters for a log file handed over on its own. A report carries the host's version in its body, but somebody who zips `<dataDir>/logs` and mails it sends no body, and without this the file says only which platform it came from.

### Attributes are flat and dotted

OpenTelemetry Attributes may nest, and Semantic Conventions do not: `http.request.method`, `code.function.name`, `file.path`. Core follows the convention, uses a Semantic Convention name where one exists and the `elek.` namespace for the rest.

The reason is not only convention. `meta: { previous: <whole EntryFile> }` is legal OTel and still unsendable, whereas `elek.entry.value.count` and `elek.entry.value.slugs` are both the conventional shape and the shape that gives nothing away. Flattening an attribute and writing down what a payload was are the same edit.

The names that carry weight:

| Attribute | What it replaced |
| --- | --- |
| `error.type`, `code.function.name` | the `[BadRequest] (Asset.create)` prefix `AbstractService` packed into a message |
| `exception.type`, `exception.message`, `exception.stacktrace` | winston's own uncaught exception fields |
| `elek.project.id`, `elek.collection.id`, `elek.object.type`, `elek.object.id`, `elek.method` | ids that were only readable by parsing a message string |
| `file.path`, `file.name`, `file.directory` | the same, for the file a line is about |

The commit line carries the same ids the commit itself carries as trailers (`Method`, `Object-Type`, `Object-Id`, `Collection-Id`), so a log line and the commit it produced join without either being parsed.

### The vocabulary is declared

An attribute key would otherwise be a free string. `'file.paht'`, a camelCase relapse or a nested object all write themselves into a log file and are found by nobody, because the line still parses and the query for it just comes back empty. The record shape cannot drift, a vocabulary can.

So every name Core writes is listed in [`logAttributeNames`](../src/schema/logSchema.ts), grouped by where it comes from, and **`LogProps` accepts only those names for a `source: 'core'` record**:

- A name nobody declared fails `tsc`, at the call site, before it ever reaches a file.
- Adding one means adding it to the list, which is the point. The list is short, it sits next to the schema, and picking a group forces the question of whether a convention already exists for it.

`LogProps` is a discriminated union on `source`, so a host logging through `core.logger` keeps a free `meta`. Core cannot type what arrives over IPC, and the sink scrubs it instead.

That is also why `logSchema` itself stays permissive. It is the runtime guard, and a logger that throws because an attribute name was misspelled is worse than a wrong key in a file. The type only ever narrows what the schema already accepts.

Two paths a type cannot see, both closed the same way:

- An object built into a variable and logged later loses TypeScript's excess property check, so [`requestResponseLogger`](../src/api/middleware/requestResponseLogger.ts) annotates its record `LogProps` at the declaration.
- Attributes handed through another type are checked against that type, so `GitService`'s per command `attributes` option is `LogAttributes` rather than a free record.

[`logSweep.test.ts`](../src/service/logSweep.test.ts) is the backstop underneath both: it fails on any key that reached a log file and is not on the list.

### The record is an allowlist

[`toLogRecord`](../src/service/LogService.ts) builds the record key by key. Nothing reaches a log file because it happened to be sitting on winston's info object.

That matters most for the records Core did not author. winston's uncaught exception record carries `process.cwd`, `process.execPath`, `process.argv`, an `os` block and a parsed stack trace, none of which Core wrote and two of which are the account name and an arbitrary command line.

What is kept is the exception type, its message and its stack, as `exception.*` attributes, with the stack taken out of the message so the message stays one line.

## What each level means

Taken from the [OpenTelemetry log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/), so the rule is objective rather than a matter of taste.

| Level | OpenTelemetry | `SeverityNumber` | In Core |
| --- | --- | --- | --- |
| `debug` | "A debugging event" | 5 | How something happened. Reads, cache decisions, internal steps |
| `info` | "An informational event. Indicates that an event happened" | 9 | **What happened.** Every mutation of a file, a Project or a remote |
| `warn` | "Not an error but is likely more important than an informational event" | 13 | Something anomalous that Core recovered from |
| `error` | "Something went wrong" | 17 | A `CoreError` at a service boundary, or a failure Core could not recover from |

**`info` is the load bearing line.** A packaged elek.io Desktop runs Core at `info`, so `info` is the whole of what a real User's machine records. The test for a call site is one question: _if this line is missing, can someone reconstruct what the User did?_

Creating, updating or deleting a file is that line. A cache hit is not.

### Every file mutation is logged in one place

[`JsonFileService`](../src/service/JsonFileService.ts) has `create`, `read`, `update` and `delete`, and each of the three that write logs at `info`. Nothing reaches past it to `Fs.remove`, which is how deleting an Entry, a Collection or a whole Project used to leave no trace at any level while the commit that followed sat at `debug`.

`delete` takes a file or a folder and also drops what it removed from the file cache, including everything below a folder. The cache is keyed by path, so a file read before it was deleted would otherwise still be handed out.

The one exception is the rollback cleanup in [`AbstractEntityService`](../src/service/AbstractEntityService.ts), which logs on failure and undoes a mutation that never completed. A successful rollback is not something the User did.

### git commands split by what they do

One rule, applied to the verb: a command that changes a repository, a remote or the git configuration is `info`, a command that only asks it something is `debug`.

- The record of what happened, at `info`: `commit`, `add`, `push`, `pull`, `fetch`, `clone`, `init`, `merge`, `rebase`, `reset`, `switch`, `lfs` transfers, `remote add`, `config --local` writes, and creating or deleting a branch or tag.
- How it happened, at `debug`: `status`, `log`, `rev-parse`, `ls-remote`, `cat-file`, `branch --list`, `remote get-url`, `config --get`, `--version` and `--exec-path`.

[`isMutatingGitCommand`](../src/service/GitService.ts) decides it, and **a command it does not know counts as a mutation**. A command added later and never classified then shows up as a noisy line rather than as a line that should have been there and is not.

**Duration is never an input to the level.** It is a value on the record. A rule that logged any git command taking 100ms or more as a warning meant every clone, merge and LFS transfer on Windows and Intel macOS during entirely normal operation, per the platform latencies in [`testing.md`](./testing.md). A slow operation is not an anomaly, it is a slow operation on a slow machine.

## Process error handlers

`handleExceptions` on a transport is what makes winston call `process.on('uncaughtException')`, so it is how a library ends up owning its host's error handling. `log.hasProcessErrorHandlers` controls it. It defaults to `true`, which is what Core has always done, and the Astro entry sets it to `false` because inside a build the host owns the process.

**Only the rotating file may handle exceptions and rejections, never the console.** winston writes an uncaught exception to every transport that declares them. A console write that fails is itself a new uncaught exception, which winston writes to the console again, and the cycle runs as fast as the event loop allows.

It is not hypothetical: an Astro build whose stdout pipe had closed produced 20789 records in 13 minutes, peaking at 5450 a second. The file transport cannot join that cycle, because the sink it writes to is not the one that failed. [`createTransports`](../src/service/LogService.ts) is exported so this policy can be asserted directly, and `LogService.test.ts` does.

## Handing a log file over

[`core.logger.tail()`](../src/service/LogService.ts) reads the last 24 hours of log files back as one gzipped blob. It is what a report attaches when a User consented to it, and equally what a "save my diagnostics to a file" button writes out with no network involved, which is why it lives on the logger and is public rather than sitting inside the reporting service.

The window comes back in order, oldest record first, because [replay is the point](#what-a-log-file-may-contain): a tail plus the repository says what the User did, in order, with the commit for every step. Ids, paths and timestamps stay exact for the same reason. Only the account name comes out of a path.

### The sink scrubs what the call site could not decide

Core's own records are already safe, since [that is decided where they are written](#enforced-at-the-call-site-not-at-the-sink). What the sink adds is the short list of things a call site never saw:

| What | Why it is here rather than at the write site |
| --- | --- |
| The home directory prefix, replaced by `~` | The absolute path is allowed in a file on the reader's own machine, not in a copy of it |
| Key names on Sentry's default denylist | The `meta` a host hands `core.logger` arrives over IPC with a shape Core cannot type |
| A git signature on a command line | The backstop under [`redactGitArgs`](#redacting-a-command-line) |
| A credential in a URL, an address anywhere | Uncaught exception text is the one record Core did not author at all |

The denylist runs over every record rather than only a host's. A Core attribute whose name matches one of these would be a leak rather than a false positive, and `logTail.test.ts` asserts that no name in `logAttributeNames` matches, so it cannot quietly start dropping something Core meant to write.

Three rules the scrubbers follow:

- **Redact, do not remove.** An absence reads as "this did not happen" and the reader draws the wrong conclusion, so what came out says what it was: `[redacted]`, `[email]`, `~`.
  - A record that was changed carries `redaction.masked.count` and `redaction.redacted.count`, the two the OpenTelemetry Collector's redaction processor stamps, so a reader can tell a deliberate gap from an empty one.
- **Never hash, rotate or truncate an id.** Hashing buys correlation without the value, which is the right trade for a name and the wrong one here. The ids are the join against the repository, and that join is what makes a tail worth reading at all.
- **A tail is personal data whatever the scrubbers do.** Data attributable to a person "by the use of additional information" is pseudonymised under GDPR Article 4(5), and pseudonymised data is still personal data. Scrubbing lowers what a report carries, it does not move it out of the category. Retention is the control, not redaction.

### Collapsing what repeated is the algorithm

A measured day was 78 MB, and 67% of it was one `uncaughtException: write EPIPE` stack repeating at up to 5450 records a second. Collapsing a run of identical records into the first of them plus `elek.log.repeat.count` and `elek.log.repeat.last_timestamp` took that day to 0.04 MB without dropping anything a reader needs, and 4 KB once gzipped. An ordinary day is 1 to 25 KB.

That is why there is no trim loop. `TAIL_MAX_BYTES` is a safety valve rather than a working limit, the oldest records go first when it bites, and `isTruncated` says so. It is also why the collapse happens during the read: 78 MB read into memory to collapse it afterwards defeats the point, so each file is streamed line by line and gunzipped on the way.

### Reading the directory

- **Key off the extension, never off the date.** The transport only gzips on a rotation event while the process is running, so closing the app and reopening it the next day leaves yesterday's file plain forever.
- **A file is named after a local date, a record is stamped in UTC.** The file names decide only which of the 30 kept files are worth opening, padded by a day either side. The record's own timestamp is what decides whether it is in the window.
- **The `.*-audit.json` dotfile is not a log file.** It is the transport's own rotation state.
- **Scrub after `JSON.parse`, never against the raw text.** On Windows a path is backslashed and JSON escapes it as `\\`, so a scrub over raw text would have to understand the escaping and a scrub over parsed strings does not. The home directory is matched case insensitively there, where `C:\Users\Nils` and `C:\users\nils` both occur, and in both separator spellings.

### A line is a record or it is nothing

`logRecordSchema` is the gate. A line that does not parse as one is skipped, which covers the half written last line, a file that is not a log file, and anything an older Core wrote in a shape this one no longer knows.

**Nothing carries an older shape forward.** Core and the applications on it are alpha, so a reader that speaks two record shapes would be dead code the day it was written. When that stops being true, the thing to reach for is a version on the record, not a parser that guesses.

This is also why `logRecordSchema` must not be tightened past what a record actually is. It is the read contract, and it has to keep accepting the free `meta` a host logs through `core.logger` as `attributes`.

### The last lines can be missing

winston hands a record to a write stream and there is no per transport flush, so a tail collected right after a crash can stop short of the lines it was collected for.

`tail()` writes a `Collecting a log tail` marker and yields a macrotask before reading, which gives the stream a chance to drain and says in the file where the tail ended. That is a hedge, not a fix, and the residual gap is documented as a limitation rather than engineered around.

## Decisions worth not relitigating

**No second tier on the record.** A `local` field, written to the file but always dropped from anything shared, was designed and rejected:

- It would have let the upgrade path keep logging whole entity bodies locally, but the bodies are already in git history at the exact commit, which is the better record.
- A field whose only job is to hold things too sensitive to share is a place for such things to accumulate.

Revisit only if a concrete debugging need appears that git history cannot answer.

**Names, again.** elek.io Desktop's consent copy tells a User that a report may carry "the names of your Projects, Collections and files". Core keeps them out anyway, so it promises less than it is asked for, which is the safe direction. Do not add names back to match the copy.

**No `@opentelemetry/*` package, for now.** Checked against the real packages, not assumed:

- `@opentelemetry/semantic-conventions` would verify 11 of the 36 attribute names: 8 from its stable entry point and 3 (`file.path`, `file.name`, `file.directory`) only from `/incubating`. The other 25 are `elek.` names it could never cover, and the 4 Resource keys are already pinned by `logResourceSchema` as a closed object.
  - It is a dependency with no runtime cost and a monthly release cadence, for under a third of the vocabulary. `logAttributeNames` and its test cover all of it instead.
  - All 15 Semantic Convention names Core uses were verified by hand against semconv 1.43.0, and `os.type` and `host.arch` carry exactly the values that enumeration defines.
- `@opentelemetry/api-logs` does not describe this record. Its `LogRecord` has `timestamp?: TimeInput` in epoch nanoseconds, a `body`, a `severityText` and no per record Resource, so adopting it as the type would force the file format in the direction this document rejected.
  - It is also a `0.x` package that pulls `@opentelemetry/api` at runtime, for four numbers that already have a test.

Revisit when there is a collector to send to, which brings the SDK as a set and the conventions with it.

**The winston bridge maps the info object, not this record.** `@opentelemetry/winston-transport` is a second transport that reads winston's own `{ message, level, ...rest }` and turns everything left over into attributes. It never sees the file record, so the two are independent.

It also means a drop in would emit `attributes: { source: 'core', meta: { ... } }`, nested and wrong. Core's log calls put their attributes under `meta`, which is one level too deep for it. Making it the configuration step it should be needs a format that lifts `meta` onto the info object first. Worth knowing before anything is built on the assumption that it is free.

## Testing the invariants

Plant a string nothing else in the suite produces, exercise the path, and assert it never reaches `pathTo.logs`:

- [`logPrivacy.test.ts`](../src/service/logPrivacy.test.ts) does this for names.
- [`ProjectService.upgradeLogging.test.ts`](../src/service/ProjectService.upgradeLogging.test.ts) does it for authored Entry content.
- [`GitService.redaction.test.ts`](../src/service/GitService.redaction.test.ts) does it for the git signature.

[`logSweep.test.ts`](../src/service/logSweep.test.ts) is the broad one: it runs create, update, delete, release, upgrade and synchronize with a sentinel in every place a User types something, then checks the log files for all of them at once. It carries the attribute vocabulary check too, since both questions are about what ended up in the file and both want the same expensive setup.

The other half is what a log file has to contain rather than what it must not:

- [`logLevels.test.ts`](../src/service/logLevels.test.ts) runs a Core at `info`, the level a packaged elek.io Desktop runs at, and reads its log file back. Every file mutation and the commit are in it, no cache decision and no git command that only asked something is.
- [`LogService.record.test.ts`](../src/service/LogService.record.test.ts) covers the record shape, including that a field winston left on the info object does not reach the file.
- [`logTail.test.ts`](../src/service/logTail.test.ts) covers the third question, which is what may leave the machine once a log file is handed to someone else.

A sentinel test is a scanner, and a scanner cannot prove absence. As a test that is the right trade: a false negative costs a missed case rather than a User's data, and it catches call sites added later, which is the failure mode review does not.

**Check that a new one can fail.** These tests pass whether or not the path they cover leaks, if the path is never reached. Log the sentinel deliberately once, watch the test go red, then take it out again.

## See also

- [`../docs/usage.md`](../docs/usage.md#log-files) - where log files land, and what a consumer finds in one
- [`../docs/reporting.md`](../docs/reporting.md) - what happens to a log tail once somebody sends it to elek.io Cloud
- [`error-handling-internals.md`](./error-handling-internals.md) - the boundary that logs a validation failure
- [`testing.md`](./testing.md) - how the suite the sentinel tests belong to runs
