# Reporting Implementation Plan

Core's half of in-app reporting. Desktop's branch `remove-sentry-and-add-reporting` is written against a `core.cloud.reports.create` contract that does not exist yet, and Cloud's `POST /management/v1/reports` is not built either. This is the plan for the Core half and the request shape Cloud should be built against.

Sources reviewed:

- Desktop `contributing/not-yet-implemented.md`, section "Reporting a bug or feedback to Cloud"
- Desktop `src/renderer/components/report-dialog.tsx`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/queries/options/cloudOptions.ts`
- Cloud `contributing/observability.md`

## Summary

Desktop's contract is sound and Core should implement it close to as written. Eight deviations are proposed, three of them blocking. All three blockers are in Core's logging rather than in the reporting feature itself, which is the headline: **the reporting feature is small, and the logs it would send are not yet worth sending.**

~~None of the eight needs a change in the Desktop repository.~~ **False.** Phase 2 argued the schemas down to a smaller shape than the contract Desktop was written against, and Core does not carry the difference. See [What elek.io Desktop needs](#what-elekio-desktop-needs).

| # | Deviation | Why |
| --- | --- | --- |
| 1 | **Fix what Core writes into its log files first** | The consent copy Desktop shows the user is false today. Core logs authored Entry content and the user's git signature. **Blocking.** |
| 2 | Add `ELEK_IO_CLOUD_URL` | Core cannot test an outbound call against a hardcoded host, and neither can Desktop's E2E suite |
| 3 | Add a `RateLimited` `CoreError` type | Both contract docs already asked for it and left it open |
| 4 | `isTruncated` instead of `truncated`, and no `verified` at all | Core's boolean naming convention, see `naming.md`. `verified` is dropped rather than renamed, see phase 2 |
| 5 | ~~`client.name` widened to an enum~~ **Rejected** | A report is written in front of a user interface. `client.name` stays `z.literal('desktop')` and the runtime is typed, see phase 2 |
| 1b | **Break the uncaught exception loop** | The console transport feeds itself. Measured at 5450 records per second for 13 minutes. **Blocking**, it can eat a whole report |
| 6 | Adopt the OpenTelemetry log record shape | Cloud is going to Cockpit through an OTel Collector. The shape is free now and costs a 30 day dual-read parser later |
| 7 | **Audit the log levels** | A packaged Desktop runs at `info`, and every create, update and commit is at `debug`. The tail would carry no actions. **Blocking** |

Everything else, including the service path `core.cloud.reports.create`, the split of who fills in what, the inline gzipped log tail and the error mapping table, is kept.

## Deviation 1: Core's log files are not safe to send yet

Desktop's consent copy reads:

> That includes the names of your Projects, Collections and files, and the actions you took, but never the content you wrote.

That is not true of Core's log files today. Three leaks, all verified against the source and against real log files under `~/elek.io/logs`.

### The user's authored content

`ProjectService` logs whole entity file bodies during a Project upgrade, at `info`, which is the default level:

- `src/service/ProjectService.ts:1565` - `meta: { previous: prevEntryFile, migrated: migratedEntryFile }`
- the same shape at `:1490` (Asset), `:1513` (Component), `:1536` (Collection) and `:899` (the Project file)

`entryFileSchema.values` is a record of `valueSchema`, which carries every authored Value's `content` in every language. So a user who has upgraded a Project has their content sitting in a log file, and the report dialog offers to send it while telling them it will not.

### The user's name and email

`src/service/GitService.ts:1362` logs the full command line:

```ts
meta: { command: `git ${args.join(' ')}` },
```

`GitService.commit` builds `--author=${user.name} <${user.email}>`, so every commit writes the git signature into the log. Confirmed present in real log files:

```
$ zcat ~/elek.io/logs/*.log.gz | grep -o 'author=[^\\"]*' | sort -u
author=John Doe <john.doe@test.com>
```

The line is `debug` normally and `warn` when the command took 100ms or more, which commits regularly do.

### The absolute data directory

`src/index.node.ts:172` logs `meta: { options: this.options }` at `info`, and `options.dataDir` is absolute:

```json
{"level":"info","message":"Initializing elek.io Core 0.22.0","meta":{"options":{"dataDir":"/home/nils/elek.io",...}}}
```

That carries the OS account name. Every `Cache miss reading file "..."` line carries it again.

### What was checked and is fine

- **Commit messages** are ids only. `GitService.commit` builds `Create entry <uuid>` plus trailers, no names and no content.
- **Zod error messages** do not carry input values. `AbstractService.validated` logs `parsed.error.message`, and zod 4 serializes issues without the `input`. Verified: a `too_small` on a 47 character string produced only `origin`, `code`, `minimum`, `inclusive`, `path` and `message`.
- **The remote access token** never reaches a command line. It travels through the askpass helper by environment variable, as `git-credentials.md` documents.

### What the logs actually contain

Before designing a redaction pass, measured against the 30788 real log lines in `~/elek.io/logs`, clustered by shape:

| Fact | Consequence |
| --- | --- |
| Below the data directory, everything is a UUID. No Project names, no Collection names, no Entry titles, no slugs | Not anonymity, **pseudonymity**. See [Ids are joinable, and that cuts both ways](#ids-are-joinable-and-that-cuts-both-ways) |
| `meta` uses **12 distinct keys** across all 30788 lines: `command`, `error`, `method`, `migrated`, `objectType`, `options`, `previous`, `status`, `statusCode`, `stderr`, `stdout`, `type` | The vocabulary is closed and tiny. An allowlist is practical here, which it never is for a generic error tracker |
| **16 lines** carry `previous` or `migrated`, so authored content | The content leak is rare but real, and rare is worse. It means nobody will notice it in review |
| Identity appears at **two** git sites, not one: `--author=` and `git config --local user.name` / `user.email` | A rule written for `--author=` alone would have missed the other. Verified, both are in the file |
| Nearly every line carries the absolute `/home/<user>` prefix | The highest volume item by far, and the cheapest to fix |
| **20789 lines**, 67% of the file, are one repeated `uncaughtException: write EPIPE` stack | Truncation alone would spend the whole 1 MB budget on one repeated stack and push out everything worth reading |

The last row is the one that changes the design. Collapsing repeated identical records into one with a count is worth more than a bigger cap, and it shrinks the surface at the same time.

### Ids are joinable, and that cuts both ways

The UUIDs look opaque, but they are not. Once Cloud stores customer repositories, a log line resolves: check the repository out by id, and `projects/<uuid>/collections/<uuid>/<uuid>.json` names a real Collection and a real Entry. Core's commit trailers (`Method`, `Object-Type`, `Object-Id`, `Collection-Id`) carry the same ids, so a log tail plus the repository replays exactly what the user did, in order, with the matching commit for every step.

Two consequences, pulling in opposite directions.

**The log is far more debuggable than it looks**, which raises what redaction must preserve. Three rules follow:

- **Never hash, rotate or truncate an id.** Sentry's `Hash` action buys correlation without the value, and applied to these ids it would destroy the one join that makes the tail worth having. Redact identity and content, keep every id verbatim.
- **Keep the path structure.** `~/elek.io/projects/<uuid>/collections/<uuid>/<uuid>.json` is the join key. Only the account name comes out.
- **Keep ordering and timestamps exact.** Replay is the point.

**And the tail is personal data whatever the redaction does.** Data that can be attributed to a person "by the use of additional information" is pseudonymised under GDPR Article 4(5), and pseudonymised data is explicitly still personal data. elek.io would hold the additional information, namely the repositories. So redaction lowers the sensitivity of a report, it does not move it out of the category. **Retention is the real control, not redaction**, which is exactly the open question Cloud already flagged in `observability.md`. Answer it before the first report arrives.

**This also settles the content question.** If the repository is on hand, the content is already available from git history at the exact commit, versioned and diffable, which is strictly better than a log line could ever give. The division of labour is clean:

- the **repository** records what changed,
- the **log** records what happened, when, and in what order.

Logging entity bodies duplicates the repository badly and is the one thing that makes the tail unsendable. Dropping them costs nothing once the repository is reachable, and the shape summary covers the case where it is not.

### Redact, do not remove

Removal loses the thing that makes a log worth sending. An absence reads as "this did not happen", and the reader draws the wrong conclusion. A redaction that says what was there keeps the record honest:

- **Preserve the kind**: `[email]`, `[path]`, `[name]`. The type is usually the debuggable part.
- **Preserve the shape**: lengths, counts, which languages, which field slugs. A migration bug is diagnosed from "12 values, languages en and de, 2 mdast, changed title and body", not from the prose.
- **Preserve correlation without the value** where identity matters. Sentry offers a `Hash` action for exactly this, so the same actor is visibly the same across 200 lines without being named. Core is single User per data directory, and the report carries `reporter` explicitly with consent, so Core does not need this. Worth knowing it exists.
- **Say that something was removed.** OpenTelemetry's redaction processor stamps `redaction.redacted.count` and `redaction.masked.count` on the record so a reader can tell a deliberate gap from an empty one. The log tail should carry the same counters.

Applied to the three leaks, redaction makes two of them **more** useful than the raw form:

| Leak | Today | Redacted |
| --- | --- | --- |
| Upgrade bodies | the whole Entry file, twice | `{ objectType, id, fromVersion, toVersion, values: { count, languages, changed: [slugs], byType, bytes: { before, after } } }` |
| Absolute paths | `/home/nils/elek.io/projects/<uuid>/...` | `~/elek.io/projects/<uuid>/...`, the whole structure kept, only the account name gone |
| Git identity | `--author=Nils <me@example.com>` | `--author=[redacted]` |

### Classify at the call site, scrub at the sink

This is the part where Core should not copy Sentry. Sentry scrubs at the sink because it receives arbitrary objects from SDKs it does not control, so guessing is all it can do. Core writes 100% of its own log calls, so the safe set is **decidable at the call site** rather than guessable at the sink. That is strictly more accurate than any matcher.

**Decided: no second tier, the bodies simply go.** A `local` field on the record, written to the file but always dropped from a tail, was designed and rejected. Recorded in [`logging.md`](../contributing/logging.md) in case a concrete need for it ever appears.

Two reasons. The bodies are already in git history at the exact commit, which is a better record than a log line and, once Cloud stores the repositories, one we can reach. And a field whose only job is to hold things too sensitive to send is a place for such things to accumulate.

So `ProjectService.upgrade` logs the shape summary in `meta` and nothing else. The invariant then holds for the file itself, with no second concept to reason about.

**Scrub at the sink only for what Core does not own**, which is a short list:

1. **Desktop's `meta`.** It arrives over IPC with a shape Core cannot type. Key name denylist, Sentry's default list is a fine starting point: `password`, `secret`, `passwd`, `api_key`, `apikey`, `auth`, `credentials`, `privatekey`, `private_key`, `token`, `bearer`.
2. **Uncaught exception messages and stacks.** Winston's `handleExceptions` writes arbitrary text Core never authored. Unbounded, cannot be typed, so string scrubbers and accept the residual risk.
3. **Git command lines**, as a backstop. The real fix is at the write site in `GitService`, which knows which arguments carry identity.
4. **`meta.previous` and `meta.migrated`**, as a backstop. Logs are kept 30 days and will outlive the fix.
5. **The home directory prefix**, everywhere, since it appears in messages as well as meta.

### Automated matching: yes for identifiers, no for content

Two different questions hide in "can we match what we know".

**Identifiers, yes.** `Os.homedir()`, `options.dataDir`, `user.name`, `user.email`, `ELEK_IO_REMOTE_ACCESS_TOKEN` and configured remote URLs are a finite set of known, high entropy strings Core already holds. Substring replacement over them is cheap, exact and needs no rules. Sentry ships a dedicated rule type for the filepath case (`Usernames in filepaths`), which is the same idea.

**Content, no, and it is worth being firm about it.** Matching a log against the user's actual Entry content is exact data match, the DLP technique, and its known failure modes are exactly the ones Core would hit:

- Short values catastrophically over match. A Value whose content is `Home` or `de` would scrub every occurrence of those substrings and shred the log.
- Microsoft's own EDM guidance says people's names should not be used as match elements "because they are difficult to distinguish from common words", and that reliable detection needs corroborating fields within a 300 character window. A Collection called `Team` has the same problem.
- The log is historical and the data is current. Content since edited or deleted no longer matches, so the scan misses precisely the content involved in the bug being reported.
- It is inside out. Building the match set means reading every Entry in every Project into memory in order to sanitize a log file.

A scanner also cannot prove absence. It is the wrong shape for an invariant.

### Enforce it with a test, not with review

The 16 content lines out of 30788 are the argument. A leak that rare survives any amount of review, and a matcher that runs at the sink only ever tells you about the leaks it already knows.

Plant a sentinel and assert it never reaches disk:

```ts
const SENTINEL = 'zqx-canary-8f2b1c';
```

Put it in a Project name, a Collection name, an Entry Value, an Asset filename and the User name, run a broad slice of Core against them (create, update, delete, upgrade, release, synchronize), then assert `SENTINEL` appears nowhere under `pathTo.logs`. That is still a scanner, but as a test a false negative costs a missed case rather than a user's data, and it catches log sites added later, which is the actual failure mode.

Core's suite already creates real Projects, so this costs almost nothing to add.

### Summary of the mechanism split

| What | Mechanism | Where |
| --- | --- | --- |
| Authored content | Tier it at the call site, `local` not `meta` | Write site |
| Git identity | Redact the identity bearing arguments | Write site, `GitService` |
| Home directory path | Known value replacement | Sink, `tail()` |
| Desktop's `meta` | Key name denylist | Sink, `tail()` |
| Uncaught exception text | String scrubbers, residual risk accepted | Sink, `tail()` |
| Old `previous` / `migrated` | Key drop | Sink, `tail()` |
| Repeated identical records | Collapse with a count | Sink, `tail()` |
| Everything, forever | Sentinel test | CI |

Cloud should scrub on ingest too, for the same reason Sentry's Relay does. It cannot trust the age of the Core that sent the report.

## Deviation 1b: the logger can feed itself, and it did

The `uncaughtException: write EPIPE` lines are not background noise, they are a self-sustaining loop. Measured in `2026-08-01.log.gz`:

|  |  |
| --- | --- |
| Records | 20789, all at `error` |
| Window | 16:28:09Z to 16:41:20Z, 791 seconds |
| Peak | **5450 records in one second** |
| Origin | `process.argv` on every record reads `node .../astro/bin/astro.mjs build`, `cwd` `/home/nils/Development/website` |
| Innermost frame | `astro/dist/core/logger/impls/node.js:22` writing to a `Socket` |

5450 per second for thirteen minutes is not an error recurring, it is a cycle running as fast as the event loop allows until the process died.

**The mechanism.** `LogService` sets `handleExceptions: true` and `handleRejections: true` on **both** transports, the rotating file and the console:

1. Core runs inside `astro build`. Astro's own logger writes to stdout, which is a pipe.
2. The pipe closes. Astro's write fails asynchronously with `EPIPE`, which surfaces as an `uncaughtException`.
3. Winston's exception handler writes the exception to every transport that declares `handleExceptions`, which includes the **console** transport.
4. The console transport writes to the same dead stdout. `EPIPE`. Which is a new `uncaughtException`.
5. Back to step 3.

The file transport is not part of the cycle. The console transport is, because the sink it writes to is the thing that failed.

**Two fixes, and both are worth doing.**

**Drop `handleExceptions` and `handleRejections` from the console transport.** The console is an echo, not a sink. An uncaught exception still reaches the log file, which is the durable record, and the cycle cannot close. One line, and it fixes the observed failure.

**Then reconsider whether Core installs process handlers at all.** `handleExceptions: true` makes winston call `process.on('uncaughtException')`, so **Core, a library, takes over its host's error handling**. Core is embedded in three hosts that all have their own:

- **Astro builds**, where it produced the loop above.
- **Electron's main process**, where Desktop is deliberately relying on it. `remove-sentry.md` says "Uncaught throws in the main process were never Sentry's to catch, since Core's logger already registers them with winston".
- **The CLI**, where it is Core's own process and taking over is correct.

Since one host wants it and another is harmed by it, make it a constructor option rather than a constant:

```ts
log: {
  level: logLevelSchema,
  /**
   * Whether Core registers process-level uncaught exception and
   * unhandled rejection handlers
   *
   * On by default, which is what Core has always done. Hosts with
   * their own handling turn it off, which is what the Astro entry
   * does: inside a build the host owns the process.
   *
   * @default true
   */
  hasProcessErrorHandlers: z.boolean(),
}
```

**Default `true`, and only `src/astro/core.ts` opts out.** The library hygiene argument says a library should not install process handlers at all, so the default should be off. It is outvoted here by blast radius:

- Defaulting `true` changes behavior for **nobody**. Desktop, the CLI and any embedder keep exactly what they have.
- Defaulting `false` silently removes a sink from Desktop, whose own `REVIEW.md` already lists "uncaught exceptions and unhandled rejections now have no sink" as a blocking finding. Core would be widening a gap Desktop is already trying to close.
- The only host that is harmed is the Astro entry, and Core owns that file.

So this needs **no change in the Desktop repository**. Opting Desktop in explicitly was considered and rejected: it would add a seventh type error to a branch that already does not compile, for a value that is the default anyway. `dispose()` already unregisters the handlers, so the teardown path exists.

**Why this belongs in this plan rather than a separate bug.** Three reasons, all about the report:

- A loop like this fills a day's log file with one repeated stack. 67% of that file is this event. Without the repeated-record collapse in `tail()`, a report sent that day would have spent its entire 1 MB budget on it and carried nothing else.
- Winston's exception records carry metadata the ordinary path does not: `process.argv`, `process.cwd`, `process.execPath`, `gid`, `os.loadavg`, `os.uptime`, `memoryUsage` and a full `trace` array. `argv` and `cwd` are absolute paths and arbitrary command lines. The sink side scrubbers have to cover these too.
- It is the one log record whose content Core does not author at all, which is why it is on the "scrub at the sink, accept residual risk" list.

## Deviation 2: `ELEK_IO_CLOUD_URL`

The contract names an endpoint but not how Core is pointed at it. Hardcoding `https://api.elek.io` makes the feature untestable at every layer. Follow Core's existing convention: constructor option wins over environment variable wins over default.

