# Two promises the code does not keep

Analyse two bugs the JSDoc review turned up and recommend an approach for each. Both are shipped, both are consumer facing, and neither is a comment problem. **This session writes no fix.** It produces the analysis and the recommendation, in this file, and stops.

They are handled together because they are the same shape: a doc states a guarantee, nothing checks it, and the code drifted away. That has now happened four times in this repository, so a third question is whether the shape itself has a common answer.

## What is already verified

Do not spend the session re-establishing these. Verify anything you intend to build on, but start from here:

| Fact | Where |
| --- | --- |
| The API logger writes `c.req.url` into `url.full` and into the message string, on both request and response, so four sites | `src/api/middleware/requestResponseLogger.ts` |
| Five routes carry `{collectionIdOrSlug}` or `{componentIdOrSlug}` in the path | `src/api/routes/` |
| A slug is `slugify()` of a name a User typed | `src/util/shared.ts` |
| The privacy sweep covers a Project name lifecycle only, never the middleware | `src/service/logPrivacy.test.ts` |
| `Fs.readFile` throws a raw ENOENT, which is not a `CoreError` | `src/service/JsonFileService.ts` |
| `fromUnknown` hardcodes `'Internal'`, so that ENOENT becomes a 500 | `src/util/shared.ts` |
| The API returns `err.statusCode`, so a missing Entry answers 500 | `src/api/lib/util.ts` |
| A comment already contradicts itself about this, mid-sentence | `src/service/ReferenceService.ts` |

## Bug 1, the API logger writes a User-typed slug into a log file

A log file can be handed to someone else, and `core.logger.tail()` puts a window of one into a report. [`../contributing/logging.md`](../contributing/logging.md) bans "anything a User typed, not only what they wrote into a field". A Collection named `Meine Blogbeiträge` reaches the file as `meine-blogbeitrage`.

Settle this first, because it decides what the fix is. `logging.md` explicitly allows "field slugs" in the same list that bans names. A field slug is also `slugify()` of something a User typed, so either the allowance is wrong or a slug is not the thing being banned. One of those has to give, and the answer changes whether this is a four line fix or a policy change.

Then work out:

1. What replaces the URL. Hono's matched route pattern, the URL with slug segments redacted, or method and request id with no path at all. If it becomes a pattern, `url.full` is the wrong attribute name and OpenTelemetry's `http.route` is the right one.
2. Whether query strings can carry User text on any route, not just the path.
3. What else the last sweep missed. It found nothing here, so "what other surface does it not reach" is worth more than this one middleware.
4. What to say about log files already written. They cannot be changed, but `core.logger.tail()` reads them back.

## Bug 2, a missing entity throws Internal where the contract says NotFound

Reading a missing Entry throws `Internal` and the local API answers 500, while [`../docs/error-handling.md`](../docs/error-handling.md) documents `NotFound` and the OpenAPI contract says 404.

Work out:

1. Where the wrap belongs. `JsonFileService.read` is the one place that knows the file is missing but not which entity it was. Each service read knows the entity but repeats the catch. `fromUnknown` inspecting the error code is the smallest change and the most action at a distance, because a missing temp file mid-write is genuinely internal. Give the trade-offs, then pick.
2. Every read this affects, not just Entry. `ComponentService` reportedly answers both ways for the same condition, so establish which is right before making them agree.
3. Whether removing the defensive double-catch in `ReferenceService` changes how dangling references are skipped. That is the behavior risk in this fix.
4. Whether the OpenAPI spec declares 404 on the affected routes today, and whether any test asserts it.
5. Whether this is breaking. A consumer branching on `statusCode` sees 404 where it saw 500, so it likely wants a changeset.

## What to produce

Append to this file, one section per bug:

- The blast radius, meaning every call site and consumer the change reaches.
- Two or three candidate approaches with their trade-offs, not one.
- A recommendation, and what it costs.
- **The check that stops it recurring.** Both bugs existed because nothing tested the promise. A fix without a test leaves the next drift undetected, so treat the check as part of the recommendation rather than a follow-up.

Then a short closing section on the shape they share. Four times now a doc has promised something no check enforced. Say whether that is four coincidences or one gap, and if it is one gap, what would close it.

## What to escalate

Do not resolve these alone, collect them and report them back to Nils:

- The field slug question, if the answer is that `logging.md` is wrong rather than the code.
- Any third bug found while tracing these two.
- A recommendation that turns out to be a breaking change for Desktop, which consumes `CoreErrorType` directly.

