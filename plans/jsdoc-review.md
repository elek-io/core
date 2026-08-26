# JSDoc review

Review every JSDoc block in Core against the documentation rules: is one there, is it correct, does it only restate the signature, and does what it cannot hold have a `contributing/` or `docs/` file to live in. This is the first of two review passes, the second covers the content of `docs/` and `contributing/` themselves.

Read [`../contributing/documentation.md`](../contributing/documentation.md) first, in particular the JSDoc section. Everything here assumes it.

The pass runs in five phases, one session each. Phases 1 to 3 are done, their sections are kept because phase 4 reads the exemplar and the rule they produced. Phase 4 is the next session, and it writes from [`jsdoc-findings.md`](./jsdoc-findings.md).

## Where the work sits

Measured after phase 1. Re-measure rather than trusting these:

| Measure                                       | Count |
| --------------------------------------------- | ----- |
| Non-test source files                         | 92    |
| JSDoc blocks in them                          | 613   |
| Symbols the coverage rule wants a block on    | 271   |
| Of those, still missing one                   | 57    |
| Files holding those, exempted in the baseline | 24    |

Six rules already run in `pnpm test` and `pnpm lint`, so never report what they cover: a missing block, a stale `Class.member` reference, block length, the allowed tag set, `@see` targets resolving, and `@todo` carrying an issue URL.

## Phase 1, make coverage a rule (done)

Coverage is mechanical, so it belongs in a check rather than in a review. Add a `jsdoc/documented-export` rule to [`../src/test/documentation.ts`](../src/test/documentation.ts), alongside the existing `jsdoc/*` rules, and give it a baseline the way every other rule has one.

Decide what the rule requires by measuring, not by guessing. Try at least these three definitions, report the count each produces, then pick one and record the reasoning in the rule's own JSDoc:

1. Every `export`ed symbol.
2. Exported functions, exported classes, and `public` methods on exported classes.
3. The same as 2, but only for symbols reachable from the four entry points.

Definition 1 is almost certainly wrong, and it is listed so you can see how wrong. The danger is real: `contributing/documentation.md` says never restate a type or a parameter name, so a rule that demands a block on everything manufactures exactly the noise the rules ban. A definition that lands somewhere near 50 items is plausible. One that lands near 500 is not.

Likely exclusions, though confirm each against the source rather than taking them on trust:

- Constructors, which the class block already covers.
- Property assignments that group methods, such as `public branches = {` in `GitService`. The methods inside are what need blocks.
- `private` and `protected` members.
- Overload signatures, where the implementation carries the block.
- Pure re-export barrels.
- Test files and `src/test/`.

Whether an exported type, interface or zod schema needs a block is a genuine question, not an oversight. A type's shape is often its own documentation. Measure both ways and say which you chose.

Done when the rule exists, its baseline is generated and committed, `pnpm test` and `pnpm lint` pass, and the baseline is the work list phases 3 and 4 will burn down.

## Phase 2, calibrate on four files (done)

Do not fan out over 91 files until a good finding and a good JSDoc block have a worked example. Review these four by hand, one from each kind of file in the repository:

- [`../src/service/EntryService.ts`](../src/service/EntryService.ts), a service
- [`../src/schema/fieldSchema.ts`](../src/schema/fieldSchema.ts), a schema
- [`../src/astro/loaders.ts`](../src/astro/loaders.ts), a consumer facing Astro export
- [`../src/util/node.ts`](../src/util/node.ts), a util

For each file, produce findings in this shape, and nothing else:

```text
file:line  symbol  kind  what to do
```

`kind` is one of five, and a finding that fits none of them is not a finding:

- `missing`, no block on a symbol the phase 1 rule requires one for.
- `restates`, the block says only what the signature already says.
- `wrong`, the block contradicts what the code does.
- `stale`, the block describes behavior that has since changed.
- `overflows`, the explanation does not fit a block, and either no `contributing/` doc covers it or the one that should does not say it yet.

"Could be phrased a little better" is not a finding. The bar is that a reader is misled, or is missing something they need.

Then write the exemplar. Pick two or three symbols across the four files, one of them an `overflows` case, and write the JSDoc you would want every agent in phase 3 to imitate. Append them to this plan under a new "Exemplar" section, with a sentence each on why they are shaped the way they are. That section is what phase 3's brief will hand to every agent.

Do not rewrite JSDoc anywhere else. Phase 2 produces findings and an exemplar, not edits.

## Phase 3, analysis across the repository (done)

Review all 92 non-test source files and produce one findings list. **No agent writes or edits JSDoc in this phase.** Phase 4 does the writing, serially, so the repository ends up with one voice rather than one per agent.