```ts
cloud: z.object({
  /**
   * Base URL of the elek.io Cloud API
   *
   * Overrides the ELEK_IO_CLOUD_URL environment variable.
   *
   * @default 'https://api.elek.io'
   */
  url: z.url(),
});
```

Resolved by a `resolveCloudUrl()` in `src/util/node.ts` alongside `resolveDataDir` and friends, and added to the environment variable table in `docs/usage.md`.

Three things this unlocks:

- Core's own suite can run a real fake Cloud on an ephemeral port. See [Testing](#testing).
- Desktop's E2E suite already injects `ELEK_IO_DATA_DIR` at launch, so it can inject this the same way and finally press Send in `reports.spec.ts`.
- A staging Cloud.

## Deviation 3: a `RateLimited` error type

Both Desktop's and Cloud's docs call `PreconditionFailed` for 429 a borrowed fit and say a `RateLimited` type is the better answer. It is six lines:

```ts
export type CoreErrorType = ... | 'RateLimited' | ...;
const statusCodes = { ..., RateLimited: 429, ... };
static rateLimited(message: string, cause?: unknown) { ... }
```

The objection is that Desktop's `reportErrorHandlers` is an exhaustive `Record<CoreErrorType, ...>`, so a new type breaks its build and the "landing Core's half needs no Desktop change" promise.