## See also

- [`../contributing/logging.md`](../contributing/logging.md) - what a log file may contain, and the field slug allowance to resolve
- [`../docs/error-handling.md`](../docs/error-handling.md) - the `NotFound` promise, and the table of types and status codes
- [`../contributing/error-handling-internals.md`](../contributing/error-handling-internals.md) - `validated()`, the mutation envelope and where errors are wrapped
- [`jsdoc-review.md`](./jsdoc-review.md) - the review that surfaced both

---

# Analysis

Written 2026-08-26. Everything below was verified by running the real code, through throwaway test files that were removed afterwards. Where a claim in the brief turned out to be off, the correction is stated rather than worked around.

## First, the field slug question

It decides the fix, so it goes first.

A field slug is not derived by Core. A Collection's `slug.singular` and `slug.plural`, a Component's `slug`, and a field definition's `slug` are all supplied by the caller and validated against `slugSchema` ([`../src/schema/baseSchema.ts:122`](../src/schema/baseSchema.ts#L122)), then `CollectionService` and `ComponentService` run `slug()` over the entity ones. So a field slug is exactly as User-typed as a Collection slug is, and provenance cannot be what separates them. One of the two lines in `logging.md` has to give.

What survives as a distinction is not who typed the string but what it names:

- A **field slug names a position in the content model**. It is the same string for every Entry in the Collection, and it is the substitute `logging.md` explicitly asks for in place of the payload: "12 Values, languages `en` and `de`, changed `title` and `body`". Take it out and `elek.entry.value.slugs` has nothing left to say.
- An **entity slug names one object that already has a UUID on the same line**. That is precisely the argument the document makes against names, and a Collection slug is a rename of the Collection's name rather than a different kind of thing.

So the recommendation is that `logging.md` is not wrong, it is underspecified. The allowance should say a field slug is allowed because it is a name in the model rather than a name of an object, and the ban should say it covers a slug that identifies a Project, Collection, Component, Entry or Asset. That makes the fix a code fix.

The strict reading is available and is not unreasonable: "anything a User typed" bans both, `elek.entry.value.slugs` comes out of `logAttributeNames`, and the migration line falls back to `elek.entry.value.count` alone. **Escalated**, because it is a policy call, not an analysis one.

Worth knowing either way: the suite does not currently encode an answer. `logSweep.test.ts` plants a sentinel in every name but uses the literal slugs `products`, `hero` and `title`, so no slug in that test carries a sentinel at all.

## Bug 1, the API logger writes a User-typed slug into a log file

### Blast radius

Confirmed against a running `createTestApi` with a real Project, not read off the source:

