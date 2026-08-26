# JSDoc review

Review every JSDoc block in Core against the documentation rules: is one there, is it correct, does it only restate the signature, and does what it cannot hold have a `contributing/` or `docs/` file to live in. This is the first of two review passes, the second covers the content of `docs/` and `contributing/` themselves.

Read [`../contributing/documentation.md`](../contributing/documentation.md) first, in particular the JSDoc section. Everything here assumes it.

The pass runs in four phases. Phases 1 and 2 are one session and are described in full below. Phases 3 and 4 are sketched, and get their own briefs once phase 2 has produced the exemplar they depend on.

## Where the work sits

Rough greps, not exact counts. Re-measure rather than trusting these:

| Measure                               | Count |
| ------------------------------------- | ----- |
| Non-test source files                 | 91    |
| Public methods and exported functions | 229   |
| Of those, preceded by a JSDoc block   | 177   |
| So, apparently undocumented           | 52    |

Four of these rules already run in `pnpm test` and `pnpm lint`, so do not review what they cover: block length, the allowed tag set, `@see` targets resolving, and `@todo` carrying an issue URL.

## Phase 1, make coverage a rule

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

## Phase 2, calibrate on four files

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

## Phase 3, analysis across the repository, later

Fan out per file, findings only, using the shape and exemplar from phase 2. No agent writes JSDoc. Synthesize the `overflows` findings centrally, because the useful output is "these six files all need something about X, so write one doc", which no single file can see.

## Phase 4, writing, later

One session, serial, one voice. Parallel writing would produce as many dialects as there are agents, which is the problem the documentation rules exist to prevent.

## What to escalate

Do not resolve these alone, collect them and report them back to Nils:

- Any definition of `jsdoc/documented-export` that is either noisy or trivially small, with the counts that show it.
- A JSDoc block that looks `wrong` in a way that suggests the code is the thing at fault.
- A new `contributing/` doc that phase 2 thinks is needed, before writing it.

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