That promise is already broken. Desktop pins `@elek-io/core` 0.22.0 and its map has seven entries. Core 0.23.0 added `VersionSkew`, so the version bump that brings reports breaks that map regardless. Given a Desktop change is required either way, `RateLimited` costs nothing extra and the copy stops lying about why a send failed.

The mapping table becomes:

| Cloud | `CoreError` type | What the user sees |
| --- | --- | --- |
| 400, 413 | `BadRequest` | Alert inside the dialog |
| 401, 403 | `Unauthorized` | Root error boundary |
| 429 | `RateLimited` | Alert inside the dialog |
| network unreachable, timeout | `PreconditionFailed` | Alert inside the dialog |
| 5xx | `Internal` | Root error boundary |

Desktop's `describeCoreError` falls back for a type it has no copy for, so an un-updated Desktop degrades to the generic message rather than breaking.

## Deviation 4 and 5: naming

`naming.md` requires an `is` or `has` prefix on boolean keys. The contract writes `truncated` and `verified`. Core sends `isTruncated` and `isVerified`. Cloud is not built yet, so this is free to fix now.

`client.name` becomes an enum rather than `z.literal('desktop')`. `'desktop'` stays assignable so Desktop needs no change, and `elek report` later needs no schema change:

```ts
export const reportClientNameSchema = z.enum(['desktop', 'cli']);
```

## Deviation 6: adopt the OpenTelemetry log record shape now

Yes, there is a standard worth adopting, and the moment to do it is this change rather than later.

**Adopt the [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) for the record shape and [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/) for attribute names. Do not add any `@opentelemetry/*` package to Core yet.**

The record shape is nearly free and expensive to change later. The SDK is a dependency Core does not need until Cloud's collector exists, which `observability.md` puts behind the reporting endpoint.

### Why now and not later

- **`tail()` has to parse log files for 30 days.** Change the record shape after it ships and the parser reads two shapes for a month. Doing it in the same change as the redaction work is one migration instead of two.
- **The winston bridge becomes a passthrough.** Cloud's plan already names `@opentelemetry/instrumentation-winston` for trace correlation. An OTel-shaped record makes that a configuration step. A bespoke record makes it a rewrite.
- **`TraceId` and `SpanId` get a home before there is anything to put in them.** They sit empty today and fill themselves in once the SDK lands, rather than needing a shape change at the point where the shape is hardest to change.

### The mapping