- **It reaches the file on a 200, not only on an error.** A `GET` for a Collection by slug wrote the slug into both records, in `message` and in `url.full`. Four sites, as the brief said.
- **Five routes carry a slug segment**: [`collections.ts:105`](../src/api/routes/content/v1/collections.ts#L105), [`components.ts:105`](../src/api/routes/content/v1/components.ts#L105), [`entries.ts:17`](../src/api/routes/content/v1/entries.ts#L17), [`entries.ts:81`](../src/api/routes/content/v1/entries.ts#L81), [`entries.ts:128`](../src/api/routes/content/v1/entries.ts#L128).
- **The query string is a second, wider hole.** `c.req.url` is the raw request URL. Zod validates `limit` and `offset` and nothing strips what it did not declare, so `?q=Was%20ich%20tippte` lands verbatim in the log on **every** route, including the ones with no slug segment. Verified against hono 4.12.32 directly.
- **An unmatched path is logged too.** `api.notFound` answers `Not Found - ${c.req.path}` and the response record still carries the full URL, so a mistyped slug is in the file as well.
- **Nothing downstream takes it out.** `LogService`'s masker covers a git signature, a credential before `@` in a URL, a bare email address and the home directory. A path segment and a query string pass through untouched, so the slug survives `tail()` and reaches elek.io Cloud inside a report.
- **Anyone on the machine can write into the log.** elek.io Desktop starts the API from `localApi.isEnabled`, and `LocalApi.start()` binds every interface (already on the JSDoc escalation list), so any process that can reach the port can put a string of its choosing into the User's log file.

### What else the sweep does not reach

Tracing this turned up three more leaks of the same class, all in the service layer, all invisible to `logSweep.test.ts` because it never takes an error path with a sentinel in it. All three verified by reading the log file back.

| Where | What reaches the file | Why the sweep misses it |
| --- | --- | --- |
| [`CollectionService.ts:162`](../src/service/CollectionService.ts#L162) and `:458`, [`ComponentService.ts:160`](../src/service/ComponentService.ts#L160) and `:404` | `Collection slug "<slug>" is already in use by another collection`. Thrown inside the `mutating()` body, so `validated()` logs it at `error` | The sweep never provokes a slug clash |
| [`schemaFromFieldDefinition.ts:109`](../src/schema/schemaFromFieldDefinition.ts#L109) | `expected "<canonical>"`, where `canonical` is `slug()` of the Entry value the User typed. It goes into the `ZodError`, and `parseOrThrow` logs `parsed.error.message` | The sweep has no slug field and never fails a validation with content in it |
| [`AssetService.ts:437`](../src/service/AssetService.ts#L437) and `:444` | `Unsupported MIME type of file "<filePath>"`, so the file name the User chose | The sweep plants `sentinel.assetFile` for exactly this and passes only because it never sends an unsupported type |

The second one is **authored Entry content**, not a name, so it is on the never list whichever way the field slug question goes. It also narrows the "zod 4 `error.message` does not serialize the failing input" check from the earlier privacy pass. That still holds, re-verified against zod 4.4.3: no issue code puts the input value in the serialized issue. It does not hold for a message Core writes itself inside a `superRefine`, which is what this is.

A fourth site is one refactor away rather than broken today. [`AbstractSlugIndexedEntityService.ts:161`](../src/service/AbstractSlugIndexedEntityService.ts#L161) throws `<Type> not found: "<idOrSlug>" does not match any ...`, and `idOrSlug` is unvalidated caller input, so it is not even constrained to a slug. It stays out of the file only because `resolveCollectionId` and `readBySlug` are not wrapped in `validated()`. That is luck, not design.

### Candidate approaches

**A. Log the matched route pattern as `http.route`, plus the ids.** The pattern is a compile-time constant, so nothing a User typed can appear in it by construction.

Mechanics, verified against hono 4.12.32: `compose` sets `req.routeIndex` per handler and never restores it, so inside the middleware `routePath(c)` is `/*` before `next()` and the matched pattern (`/content/v1/projects/:projectId/collections/:collectionIdOrSlug`) after it. The request record can have the pattern too, because `matchedRoutes(c)` already holds it before `next()` and the middleware entries are the ones registered as `ALL /*`. An unmatched path has no pattern at all and needs a literal.

Cost: `url.full` leaves `logAttributeNames` and `http.route` enters it, the two records rejoin on `elek.request.id`, which is already on both. It loses which Collection was asked for, recoverable for the UUID form by writing `elek.collection.id` only when the segment parses as a UUID.

**B. Keep `url.full`, redact the path.** Rewrite every segment that is not a route literal to `[redacted]` and drop the query string. To know which segments are parameters it needs the route pattern anyway, so it is A with an extra step, unless it guesses from the shape of each segment. A guess is the failure mode `logging.md` already rejects for the sink, a matcher that has to be right every time. It also leaves the attribute name lying, since `http://localhost/content/v1/<uuid>/collections/[redacted]` is not a URL anyone can use.

**C. Method and request id, no path.** Safe by construction and the smallest diff. It also costs the most: a file that says `GET` forty times cannot answer what a build asked for, which is the one question a request log exists to answer.

### Recommendation

**A.** It is the only one that keeps the record diagnostic while making the leak structurally impossible, and `http.route` is the Semantic Convention name for exactly this, "the matched route, that is, the path template in the format used by the respective server framework". The rename is the honest half: `url.full` holding a pattern would be the same lie `logging.md` calls out for `os.type` carrying a Node value.

On the query string, log none of it. `limit` and `offset` are the only declared parameters and a reader gets both from the paginated response the request produced.

On log files already written, do nothing. They age out in 30 days, `tail()` reads 24 hours, so the exposure closes on its own. Do **not** add a URL scrubber to the sink to cover the gap. `logging.md` is explicit that the sink is for records Core did not author, and a permanent rule saying the call site is allowed to be wrong costs more than one day of a leak that is already shipped.

### The check that stops it recurring

Two, because two different things failed.

1. **Extend `logSweep.test.ts` to the API.** It never calls a route, which is the whole reason a test written to find this class of leak found nothing here. Give the sweep's Collection and Component a slug built from the sentinel, then drive `createTestApi` over all fifteen routes, plus one request carrying an undeclared query parameter and one unmatched path. That covers this leak, the query-string leak and the notFound record in one addition, and it covers the sixteenth route when someone adds it.
2. **Assert the attribute is gone, not merely unwritten.** `logTail.test.ts` already asserts that no name in `logAttributeNames` matches the secret denylist. The same file is where "`url.full` is not a name Core writes" belongs, so the removal is enforced rather than remembered.

Then do what `logging.md` says to do with a new sentinel test: log the sentinel deliberately once, watch it go red, take it out again.

## Bug 2, a missing entity throws Internal where the contract says NotFound

### Blast radius

Measured, one call per row:

| Call | Today |
| --- | --- |
| `entries.read`, `collections.read`, `components.read`, `assets.read`, `projects.read`, missing UUID | `Internal` 500 |
| `collections.readBySlug`, `components.readBySlug`, unknown slug | `NotFound` 404 |
| `entries.list`, `entries.count`, `collections.list`, `assets.list`, missing parent | `Internal` 500 |
| `entries.history`, missing Entry | no throw, empty |

Two corrections to the brief.

**It is not a `ComponentService` quirk, and the fork is not the entity type.** Every entity read answers `Internal` by UUID and `NotFound` by slug. The reason is [`AbstractSlugIndexedEntityService.resolveId`](../src/service/AbstractSlugIndexedEntityService.ts#L127): a UUID whose folder does not exist falls through to `lookupBySlug`, which throws a proper `NotFound`. So the two answers come from two code paths for the same condition, and the slug path is the one that is right.

**The API is less broken than the services, and differently.** Because the Collection and Component get-one routes resolve before they read, they answer 404 for both forms. What answers 500 is:

- `GET /content/v1/projects/{projectId}` for a missing Project
- `GET /content/v1/projects/{projectId}/assets/{assetId}` for a missing Asset
- `GET /content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/{entryId}` for a missing Entry
- every list and count route under a missing `{projectId}`

**On the OpenAPI contract.** It does not say 404. No route declares any response other than `[200]`, so the document promises nothing about errors and the generated client carries no error member. The 404 promise lives only in [`../docs/error-handling.md`](../docs/error-handling.md) and in [`../docs/local-api.md`](../docs/local-api.md), whose example envelope is literally `"type": "NotFound", "statusCode": 404`. No test asserts a 404 for a missing entity. `api.test.ts:343` asserts one for an unknown route, which is hono's own `notFound` handler and unrelated.

### The bigger half, found while tracing this

`core.entries.create` and `core.collections.create` against a Project that does not exist throw a **raw Node `Error`**, not a `CoreError`. Verified.

The cause is the two-stage parse. `readProjectLanguages` and the Collection read run between `parseOrThrow` and the `mutating()` call, outside any `validated()`, so nothing converts what they throw. [`../docs/error-handling.md`](../docs/error-handling.md) opens with "All services throw `CoreError` on failure", and [`../contributing/error-handling-internals.md`](../contributing/error-handling-internals.md) documents the two-stage parse without noting that the gap between the stages is unguarded. It is the same class as the `getValueSchemaFromFieldDefinition` raw `Error` already on the JSDoc escalation list.

This matters for the choice below, because it rules one candidate out.

### Candidate approaches

**A. Wrap in [`JsonFileService.read`](../src/service/JsonFileService.ts#L58).** Catch `ENOENT` and throw `CoreError.notFound`. Same for `unsafeRead`.

It is the one place that knows the file is missing, and every entity read already goes through it. It does not know which entity, so the message stays the path, which already names the type and carries the ids. The "a missing temp file mid-write is genuinely internal" objection does not apply here: every call site is an entity, Project or User file, and nothing reads a temp file through this method.

It also fixes the raw-`Error` case for free, and turns it into the right answer, because `readProjectLanguages` reads through the same method.

**B. `fromUnknown` inspects the error code.** Smallest diff, one function, most action at a distance. Every unknown `ENOENT` anywhere becomes a 404, including a missing git binary and a path Core built wrong, which is where a 404 hides a real bug. Worse, it fixes less than it looks: `fromUnknown` only runs inside `validated()`'s catch, so it reaches neither `ReferenceService`'s direct reads nor the unguarded gap in the two-stage parse. **Rejected.**

**C. Per service read.** Each `read` catches and rethrows with the entity and id in the message. Best message, `Entry "<uuid>" not found in Collection "<uuid>"`. Repeats the same catch at nine call sites and drifts the day a tenth appears, which is the exact failure this plan is about.

### Recommendation

**A**, plus closing the two-stage gap in the same pass.

The wrap in `JsonFileService` is one place, it is the place that knows, and the path in the message already carries what C's nicer message would spell out. Closing the gap means everything between `parseOrThrow` and the `mutating()` call runs inside a boundary rather than outside one, either by moving those reads in or by giving them the same wrapper. Do both together, because they are one promise, and A alone leaves the next unguarded pre-read to fail the same way.

**On `ReferenceService`'s double catch.** Keeping it changes nothing, removing it would. `isNotFoundError` accepts a `CoreError` of type `NotFound` and a raw `code === 'ENOENT'`. Today only the second fires, because `checkAsset` and `checkEntry` read through `jsonFileService` directly. After the wrap only the first fires. Leave both branches. What is wrong there is the comment, and that row is already on the JSDoc list. One thing to hold in mind when it is written: `findDanglingReferences` tests existence with `Fs.pathExists` rather than a read, so the wrap does not touch it at all.

**Is it breaking.** Yes, and it wants a changeset.

- A consumer branching on `type` or `statusCode` sees `NotFound` and 404 where it saw `Internal` and 500, for a missing Entry, Asset or Project. That is the documented behavior arriving, but it is still a behavior change on a shipped version.
- **Not breaking for elek.io Desktop at the type level.** It consumes `CoreErrorType` as `satisfies Record<CoreErrorType, true>` in its `src/shared/ipcError.ts` (elek.io Desktop repository), and no type is added or removed, so it keeps compiling and its existing `NotFound` arm starts being reached. Worth telling them anyway, since a dialog that said "something went wrong" starts saying "not found".
- The raw-`Error` half is strictly a fix. A caller that only catches `CoreError` misses those two throws entirely today.

### The check that stops it recurring

An error contract test, next to the log sweeps, driven by a table rather than by hand:

- One row per entity, both the UUID form and the slug form, asserting `NotFound` for a read of something that is not there. That is what makes the two paths agree and keeps them agreeing.
- One row per public method that can be made to fail, asserting the thrown value is a `CoreError` and nothing else. This is the row set that catches the raw-`Error` class as a class instead of one instance at a time, and it is the only thing that would have caught the two-stage gap.
- One row per API route, asserting the status the type maps to.

The cheaper structural half is worth doing at the same time. [`statusCodes`](../src/util/shared.ts#L71) is the single source of truth for the type to status mapping, and `docs/error-handling.md` restates it by hand and is already wrong ("8 typed variants" over nine rows, already on the JSDoc list). A rule in `src/test/documentation.ts` that parses that table and compares it against `statusCodes` closes the restating half permanently, exactly the way `logAttributeNames` plus its sweep closed the attribute vocabulary.

## The shape they share

One gap, not four coincidences.

Core already has a mechanism for documentation that a machine can check: 23 rules in [`../src/test/documentation.ts`](../src/test/documentation.ts) behind a shrink-only baseline. Every one of them reads text. All four drifts are promises about **behavior**, and no text rule can see behavior.

The evidence that this is the gap rather than bad luck is that the behavioral promises which do have a check have not drifted. The log privacy invariant has sentinel sweeps, the level policy has `logLevels.test.ts`, the attribute vocabulary has a declared list plus a sweep, and none of them has gone wrong. The ones that drifted are the ones that exist only as prose: "all services throw `CoreError`", "redaction reaches error messages", "every entity create, update and delete is wrapped in `withGitRollback`", "a missing entity is `NotFound`", "the CLI wraps every action in try/catch". Every one of those is a sentence with nothing underneath it.

So what closes it is not a new kind of test. It is applying the two shapes that already work to the promises that do not have them:

1. **Declare the contract in code and assert the prose against it.** `logAttributeNames` is the working example, `statusCodes` is the obvious next one. Anything that is a table in a doc and a literal in the source qualifies, and the check is a documentation rule, so it is cheap and instant.
2. **One sweep per invariant, not one test per call site.** `logSweep.test.ts` is the working example: one expensive setup, exercise everything, assert the invariant over what came out. An error contract sweep is the same shape for the `CoreError` promise. A sweep is what catches the call site added next year, which is the failure mode review does not cover.

With one lesson from this session attached to the second: **a sweep has to enumerate its surfaces rather than exercise the ones its author happened to think of.** The API leak hid from a test written specifically to find that class of leak, purely because nobody wired the API into it.

Neither would have caught these two on the day they were written, since both predate the doc or the sweep that should have held them. What they do is catch the fifth.

## Escalated

Collected here rather than resolved, per the brief.

1. **The field slug question.** The recommendation above is that `logging.md` is underspecified rather than wrong, and that the fix is in the code. The strict reading, which bans a field slug too and takes `elek.entry.value.slugs` out of the vocabulary, is defensible and is a policy call.
2. **Three further leaks of the same class**, all verified: the slug-clash `Conflict` message in `CollectionService` and `ComponentService`, the canonical slug message in `schemaFromFieldDefinition` (which is authored Entry content, so it does not wait on question 1), and the unsupported MIME type message in `AssetService` carrying the source file name. Plus one that is a refactor away, `lookupBySlug`'s message holding unvalidated caller input.
3. **A raw `Error` escapes `entries.create` and `collections.create`** against a missing Project, against the first sentence of `docs/error-handling.md`. Folded into the bug 2 recommendation above, flagged here because it is a separate bug from the one the brief describes.
4. **Not breaking for Desktop at the type level**, so no coordination is required before shipping bug 2's fix. Worth a line in the bump notes anyway, because the dialog copy a User sees changes.

---

# Status

Bug 1 is fixed on this branch. Everything else in this plan is still open, so the plan stays.

## Done, bug 1

Approach A with the id write-back, plus the policy question settled the way the analysis recommended.

- [`requestResponseLogger`](../src/api/middleware/requestResponseLogger.ts) records `http.route`, the matched route pattern, and the ids the request addressed. It no longer touches `c.req.url`, so neither a slug segment nor a query string can reach a log file.
- A path parameter is written only when it parses as a UUID, since `c.req.param` returns the raw segment whether or not the route's schema accepted it.
- The five routes that accept a slug leave the id they resolved in `c.var`, so a slug lookup stays resolvable. `elek.request.lookup` records `slug` or `id`, so a reader is not misled into thinking every request was an id lookup.
- `url.full` is out of `logAttributeNames` and `http.route` is in, along with `elek.asset.id`, `elek.component.id`, `elek.entry.id` and `elek.request.lookup`.
- [`../contributing/logging.md`](../contributing/logging.md) now says an entity slug is a name and a field slug is not, with the reason being what the string names rather than who typed it.

The check: [`logSweep.test.ts`](../src/service/logSweep.test.ts) drives every route through `createTestApi`, with a sentinel in the Collection and Component slugs, one undeclared query parameter and one unmatched path. Its field definition slug is deliberately not a sentinel, which is where the policy decision is encoded. Verified it can fail: putting `c.req.url` back turns exactly four sentinels red and nothing else.

## Done, the three sibling leaks

The root cause was one thing rather than three: **a `CoreError` message is written for whoever made the call and then logged verbatim**, so one string serves two audiences under different rules. Fixed at the throw site, which is where `logging.md` says the decision belongs.

- The slug clash in `CollectionService` and `ComponentService` now names the id of the entity holding the slug, which the caller does not know, instead of the slug, which they just sent. A better message as well as a safe one.
- `AssetService.getFileType` no longer names the file. The path is the one the User picked on their own disk, so it carries the name they gave it.
- Zod is the case that cannot be fixed one message at a time, because an issue message is authored by whichever refinement raised it. `AbstractService` logs a Zod failure as its shape instead, the path and code of each issue and nothing either said. The thrown error keeps the full message, so a slug field still tells the caller the canonical form it wanted.

That last one closes the whole class, not just the one leak found: any refinement message added later is covered.

The check: the sweep now provokes all four rejections with a sentinel in each. Verified red first, on exactly those four sentinels and no others.

Two more things `logging.md` was underspecified on, both settled the same way as the slug question, by what the string names rather than who typed it:

- **A path Core built from ids is allowed, a path the User chose is not.** The sweep already encoded this by banning the Asset source file name, while the doc said "file paths" without qualification.
- **An error message has two audiences**, with the rule that a message may not repeat the caller's own string back.

## Still open

1. **Bug 2**, unchanged. The wrap belongs in `JsonFileService.read`, and the raw `Error` escaping `entries.create` and `collections.create` goes with it.
2. **The error contract test** and the `statusCodes` documentation rule, which are bug 2's half of the recurrence check.

Worth knowing for whoever picks up 1: `AbstractSlugIndexedEntityService` logs a caught `error.message` in two warn calls, `safeWriteSlugIndex` and `rebuildSlugIndexInternal`. Neither is reachable with a User's string today, since both only ever see Core-written files, so they were left alone rather than routed through the same helper.