92 files is more than one context reads carefully, so fan out. One agent per file for the services and schemas, one per small directory for the rest, is a reasonable split. Whatever you choose, every file is covered, and a file deliberately skipped is named in the output with the reason.

### What every agent needs

Give each agent the JSDoc section of [`../contributing/documentation.md`](../contributing/documentation.md) and the Exemplar section below. The exemplar is the calibration, a finding's "what to do" should describe a block of that shape.

### What counts as a finding

Four kinds, and something fitting none of them is not a finding:

- `missing`, no block on a symbol the coverage rule requires one for. Do not hunt for these, the rule already knows them. What phase 3 adds is the "what to do", meaning what the block should say.
- `restates`, the block says only what the signature already says.
- `wrong`, the block contradicts what the code does.
- `stale`, the block describes behavior that has since changed. Symbol references are excluded, `jsdoc/symbol-reference` covers those.
- `overflows`, the explanation does not fit a block, and either no `contributing/` or `docs/` file covers it or the one that should does not say it yet.

The bar is that a reader is misled, or is missing something they need. "Could be phrased better" is not a finding. Length is not a finding either: a one line block that names the one thing a signature hides is finished, and the exemplar's `isNotEmpty` is exactly that.

### Getting the missing list

The 57 symbols are exempted by file in `src/documentation-baseline.json`, so the suite stays green and will not print them. Read them out of the rule directly rather than by hand, for example by running `jsdoc/documented-export` from [`../src/test/documentation.ts`](../src/test/documentation.ts) with the baseline ignored.

### Output

Write the findings to `plans/jsdoc-findings.md` and list it in [`index.md`](./index.md). One row per finding:

```text
file:line  symbol  kind  what to do
```

Group by file, ordered as the repository is. The brevity rules do not apply to a plan, so a long table is fine.

### Then synthesize

Concatenating 92 reports is not the deliverable. The `overflows` findings are the ones that only make sense together, because the useful output is "these six files all need something about X, so write one doc", which no single file can see. Close the findings file with a section that:

1. Groups every `overflows` finding by the doc it wants, naming which are new `contributing/` docs and which are missing sections in a doc that exists.
2. Counts the findings per kind, so phase 4 can be sized.
3. Names any pattern that recurs across files, the way `ReferenceService` methods attributed to `EntryService` did across six sites.

## Phase 3.5, triage the code findings (done)

Phase 3 found more than it was asked for. Alongside the 272 JSDoc findings it produced a list of 32 open cases where the code is at fault rather than the comment, and its own note says each blocks at least one row. Phase 4 cannot write a `throws` line for behavior that is itself wrong, so those 32 get sorted before any writing starts.

**This session fixes nothing and writes no JSDoc.** It verifies, sorts and sizes.

### Two were called scheduled and were not

Phase 3 set these aside as already being handled elsewhere. Nothing was handling them, and the label hid two verified bugs behind a triage exemption:

- `LocalApi.start()` calls `serve({ fetch, port })` with no `hostname`, so the API binds every interface while its log line says `localhost`.
- `mdAstLinkUrlSchema` accepts `/\evil.com`, which `new URL()` resolves to `https://evil.com/`, against a block comment promising protocol-relative URLs are rejected.

Both are fixed now, together with the other two `safety` items, and the widened URL bypass this session found reached the fix. **An item is scheduled when a plan says who does it and when, not when a triage says so.**

What this session owed them is one question: is there more of that class in the 32, and did the sweep miss any surface where the same shape could hide.

### First, reconcile

The findings were written before commits `b6907f2`, `e327d60` and `bfd111c` landed, so some rows are now false. A known one is `src/service/EntryService.ts:191`, which tells phase 4 to note that a missing Entry surfaces "rather than a typed `NotFound`". It now is one.

22 rows mention an error type and 44 mention logging. Re-check each against `HEAD`, correct it in place, and strike anything the three commits already fixed. `GitService` redaction not covering error messages is the likeliest candidate, `e327d60` may have covered it.

### Then verify and sort

Every one of the 32 is a claim from an agent, and a claim is not a finding until it reproduces. Verify each against `HEAD` before sorting it, and put anything that does not reproduce in the last bucket rather than quietly dropping it.

| Bucket | Holds |
| --- | --- |
| `safety` | a bug about what leaves the machine, what binds a port, or what a generated file can be made to contain |
| `blocking` | a code bug phase 4 cannot write around, because the behavior it would document is wrong |
| `phase-4` | a doc or comment that is simply wrong, no code change needed, so phase 4 fixes it while writing |
| `rule-gap` | a documentation check that should have caught this and did not |
| `not-a-bug` | the claim does not reproduce, with what was actually found |

Size each `safety` and `blocking` item as a one line fix, a contained change, or a design decision. That is what makes the list schedulable, and it is the part a bare bug list never gives you.

### Output