| Today | OpenTelemetry | Change |
| --- | --- | --- |
| `timestamp`, ISO 8601 UTC | `Timestamp` | none, already right |
| `level` | `SeverityText` | keep, and **add `SeverityNumber`** |
| `message` | `Body` | keep the key, the bridge maps it |
| `source: 'core' \| 'desktop'` | `service.name` on **Resource** | it describes the emitter, not the event, so it lifts out of the per-record fields |
| `meta` | `Attributes` | flat dotted names, see below |
| `local` (new, deviation 1) | not an OTel concept | never exported, dropped before anything leaves the machine |
| absent | `TraceId`, `SpanId`, `TraceFlags` | reserve them, leave them empty |

`SeverityNumber` is the one addition that pays for itself immediately. OTel-native tooling filters and alerts on the number, not the string, and the ranges are fixed: TRACE 1-4, DEBUG 5-8, INFO 9-12, WARN 13-16, ERROR 17-20, FATAL 21-24. Core's four levels map to `debug` 5, `info` 9, `warn` 13, `error` 17.

### Attribute names

Use Semantic Conventions where one exists, and a namespace for the rest, which is what SemConv itself prescribes for custom attributes.

| Attribute | Replaces |
| --- | --- |
| `service.name`, `service.version` | `source`, and the Core version in the init message |
| `error.type` | the `[BadRequest]` prefix `AbstractService.validated` packs into the message string |
| `code.function.name` | the `(Asset.create)` prefix in the same string |
| `exception.type`, `exception.message`, `exception.stacktrace` | winston's exception record fields |
| `os.type`, `host.arch` | new, and the same values the report's `core` block sends |
| `elek.project.id`, `elek.collection.id`, `elek.entry.id`, `elek.object.type`, `elek.method` | ids currently only readable by parsing the message string |

`error.type` and `code.function.name` are worth calling out. Today `AbstractService.validated` builds `[BadRequest] (Asset.create) message`, packing structure into a string, and **Desktop parses it back out** with `parseIpcError` behind a sentinel. Both ends are working around the same missing structure. Making them attributes fixes it once.

The last row is the one that makes the whole log queryable. `elek.project.id` as an attribute means "everything that happened to this Project" is a filter rather than a substring search, and it is the id that [joins to the repository](#ids-are-joinable-and-that-cuts-both-ways).

### On nesting, stated accurately

OTel Attributes are an `AnyValue` collection, and `AnyValue` **does** permit maps and arrays, so nesting is legal in the spec. What is conventional, and what SemConv itself does throughout, is flat dotted keys, and Loki flattens for labels regardless.

So flat attributes are a convention rather than a constraint. Adopt it anyway, because it is the same discipline the redaction work wants: `meta: { previous: <whole EntryFile> }` is legal OTel and still unsendable, whereas `entry.value.count`, `entry.value.languages` and `entry.value.changed` are both the conventional shape and the redacted shape. Flattening the attributes and writing the shape summary are the same edit.

### What not to adopt

**Elastic Common Schema.** Elastic donated ECS to OpenTelemetry in 2023 with the stated goal that SemConv becomes its successor, and the convergence is still in progress as of 2026. Adopting ECS now means adopting the schema being absorbed.

**Any `@opentelemetry/*` package.** Core has eleven dependencies and no HTTP client. The SDK belongs in the phase Cloud's `observability.md` puts behind the collector, and nothing above needs it.

Re-checked against the published packages after the record shape landed, and the answer held for reasons worth writing down. `@opentelemetry/semantic-conventions@1.43.0` would verify 11 of the 36 attribute names Core writes, 3 of them only from its `/incubating` entry, and none of the 25 `elek.` ones. `@opentelemetry/api-logs` types a different record: epoch nanosecond timestamps, `body`, `severityText`, no per record Resource. Declaring the vocabulary in `logAttributeNames` covers all 36 for the cost of one list. The durable half of this is in [`logging.md`](../contributing/logging.md), since this file gets deleted.

**One correction to the passthrough argument above.** `@opentelemetry/winston-transport` maps winston's info object, not the file record: it takes `message` and `level` and turns every other top level key into an attribute. Core's log calls nest theirs under `meta`, so a drop in today would emit `attributes: { source, meta: { ... } }`. The bridge is still configuration rather than a rewrite, but it needs a format that lifts `meta` onto the info object first. The file record shape is independent of it either way, which does not change the case for adopting it now.

## Deviation 7: the log levels are wrong, and it empties the tail

This is the one that decides whether the feature is worth having, and it was found last.

**A packaged Desktop runs Core at `info`.** `src/main/index.ts:79`:

```ts
this.core = new ElekIoCore({
  log: { level: app.isPackaged ? 'info' : 'debug' },
});
```

**And every line that records what the user did is at `debug`.** Counted across `~/elek.io/logs`:

| Line                           | Level   | Count | Should be          |
| ------------------------------ | ------- | ----- | ------------------ |
| `Created file "..."`           | `debug` | 354   | **`info`**         |
| `Updated file "..."`           | `debug` | 381   | **`info`**         |
| `Executed "git commit ..."`    | `debug` | -     | **`info`**         |
| `Cache hit reading file "..."` | `debug` | 1868  | `debug`, correctly |
| `Executed "git --version"`     | `debug` | -     | `debug`, correctly |

So a bug report from a packaged app carries the errors, the warnings and Desktop's route changes, and **not one create, update, delete or commit**. The consent copy promises "the actions you took". At `info`, the actions taken are not in the file.

### The fix is a level audit, not a level flip

The obvious move is to run Desktop packaged at `debug`. It is worse. That carries all 1868 cache hit lines and every `git --version`, which is noise that crowds out signal and inflates the tail for nothing.

The real problem is that the levels do not match their meaning, and [deviation 6](#deviation-6-adopt-the-opentelemetry-log-record-shape-now) hands over an objective standard to audit them against. OpenTelemetry defines INFO as "an informational event. Indicates that an event happened" and DEBUG as "a debugging event".

`Created file` is the textbook INFO event. `Cache hit` is the textbook DEBUG one. Audit every call site against those two sentences:

- **Promote to `info`**: creating, updating and deleting a file, committing, and the mutating git operations. The record of what happened.
- **Leave at `debug`**: cache hits and misses, `git --version`, `git --exec-path`, `git status`, and the other reads. The record of how it happened.

Rough size after the audit, on the ordinary day measured above: about 850 lines instead of 43, still a few KB compressed, and diagnostic for the first time.

Desktop then needs no change either. Packaged at `info` it gets the action record without the noise, which is better than what flipping it to `debug` would have given it.

### And this is safe now in a way it was not before

Promoting write operations to `info` would have been the wrong move a week ago, because `info` is exactly where `ProjectService` writes whole entity bodies. Phase 0 removes those. **After phase 0, `info` carries strictly less sensitive data than it does today**, so raising what lands in it is a smaller step than it looks.

## Should Core own the HTTP call at all

Yes, and this is worth stating because it is Core's first outbound network request. Everything Core does over the network today is git through dugite.

For:

- The log tail is file IO, which is Core's job. Desktop's renderer makes no network calls at all, everything goes through `window.ipc`, so the request is issued from the main process either way.
- Core is the only place that knows `coreVersion`, `platform`, `arch` and the User.
- Doing it anywhere else means Desktop reimplements the error mapping, and a second client would reimplement it again.

Against, and mitigated:

- Core gains a product coupling to elek.io Cloud. Mitigated by deviation 2, so the host is configuration rather than a constant.
- No new dependency. Global `fetch` on Node 18+, which is what Cloud's own OpenTelemetry notes already assume when they name `instrumentation-undici` as the right instrumentation for Core.

## The request Cloud should be built against

`POST {ELEK_IO_CLOUD_URL}/management/v1/reports`

Headers: `Content-Type: application/json`, `User-Agent: elek.io-core/<coreVersion>`. No credential today. When Cloud sign-in lands, `Authorization: Bearer <session>` on the same endpoint.

```jsonc
{
  "type": "bug",
  "summary": "Deleting a Collection hangs",
  "message": "...",
  "contactEmail": "me@example.com",

  // Desktop's half. Core cannot know any of it.
  "client": {
    "name": "desktop",
    "version": "0.5.0",
    "runtime": {
      "electron": "40.1.0",
      "chrome": "142.0.0.0",
      "node": "24.12.0",
    },
  },

  // Core's half.
  "core": {
    "version": "0.24.0",
    "platform": "linux",
    "arch": "x64",
    "osRelease": "6.19.14",
  },

  // From user.get(), null when no User is set. contactEmail overrides email.
  // Self-declared, and none of it is proof of anything. Whether the sender
  // is who they claim is what a session says, not what a body says.
  "reporter": {
    "name": "Nils",
    "email": "me@example.com",
    "userType": "local",
    "language": "en",
    "id": null,
  },

  // Only when includeLogs is true. Null otherwise.
  "logs": {
    "encoding": "gzip+base64",
    "from": "2026-08-20T14:02:11.000Z",
    "to": "2026-08-21T14:02:11.000Z",
    "isTruncated": false,
    "data": "H4sIAAAA...",
  },
}
```

`201` responds `{ id, type, receivedAt }`, which Core parses with `reportSchema` and returns. A 201 whose body does not match throws `Internal`, rather than handing Desktop something unvalidated.

Two notes for whoever builds Cloud:

- `osRelease` is new relative to the contract, and **decided in**. A desktop bug is often specific to an OS version, and the user has consented to the report.
- `reporter` is null for a report sent before a User exists. Desktop deliberately keeps the button reachable on a broken first run, and `user-header.tsx` documents that. Cloud must accept a null reporter.

## The log tail

Lives on `LogService` as `core.logger.tail()`, **public**, not inside the report service. It is a log concern, it is testable on its own, and being public gives Desktop a "save my diagnostics to a file" button with no network involved, which is the offline half of the same capability. `ReportService` composes it when `includeLogs` is set.

### What the directory actually looks like

`LogService` configures `winston-daily-rotate-file` with `filename: '%DATE%.log'`, `zippedArchive: true` and `maxFiles: '30d'`. The important thing, measured against a real `~/elek.io/logs`, is that **an old file is not necessarily gzipped**:

```
2026-08-03.log.gz
2026-08-04.log      <- old, still plain
2026-08-10.log      <- old, still plain
2026-08-21.log      <- today
.52822b...-audit.json
```

The transport only gzips on a rotation event while the process is running. Close the app and reopen it the next day and yesterday's file is never rotated in process, so it stays plain forever. Key off the extension, never off the date. Skip the `.*-audit.json` dotfiles.

### Algorithm

Measured before written, which changed it. See [What it actually costs](#what-it-actually-costs) below.

1. `to = now`, `from = now - 24h`.
2. List `pathTo.logs`, keep `*.log` and `*.log.gz` whose date stamp falls in `[from - 1 day, to]`, sort newest first. Skip the `.*-audit.json` dotfiles.
3. **Stream** each file line by line, `gunzip` the `.gz` ones through a `node:zlib` stream. Never read a whole file into memory, a real one measured 78 MB.
4. Parse each line as JSON. Drop lines outside the window. Drop lines that fail to parse, a half written last line is normal.
5. Drop the `local` tier. Redact, per deviation 1's read-site layer.
6. **Collapse consecutive identical records** into one plus a count, while streaming. This is the step that does the work.
7. Gzip, base64, return `{ encoding: 'gzip+base64', from, to, isTruncated, data }`.

Keep a raw ceiling as a safety valve and set `isTruncated` if it is hit, but expect it never to be.

### What it actually costs

Measured against the real files in `~/elek.io/logs`:

| Day | Raw | After collapse | Gzip + base64 |
| --- | --- | --- | --- |
| 2026-08-01, `debug`, with the EPIPE loop | **78.0 MB** | **0.04 MB** (2079x) | **4 KB** |
| 2026-08-03, `debug`, ordinary | 240 KB | - | 24 KB |
| 2026-08-06, `info`, ordinary | 9 KB | - | 1 KB |

Three corrections to what this plan said before measuring:

- **The 1 MB cap is nowhere near binding.** An earlier draft claimed it "bites in practice" on the strength of the 787 KB compressed file, without noticing that 67% of it was one repeated stack. A realistic tail is 1 to 25 KB. The iterative "gzip, check, trim, gzip again" loop is over-engineering and comes out.
- **Collapse is the whole algorithm, not a nicety.** It is worth 2079x on the pathological day and it is what removes the need for a trim loop at all.
- **But the raw file still has to be streamed.** 78 MB is what a bad day produces, and reading that into memory to collapse it defeats the point. Collapse during the read, not after it.

### Base64 costs 33%, and the two caps are closer than they look

`gzip+base64` inflates by a third, measured: a 0.71 MB gzip became 0.95 MB base64. So the contract's two caps interact:

|  |  |
| --- | --- |
| Log blob cap | 1 MB gzipped |
| As base64 in the body | **1.33 MB** |
| Plus a 5000 character message, summary, client, core and reporter blocks | ~1.34 MB |
| Cloud's total body cap | 2 MB |

It fits, with about 0.66 MB of headroom rather than the 1 MB the numbers suggest at a glance. Worth Cloud knowing when it sets its body limit, since a limit set at exactly 1 MB in the belief that it matches the blob cap would reject every report carrying a full tail.

Core still asserts the serialized body is under 2 MB before sending, and trims rather than letting Cloud answer 413.

### The last lines may be missing

Winston hands the record to a write stream and there is no per transport flush. A report sent immediately after a crash can miss the final lines, which are the interesting ones. Cheap hedge, not a fix: `tail()` writes an `info` marker first (`Collecting log tail for a report`), then yields a macrotask before reading. That both gives the stream a chance to drain and marks where the tail ends in the file. Record the residual gap in `docs/features.md` rather than engineering around it.

## Two more decisions

**Read-only mode does not block a report.** `assertNotReadOnly` exists to protect a Project and its remote. A report mutates nothing local. `ReportService.create` uses `validated()`, not `mutating()`.

**No automatic retry.** A retry after a timeout can duplicate a report Cloud already accepted, and Core cannot tell the difference. The dialog already keeps the user's text and lets them press Send again deliberately. Core sets `signal: AbortSignal.timeout(15_000)` and lets a timeout surface as `PreconditionFailed`.

## Before implementation

### Verified, the plan holds

Checked on 2026-08-21 against this working tree.

- **Baseline is green.** 65 files, 983 tests, 23.3s locally.
- **The fake Cloud works.** `serve({ fetch, port: 0 })` returns the assigned port in both the callback and `server.address()`. Bind `127.0.0.1` explicitly, the default binds `::`.
- **The zod surface is there** through `@hono/zod-openapi`: `z.url`, `z.email`, `z.uuid`, `z.iso.datetime`, `z.literal`, `z.discriminatedUnion`, `z.record`.
- **`.openapi()` does not break Desktop.** `createBugReportSchema.shape.summary.maxLength` still returns `120` after tagging, and a `discriminatedUnion` accepts tagged members. So Core's usual openapi convention can be applied to the report schemas without breaking the cap derivation `report-dialog.tsx` does.
- **Nothing reads Core's log files today.** Only `LogService` writes them and one test asserts the path, so the record shape change breaks no consumer right now. The 30 day dual read falls entirely on `tail()`, which is written after it.
- **No test asserts on `previous` or `migrated`.** The five logger spies read `props.message` only.

### Found while checking, worth folding in

- **The Astro loaders' Core is never disposed.** `src/astro/core.ts` builds a process-wide singleton and nothing calls `dispose()` on it. The `elek()` integration disposes its own, separate, short lived Core at `src/index.astro.ts:150`. That is why the process error handlers stayed registered for a whole build and the EPIPE loop could run for thirteen minutes.
- **The CLI never disposes either.** `src/cli/util.ts:38` creates a Core lazily and no command tears it down, so a command can lose its last log lines on exit. Same one line class of fix.
- **Some tests assert substrings of a log message.** `src/astro/collections.test.ts` checks `messages.some((message) => message.includes('3'))`, so moving structure out of message strings and into attributes has to keep the message readable or update those assertions.

### Sequencing risks, which need a decision rather than a check

**Phase 0 has grown and should probably split.** It now holds the `local` tier, five `ProjectService` sites, two `GitService` sites, the console transport fix, the process handler option and a flattening of every log call to Semantic Convention names. Suggested split:

- **0a**, small and blocking: the console transport fix, the process handler option, the two identity sites, the five content sites. Ships on its own, fixes a live bug.
- **0b**, larger: the OpenTelemetry record reshape. Can ship alongside phase 1, since `tail()` is the only thing that cares about the shape.

**`hasProcessErrorHandlers`: settled, and it needs no Desktop change.** The option defaults to `true`, so Desktop and the CLI keep today's behavior and only `src/astro/core.ts` opts out. See [deviation 1b](#deviation-1b-the-logger-can-feed-itself-and-it-did) for why the library hygiene argument loses to blast radius here.

**Core's half unblocks Desktop on its own, before Cloud exists.** Desktop cannot build at all today, because Rollup cannot resolve the missing named exports. Shipping phases 2 and 3 makes the renderer link, so `pnpm build`, `pnpm dev` and the whole Playwright suite come back, and a send fails against a Cloud that is not there yet as `PreconditionFailed`, which is exactly the case the dialog is built to keep the user's text through. So Core to Desktop can proceed in parallel with Cloud rather than behind it.

**Cloud's Management API does not exist.** `cloud/src/index.ts` serves `/api/auth/*` and `/hello`, and its own comment says "The Content, Management and Publish APIs get their paths when they get their designs". So `POST /management/v1/reports` is not a route added to a surface, it is the first route of a surface that still needs designing, and `/management/v1/` is this plan's proposal rather than a Cloud decision.

**And that first route is the one that cannot have a session.** The same file notes that nothing throttles the public auth routes yet. A rate limit is the report endpoint's only protection, so Cloud needs rate limiting to exist before the endpoint can ship. Nobody's plan currently names that as a dependency, and it sits on the critical path to Desktop building again.

### Cross platform detail, easy to get wrong

Scrub the home directory prefix **after** `JSON.parse`, not against the raw file text. On Windows the paths are backslashed and JSON escapes them as `\\`, so a scrub over raw text would need to handle the escaping and a scrub over parsed strings does not. Match case insensitively on `win32`, where `C:\Users\Nils` and `C:\users\nils` both occur.

## The log call audit

83 call sites, reviewed on 2026-08-21. Most are correct. This is the working list of what changes, and it belongs here rather than in [`logging.md`](../contributing/logging.md), which carries the durable rule these were judged against. Delete it with this plan once the changes have landed.

### Promote to `info`, because they record a mutation

| Site | Today | Why |
| --- | --- | --- |
| [`JsonFileService.ts`](../src/service/JsonFileService.ts) `Created file` | `debug` | The textbook INFO event, and 354 of them sat below the reporting threshold |
| [`JsonFileService.ts`](../src/service/JsonFileService.ts) `Updated file` | `debug` | As above, 381 of them |
| [`UserService.ts`](../src/service/UserService.ts) `Updated User` | `debug` | The identity every later commit is signed with |
| [`GitService.ts`](../src/service/GitService.ts) `Executed "git ..."` | `debug` | Split by what the command does, see below |

**Splitting the git command log.** One rule, applied to the verb:

- **`info`** for commands that mutate a repository or a remote: `commit`, `add`, `rm`, `merge`, `rebase`, `reset`, `checkout`, `branch` create and delete, `tag`, `push`, `pull`, `fetch`, `clone`, `lfs` transfers, `config --local` writes, `init`.
- **`debug`** for reads: `status`, `log`, `show`, `diff`, `rev-parse`, `ls-files`, `branch --show-current`, `remote`, `check-ref-format`, `--version`, `--exec-path`, `config --get`.

### Gap: deleting a file is not logged at all

Ten `Fs.remove` call sites across the services, and **not one logs anything**: `EntryService.ts:365`, `ComponentService.ts:617`, `CollectionService.ts:669`, `AssetService.ts:266`, `AssetService.ts:330`, `AssetService.ts:331`, `ProjectService.ts:227`, `ProjectService.ts:545`, `ProjectService.ts:1259`, plus the rollback cleanup at `AbstractEntityService.ts:84`.

Deleting an Entry, a Collection, a Component, an Asset or a whole Project leaves no trace at any level. The only evidence is the `git commit --message=Delete entry <uuid>` that follows, which is itself at `debug` today. So "my Collection disappeared" is unanswerable from a log.

The fix is structural rather than ten separate log calls. `JsonFileService` has `create`, `read` and `update` but no `delete`, which is why the services reach past it to `Fs.remove`. Add `JsonFileService.delete(path)`, log `Deleted file` at `info` inside it, and route the JSON deletions through it. That restores the property that every JSON file mutation is logged in exactly one place.

Two of the sites are not JSON and need their own line: `AssetService.ts:266` and `:330` remove binary files under `lfs`. The rollback cleanup at `AbstractEntityService.ts:84` stays as it is, it already logs on failure and a successful rollback is not a User action.

### Carried by the record reshape

- [`AbstractService.ts`](../src/service/AbstractService.ts) packs `[${type}] (${service}.${context}) ${message}` into the message string at four sites, and elek.io Desktop parses it back out at the IPC boundary. Both ends are working around the same missing structure. It becomes `error.type` and `code.function.name` attributes.
- [`requestResponseLogger.ts`](../src/api/middleware/requestResponseLogger.ts) reads `Recieved API request`. Fix the spelling while the file is open.

### Reviewed and left alone

- **Cache lines** in `JsonFileService` (`Cache hit`, `Cache miss`, `Cleared JSON file cache`). How, not what. Correct at `debug`, and the 1868 cache hits in one measured day are why promoting them would be wrong.
- **Release diff `Skipping ...` lines** in `ReleaseService`. Internal detail of a diff. Correct at `debug`.
- **The CLI's `info` lines.** The CLI is its own process talking to a person, and its `info` output is the command's result.
- **The Astro loaders' lines.** They report what a build read, which is what a build should say, and they go through Astro's logger rather than Core's.
- **Every `warn` site** in `AbstractEntityService`, `AbstractSlugIndexedEntityService` and `GitTagService`. Each marks something anomalous that Core recovered from.

### Noticed, not a level question

`Rebuilding ${type} slug index` fired 403 times in a single measured day, against 354 file creations. That is a suspicious ratio for something that should only happen when an index is missing. Filed here as a correctness question, not fixed as part of this work.

## Implementation phases

Each phase is test first, per `AGENTS.md`.

### Phase 0a: stop the bleeding - **done**

Landed on branch `reporting`, with its own changeset. 999 tests pass, lint, types and formatting clean.

- `src/service/LogService.ts` - `createTransports` extracted so the exception handling policy is assertable, and the **console** transport no longer handles exceptions or rejections.
- `src/schema/coreSchema.ts`, `src/index.node.ts`, `src/astro/core.ts` - `log.hasProcessErrorHandlers`, defaulting `true`, with the Astro entry opting out. Gated on the transport flags rather than unregistered afterwards, since that is what winston keys on. `log`'s keys are individually optional now, so pinning one does not force the other.
- `src/service/ProjectService.ts` - the five upgrade sites log `fromVersion` / `toVersion`, plus the Value count and field slugs for an Entry. `coreVersionOf` reads the version off an unvalidated file through a zod parse rather than a cast.
- `src/service/GitService.ts` - `redactGitArgs` covers all three identity sites and URL credentials, and is applied to the log record and to the error message. The duration branch is gone, `durationMs` is a value.
- Tests: `GitService.redaction.test.ts` (five unit cases plus an integration case that creating a Project writes neither the User's name nor email to `pathTo.logs`), `ProjectService.upgradeLogging.test.ts` (a sentinel string in an Entry Value survives a forced upgrade without reaching a log file), and six new `LogService` cases covering the transport policy and the opt-out.
- [`contributing/logging.md`](../contributing/logging.md) - the durable half: the two invariants, the call site rule and the decisions behind them. It survives this plan.

Not done here, and deliberately: the broad sentinel sweep over create, update, delete, release and synchronize. The two targeted tests cover both confirmed leak classes. The sweep is worth adding with phase 0b, when the level audit touches every call site anyway and there is a reason to re-walk them. **Landed in phase 0b as `logSweep.test.ts`.**

### Phase 0b: make the log worth sending - **done**

Landed on branch `reporting`, with its own changeset. 73 files, 1072 tests pass, lint, types and formatting clean.

- `src/schema/logSchema.ts` - `logSeverityNumbers`, `logResourceSchema` and `logRecordSchema`, the on-disk contract `tail()` will parse against. `traceId`, `spanId` and `traceFlags` are declared and deliberately never written.
- `src/service/LogService.ts` - `toLogRecord` and `createLogResource`, applied as a winston format on the rotating file transport only. The record is built key by key, so winston's own `process` / `os` / `trace` blocks never reach the file and an uncaught exception becomes `exception.type` / `exception.message` / `exception.stacktrace` with a one line message. `format.timestamp()` moved to the logger, and `format.json({ deterministic: false })` keeps the record's own key order.
- The level audit. `Created file`, `Updated file` and `Updated User` to `info`, the git command split through the exported `isMutatingGitCommand`, where an unclassified command counts as a mutation.
- `JsonFileService.delete` for files and folders, logged at `info`, with every `Fs.remove` in the services routed through it except the rollback cleanup. It also evicts the deleted path from the file cache, which fixed a real bug: reading a deleted Entry returned the deleted Entry.
- Every `meta` flattened to dotted names, and the `[Type] (Service.method)` prefixes moved into `error.type`, `code.function.name` and `elek.error.status_code`. `GitService.commit` passes the commit's own trailer ids as attributes.
- Tests: `LogService.record.test.ts` (19), `GitService.logLevel.test.ts` (37), `JsonFileService.test.ts` (6), `AbstractService.logging.test.ts` (3) and `logLevels.test.ts` (7), which runs a Core at `info` and reads its log file back. `src/astro/collections.test.ts` asserts the attribute instead of a substring of the message.
- `contributing/logging.md` - the record shape, the git verb rule and the single-place property. `docs/usage.md` - the log file section, including the level table and `log.hasProcessErrorHandlers`, so **phase 4 no longer needs the log level table**. `contributing/error-handling-internals.md` - the boundary log record.

Together with phase 0a these are the only phases that touch existing behavior.

### Phase 1: `core.logger.tail()` - **done**

Landed on branch `reporting`, with its own changeset. 75 files, 1102 tests pass, lint, types, formatting and the build clean.

- `src/schema/logSchema.ts` - `logTailSchema` / `LogTail`, exactly the `logs` block of the request shape. Four attribute names added: `redaction.masked.count`, `redaction.redacted.count`, `elek.log.repeat.count`, `elek.log.repeat.last_timestamp`.
- `src/service/LogService.ts` - `tail()`, and the file is one class again. Everything the tail needs is a member of `LogService`, with `createTransports`, `toLogRecord`, `createLogResource` and `createLogScrubber` public static because a test injects their inputs. The only other thing in the file is `TailBuffer`, a private collector that belongs to one call of `tail()`.
- **No dual read, and no `legacyLogRecordSchema`.** The plan assumed a 30 day window where a tail parses two record shapes. Core and the applications on it are alpha, so that reader would be dead code the day it was written. `logRecordSchema` is the gate: a line that is not a record is skipped, which is the same path a half written line takes. If a shape ever has to change again after alpha, the answer is a version on the record rather than a parser that guesses.
- **The `local` tier is not dropped either, because it never shipped.** Deviation 1 decided against it.
- **`previous` and `migrated` are not dropped at the sink.** Same reasoning: the only Core that wrote them wrote them in a record shape a tail no longer reads. The key name denylist stays, because a host's free `meta` is a live concern rather than a legacy one.
- **The denylist runs over every record, not only a host's.** A Core attribute matching `token` or `auth` would be a leak rather than a false positive. `logTail.test.ts` asserts no name in `logAttributeNames` matches, so it cannot start dropping something Core meant to write.
- `pipe()` does not forward an error, so a `.gz` that cannot be read would have left the gunzip stream waiting forever. The error is forwarded explicitly.
- Tests: `logTail.test.ts`, 22 cases. Every one of them was checked by mutating the implementation and watching it go red, which caught two that were passing for the wrong reason.
- `contributing/logging.md` - "Handing a log file over", the durable half. Survives this plan.

Not done here, and deliberately: `docs/`. `docs/reporting.md` is where a consumer meets the tail, and phase 4 writes it. Until then `tail()` is public with no consumer doc.

### Phase 2: schemas and the error type - **done**

Landed on branch `reporting`, with its own changeset. 76 files, 1140 tests pass, lint, types, formatting and the build clean.

- `src/schema/reportSchema.ts` - `reportTypeSchema`, `createReportBaseSchema`, the two create schemas and their union, `reportRequestSchema` and `reportResponseSchema`. **Simpler than the contract Desktop was written against, and Desktop changes rather than Core carrying the difference:**
  - **No `summary`.** `message` is the report. A second free text field for the first line of the first field is one more thing to fill in and one more to validate. Desktop drops its summary input and the `SUMMARY_MAX_LENGTH` derivation at `report-dialog.tsx:71`, which would otherwise throw a `TypeError` at module scope.
  - **No `contactEmail`.** The `user` block is the contact, prefilled from `user.get()` and left editable, so it does the job of both. Desktop binds its email input to `user.email` instead. Someone with no User yet fills it in or leaves it, and `user` is null either way.
  - **`user` is on the create schema, not the request.** It is editable in the dialog, so the client is what sends it. Core no longer fills it in.
  - **`client` became `desktop`.** `name: z.literal('desktop')` was saying what the key already says. `ReportDesktop` is exported as a derived type so Desktop has something to annotate `describeClient()` with, and no separate schema exists for it.
  - **`reportSchema` became `reportResponseSchema`, and it is `{ id }`.** A pair that reads as a pair, and `type` was only ever echoing what was sent.
  - **`reportReporterSchema` and `reportCoreSchema` are inlined.** Single use, no consumer outside the file.
- `src/schema/serviceSchema.ts` - `'Report'`. `src/schema/index.ts` - exported.
- `src/util/shared.ts` - `RateLimited`, 429. `util.test.ts` now pins every type to its status code, so a type added without one cannot slip through.
- `src/schema/coreSchema.ts`, `src/util/node.ts`, `src/index.node.ts` - `cloud.url` and `resolveCloudUrl`, which drops a trailing slash and throws rather than falling back. `docs/usage.md` and `docs/error-handling.md` updated, since both document a table this adds a row to.
- Verified against the real build, not only the source: the browser bundle carries the runtime values and `createBugReportSchema.shape.summary.maxLength` reads 120 out of `dist/`, which is what Rollup resolves for Desktop's renderer.

**Desktop needs two keys added, not one.** `client/src/shared/ipcError.ts` builds its list with `satisfies Record<CoreErrorType, true>` and lists seven types. Core has nine now: `VersionSkew` was already missing before this phase, and `RateLimited` joins it. Desktop's `reportErrorDescriptions` is `Partial<Record<...>>` and needs nothing.

### Phase 3: the service - **done**

On branch `reporting`, uncommitted at this milestone. 78 files, 1184 tests pass, lint, types, formatting and the build clean.

- `src/service/ReportService.ts` - one `create()`, through `validated()` rather than `mutating()`, so read-only mode does not block a report. The request is built by spreading the validated report and letting `reportRequestSchema.parse` strip `includeLogs`, which is consent rather than part of the report, so a key added to the base flows through instead of needing a second copy of the field list.
- `src/service/CloudService.ts` - `core.cloud.reports.create(props)`. Two levels deep, which is new for Core.
- `src/index.node.ts` and `src/service/index.ts` - constructed, exported, `public get cloud(): CloudService`.
- No new dependency, global `fetch`. `AbortSignal.timeout(15_000)`, no retry, and the 2 MB body ceiling checked before sending.
- **Cloud's own answer is deliberately not read into the error message.** It can echo back what was sent, and a boundary error message is written to a log file, which is the one place a report must never reach. The status and the URL are all an error carries.
- Tests: `ReportService.test.ts`, 24 cases against a real hono server on port 0. Every one of them was checked by mutating the implementation and watching it go red, which caught three mutations that were no-ops rather than three bad tests.

**The fake Cloud needed one thing the plan did not say.** `ServerType` is a union covering HTTP/2 servers, so `closeAllConnections()` is reached through an `in` narrowing rather than a cast. Without it, the never-answering-server test leaves a socket open and `close()` hangs.

### Phase 4: docs and changeset - **done**

- `docs/reporting.md` - new, framed around the capability rather than one caller, so it covers both `core.cloud.reports.create()` and `core.logger.tail()` and says why they are separate. What leaves the machine, what a tail holds and does not, the error table, and that a tail is pseudonymised rather than anonymous whatever the scrubbers do.
- `docs/index.md` - listed under Platform. `docs/features.md` - three limitations and a See Also row.
- `.changeset/report-service.md`, `minor`.
- `docs/usage.md` and `docs/error-handling.md` needed nothing. `ELEK_IO_CLOUD_URL`, the `RateLimited` row and the log level table all shipped with earlier phases.

## What elek.io Desktop needs

The plan's summary promised "none of the eight needs a change in the Desktop repository". Phase 2 made that false, and Desktop's `contributing/not-yet-implemented.md` is out of date in five places. Do these in the same commit as the `@elek-io/core` bump.

1. Drop the summary input and the `SUMMARY_MAX_LENGTH` derivation at `report-dialog.tsx:71`. It reads `createBugReportSchema.shape.summary.maxLength` at module scope and now throws a `TypeError`, crashing the renderer rather than failing to compile.
2. Bind the email input to `user.email` and build the `user` block from a `user.get()` prefill, instead of `contactEmail`.
3. Rename `describeClient(): ReportClient` and the field it fills to `desktop`, naming the type locally as `CreateReportBase['desktop']`.
4. Add `id: null` to the profile form's `defaultValues` in `user/profile.tsx`. Runtime-only, `tsc` will not catch it.
5. Add `VersionSkew` and `RateLimited` to the `satisfies Record<CoreErrorType, true>` map in Desktop's `src/shared/ipcError.ts`.

Items 1 and 4 are the dangerous ones, because both are runtime failures a type check passes. Desktop does not have to wait for Cloud: a send against a Cloud that has not built the endpoint fails as `PreconditionFailed`, which is the case the dialog already keeps the user's text through.

## Testing

Core's suite has no HTTP mocking and does not need one. `hono` and `@hono/node-server` are already dependencies, so the fake Cloud is a real server:

```ts
const server = serve({ fetch: app.fetch, port: 0 });
const core = new ElekIoCore({ cloud: { url: `http://localhost:${port}` } });
```

Port `0` rather than the `31310 + poolId` scheme `src/test/setup.ts` uses for the local API, so parallel workers cannot contend at all.

What to cover:

- The body shape, asserted on the server side: `reporter` filled from `user.get()`, `contactEmail` overriding `reporter.email`, `core.version` matching `coreVersion`, `logs` present only when `includeLogs` is true.
- `reporter: null` when no User is set, and the call still succeeds.
- Every row of the mapping table: 400, 401, 403, 413, 429, 500, a server that never answers (timeout), and a closed port (connection refused).
- A 201 with a body that fails `reportSchema` throws `Internal`.
- **The report body never reaches the log file.** A rejected report logs at the service boundary, so assert the user's message text does not appear in `pathTo.logs`. The whole feature is a privacy feature, so this regression test earns its place.

## Open questions

- ~~`osRelease` in the `core` block~~ **Decided: include it.**
- ~~`core.logger.tail()` public or internal~~ **Decided: public.**
- ~~A `local` tier on the log record~~ **Decided: no, drop the bodies. Recorded in [`logging.md`](../contributing/logging.md).**
- Does Cloud want an `Idempotency-Key`? Core can generate one per `create()` call, but a user pressing Send again after a timeout produces a new key, so it only dedupes Core-internal retries, and Core does not retry. Probably not worth it.
- Retention of an attached log blob is Cloud's open question and stays there. Core's answer is to keep the blob small and honest, which phase 0 and phase 1 do.
- **Should Core generate its Cloud client from Cloud's OpenAPI document?** Not yet, because Cloud has no Management API to describe, but worth deciding before the second endpoint. Cloud is on Hono, so `@hono/zod-openapi` emits a document from the route definitions rather than a hand-written one that drifts, which is what Core's own local API already does through `.doc('/openapi.json')`. Two things it does not give for free. A generated client is a snapshot, so it only says Cloud changed when it is regenerated: the alert is regeneration running in CI and failing on a diff, not the client itself. And OpenAPI is lossy against zod, since a `.refine()` such as `versionSchema` arrives as a plain string, so Core keeps parsing the response at runtime whatever the types say. The alternative for two repositories under one roof is sharing the zod schemas directly, which loses nothing in translation and costs a package coupling instead. Either way `reportRequestSchema` is what Cloud should build its route against, so the eventual document agrees by construction.