Rewrite the code-at-fault section of `plans/jsdoc-findings.md` in place as those five buckets, and correct the stale rows in the findings table above it. No new file, the whole findings file goes when phase 4 finishes.

Close with the order you would fix them in, and say which `blocking` items phase 4 could proceed without if a decision is slow.

## Phase 4, writing, later

Phase 3.5 sorted the code findings, and most of phase 4 is not waiting on them. The `phase-4` bucket, the 14 `overflows` doc edits and the 128 `restates` rows need nothing from the blocking list, and seven of the eighteen blocking rows offer to document today's behavior. Start there rather than holding the whole phase for five decisions.

Seven rows genuinely cannot be written, because their `overflows` partner asserts the opposite of what the code does. Leave those and say so in the report.

One session, serial, one voice. Parallel writing would produce as many dialects as there are agents, which is the problem the documentation rules exist to prevent.

Order the work so the docs come first: write the `contributing/` sections the `overflows` findings ask for, then the blocks that `@see` them. Burn the coverage baseline down to nothing as you go, and delete `plans/jsdoc-findings.md` and this plan when it is empty.

## What to escalate

Do not resolve these alone, collect them and report them back to Nils:

- A block that looks `wrong` in a way that suggests the code is at fault rather than the comment. Phase 2 found one of these, and it turned into five methods that broke a promise `docs/error-handling.md` makes. Phase 3 found 32 more.
- Anything in the `safety` bucket. Those do not wait for the review to finish, the four found so far are already fixed.
- A new `contributing/` doc the `overflows` findings want. Naming it is phase 3's job, writing it is not.
- A rule that fires on something that is actually fine. The rules bend to good writing, not the other way round, but that call is not the fan-out's to make.
- Any file skipped, with the reason.

## Exemplar

Written in phase 2 against real symbols. Phase 3 hands this section to every agent, so a finding's "what to do" should describe a block of this shape.

### A consumer facing method whose reasoning does not fit

[`../src/service/EntryService.ts`](../src/service/EntryService.ts), `create`, line 90. The block a consumer sees in their editor has to say what the call refuses and what it leaves behind, because neither is in the signature. The envelope itself is shared by every mutating service method, so it goes into a doc and the block points at it.

```typescript
/**
 * Creates an Entry in the given Collection, then commits it.
 *
 * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
 * `BadRequest` when a Value fails the Collection's field definitions or
 * points at something that is not there, and `Conflict` when a unique field
 * repeats a value another Entry already holds. Nothing is written unless all
 * three pass, and a failure mid-write rolls the working tree back.
 *
 * @see ../../contributing/error-handling-internals.md
 */
```

Why it is shaped this way: the first line is the only sentence that repeats the name, and it earns that by adding the commit. The rest is preconditions and throws, which the rules name as what a block is for. The `@see` carries the envelope, so the next service method does not restate it.

### A small internal helper

[`../src/util/node.ts`](../src/util/node.ts), `isNotEmpty`, line 214. A one line block is the right size here. The `@param value Value to check` it replaces was noise, and the whitespace rule is the one thing a caller cannot read off `value is T`.

```typescript
/**
 * Narrows out null, undefined and strings holding nothing but whitespace, so a
 * `filter()` keeps only values worth passing on. Whitespace counts as empty
 * here, the same rule the ELEK_IO_ resolvers above read a value by.
 */
```

Why it is shaped this way: it states the one behavior the signature hides and stops. A block does not have to be long to be worth having, and dropping the `@param` made room for the sentence that matters.

### A consumer facing export with a side effect on disk

[`../src/astro/loaders.ts`](../src/astro/loaders.ts), `elekAssetsLoader`, line 122. The loader writes files into the reader's own repository, which is the fact a tooltip has to lead with.

```typescript
/**
 * Astro content loader for elek.io Assets, which also writes their binaries
 * into the Astro project as it loads: images below `imageDir` so
 * `astro:assets` processes them, everything else below `publicDir` so Astro
 * serves it. Both default to a directory named after the Project's alias.
 *
 * An Asset landing outside those directories is still stored, with `src` or
 * `href` null and a warning, rather than failing the build.
 *
 * @see ../../docs/usage.md
 */
```

Why it is shaped this way: writing into the consumer's working tree is a side effect, so it leads. The second paragraph is the failure mode a reader would otherwise meet as a silent null. The `@see` points at `docs/`, not `contributing/`, because this block reaches a consumer through the `.d.ts`.

## See also

- [`../contributing/documentation.md`](../contributing/documentation.md) - the rules this pass applies, JSDoc section in particular
- [`../contributing/index.md`](../contributing/index.md) - the contributor docs, for placing what a block cannot hold
- [`../src/documentation.test.ts`](../src/documentation.test.ts) - how a rule and its baseline are asserted
