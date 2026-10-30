# Testing

Run the suite with `pnpm test`, watch mode with `pnpm dev`, coverage with `pnpm coverage`.

The suite is integration heavy. Most service tests create real Projects, which means real git repositories. A full run spawns several thousand git subprocesses and writes tens of thousands of small files.

Each test file writes to its own fresh data directory, `~/elek.io-test/worker-<poolId>-<runId>-<fileId>` by default, see the parallel test files section below. This profile dominates how fast the suite runs on a given machine and explains the CI choices below.

## Coverage under-reports two areas

`pnpm coverage` measures what runs inside the vitest worker. Two parts of Core run outside it, so their numbers understate what the suite exercises:

- **The Astro loaders.** The Astro suites write a content config that imports [`src/index.astro.ts`](../src/index.astro.ts) by absolute path, and `sync()` loads it through Astro's own vite pipeline. v8 attributes nothing back to the source file, so everything seven suites drive end to end counts for nothing in what [`src/astro/loaders.ts`](../src/astro/loaders.ts) reports.
- **The CLI.** [`src/index.cli.test.ts`](../src/index.cli.test.ts) spawns the built binary, which is the point: it is the only thing that proves a consumer install starts. A spawned process is not instrumented either, so the action modules look thinner than they are.

Do not close those gaps by unit-testing the same behavior in process. A test that reaches for the loader's internals to make a number move proves less than the sync-based test next to it. Add a test there when the behavior is worth proving, and accept the reported number.

The exception is behavior a sync cannot show:

- Which logger a line takes, and at which level. A build writes Core's logger and Astro's to the same console, so only a test that hands the loader its own `LoaderContext` can tell the two apart. The logger tests of [`src/astro/loaders.test.ts`](../src/astro/loaders.test.ts) run in process for that reason, not to move a number.

What a loader test can reach differs from what it cannot. `sync()` calls `load()` once, with no watcher, so anything on the dev reload path is out of reach from a test, see the hand-verified list below.

Everything a repeated build does is in reach, by syncing twice into the same root with an explicit `cacheDir` so the store survives between the two, which is how the cleaned-directory and store-pruning tests work.

## CI runner performance

CI runs the suite on four platforms, and they differ a lot in speed for this git-bound workload.

- The per-git-command latencies are averages from serial CI logs (June 2026) and describe what each platform charges per operation. They inflate under parallel contention.
- The full suite rows are the vitest durations of one serial and one parallel CI run of the same code (July 2026, when parallel test files landed).

| git command          | ubuntu 24.04 | macOS arm | macOS Intel | Windows |
| -------------------- | ------------ | --------- | ----------- | ------- |
| trivial (`show`)     | ~3ms         | ~6ms      | ~14ms       | ~29ms   |
| `clone`              | ~27ms        | ~57ms     | ~190ms      | ~288ms  |
| `merge`              | ~25ms        | ~115ms    | ~262ms      | ~330ms  |
| `lfs` operations     | ~28ms        | ~126ms    | ~335ms      | ~601ms  |
| full suite, serial   | 83s          | 176s      | 419s        | 470s    |
| full suite, parallel | 46s          | 66s       | 99s         | 218s    |

Parallel test files sped the suite up 1.8x on ubuntu, 2.7x on macOS arm, 4.2x on macOS Intel and 2.2x on Windows. These are single runs, so expect variance.

- On ubuntu fixed overhead (startup, imports) dominates, which caps the gain.
- The Intel number flatters parallelism. That parallel run also landed on a faster machine, the summed per-test time dropped by a third between the two runs, so effective concurrency was ~2.4x.
- Windows shows the contention cost most clearly, the summed per-test time rose 36% while wall clock time halved.

Findings from researching these gaps:

- **ubuntu** is the fastest on every measure and the baseline the others are compared against. Linux has the cheapest process spawn and the `git-lfs` subprocess chain barely costs extra there.
- **macOS arm** has a fast CPU but spawning processes costs noticeably more than on Linux, which shows in commands that fork helpers (`lfs` ~4.5x, `merge` ~4.6x over ubuntu). Still comfortably fast in total.
- **macOS Intel** is uniformly ~2.3x slower than the arm runners. This is the hardware itself. `macos-15-intel` is the last x86_64 image GitHub offers (until August 2027) and runs on aging Intel Macs.
  - The earlier `PerfPowerServices` 100% CPU bug ([runner-images#13358](https://github.com/actions/runner-images/issues/13358)) was fixed in the image in December 2025. Nothing actionable remains, the suite is simply slower there.
- **Windows** pays a fixed ~25ms tax per process spawn that cannot be avoided. Windows Defender is not the cause, GitHub already disables realtime monitoring on hosted images. The `windows-2025` image also removed the fast D: drive that `windows-2022` had ([runner-images#12647](https://github.com/actions/runner-images/issues/12647)).

### Decision: no I/O workarounds, generous timeouts instead

For Windows, creating a ReFS Dev Drive in CI ([samypr100/setup-dev-drive](https://github.com/samypr100/setup-dev-drive)) and redirecting test data onto it was evaluated and rejected. It would speed up the file I/O part of git operations, but no real user runs elek.io on a ReFS Dev Drive.

Tests should reproduce the environment users actually have, and an artificial filesystem setup adds room for Windows-specific behavior that real machines would not show. The slow runners are accepted as representative slow machines and the test timeout is sized for them instead.

## Timeouts

Every budget is a measured duration times one multiple. [`vitest.config.ts`](../vitest.config.ts) reads both of its budgets from [`src/test/budgets.ts`](../src/test/budgets.ts), which holds the measurements they come from.

| Budget | Bounds | Measured | Times 3 |
| --- | --- | --- | --- |
| `testTimeout` | every test | 55,872ms, the slowest single test | 167,616ms |
| `hookTimeout` | every hook | 78,796ms, the slowest fixture hook | 236,388ms |
| `timeout-minutes` in [`ci.yml`](../.github/workflows/ci.yml) and [`cd.yml`](../.github/workflows/cd.yml) | a whole job running the suite | 889s, the slowest job | 45 minutes |

All three come from one measured set, the five `windows-2025` jobs of 2026-10-23, whose suite durations ran from 529s to 710s. The set is windows-only.

- The slowest test is the one in `ReleaseService.remote.test.ts` that refuses a Release whose draft is behind the remote draft.
- The slowest hook is read as the whole duration of `logSweep.test.ts`, which holds one `beforeAll` and no other hook. Each of its 19 tests stayed below the 300ms the reporter prints a duration for, so the hook is all but the whole file.
- The multiple is 3, the smallest whole number above the run to run spread of a single test on that runner. Of the 306 tests those jobs timed at least twice, the slowest run of one test was 1.5x its own fastest at the median and 2.2x at the 90th percentile, with one test at 9.3x.

### Which runner is slowest varies, and the budgets only go up

No platform is reliably the slowest. The verification runs of the same day put `macos-15-intel` at 937s against `windows-2025`'s 474s on one commit, so the windows-only set is a floor rather than a worst case. The 900s cap in force before would have killed that 937s job.

Three things follow, and the last is a rule to follow rather than an observation:

- A budget rises as the suite gains tests, because every measurement is of a suite that had fewer of them than the next one will.
- 45 minutes clears the 937s job at 2.88x rather than the stated 3x. That is the margin the current constants buy, not a smaller multiple.
- **A slower run does not move a constant on the spot.** It supersedes it at the next re-measurement, when the whole set is taken again from a green run. Moving one number per red run chases noise and leaves the four budgets measured on four different days.

### The hook budget is paid once per test

A hook budget is per call and a `beforeEach` runs once per test, so the job cap no longer bounds the suite's worst single failure. One stuck hook can exhaust it instead of failing on a named test.

Measured on the widest `beforeEach` in `src/`, the git-doing one at `uniqueFieldEnforcement.test.ts:101`, over the 11 tests of its describe:

- 11 times 236,388ms, plus the 99s of steps before vitest starts, is 2,699,268ms against the 2,700,000ms cap.
- So the margin is 732ms. The same stuck hook cost 1m50s before the budgets were raised.

### No test and no hook carries a budget of its own

Each global bounds the slowest thing of its kind, so nothing in `src/` needs a budget of its own and the 176 that existed were dropped. [`timeout-budgets.test.ts`](../src/timeout-budgets.test.ts) fails on a new one, and also keeps the config and the job caps on the measured numbers. What it rejects:

- A budget under the global for its kind, in either form vitest takes it, a trailing argument or a `{ timeout }` option.
- A budget no check can read, such as `30 * 1000` or a named constant, since a sweep cannot compare it against the global.
- A `testTimeout` or `hookTimeout` in [`vitest.config.ts`](../vitest.config.ts) that is not the measured one, which would otherwise leave the sweep comparing against a default the suite does not run on.
- A `timeout-minutes` other than the derived one on either job that runs the suite, read from that job's own block rather than the first cap in the file.

A per-call budget below the global caps the heaviest work in a file tighter than the suite caps everything around it, which is what took single tests and hooks down on the slow runners:

- The 10s cap on the heaviest test of `index.cli.test.ts` failed on `macos-15-intel` seven times, against the 15s the suite gave every other test.
- The LFS clone in `Lfs.test.ts` passed at 9.8s on the 15s default and was killed at 15.0s on the next run, while its annotated sibling at 18.6s passed.
- Eleven budgets died over the five jobs of 2026-10-23, five of them hooks on vitest's own 10s default, which the config never raised.

When a measurement shows a test or a hook needs more, raise the global rather than that one call. Take the slowest of the four runners, put the number in [`src/test/budgets.ts`](../src/test/budgets.ts), and state it in the table above with its date.

[`published-docs.test.ts`](../src/published-docs.test.ts) is the only test that spawns the package manager, `pnpm pack --dry-run` in its `beforeAll` for the list of files a publish ships. Packing runs `prepack` and `prepare`, so adding either turns that hook into a full build on all four platforms, and whatever it writes to stdout lands in the JSON the test parses.

### A timed out test leaks into its own file only

When a test times out, vitest cannot abort its still-running async work, so leftover Projects can leak into later tests. Since every test file has its own data directory, that leak is confined to the file that timed out and cannot break other files. Generous timeouts still protect against the within-file cascade.

## Console output

The shared test Core in [`src/test/setup.ts`](../src/test/setup.ts) logs at `debug`, so every git command prints a line. `silent: 'passed-only'` in [`vitest.config.ts`](../vitest.config.ts) drops the console output of passing tests and keeps that of failing ones, which holds the context a failure needs, such as the git command a timed out hook was running.

- Without it, a CI test step printed about 49,000 lines and the failure was the last 44.
- The default reporter stays rather than `minimal`, which also drops the result line of every passing file. Those durations tell a slow runner apart from a hanging test.
- The Astro suites write Astro's own output past vitest's console capture, so it still prints.
- Run by an AI agent, vitest picks its `agent` reporter, which hides passing files whatever the config says. Unset `AI_AGENT` and `CLAUDECODE` to see what CI prints.

## Parallel test files

Test files run in parallel, one file per vitest worker. This works because no state is shared between files:

- [`src/test/workerSetup.ts`](../src/test/workerSetup.ts) is a vitest setup file. It runs in the worker process before each test file and its imports, and points `ELEK_IO_DATA_DIR` at a fresh directory, `~/elek.io-test/worker-<poolId>-<runId>-<fileId>`.
  - Every Core the file constructs without an explicit `dataDir` resolves it, including CLI subprocesses (they inherit the worker's env) and the Astro loader (it runs in-process).
  - A developer-set `ELEK_IO_DATA_DIR` is respected as the base the worker directories nest beneath, so the whole suite can still be redirected.
- Because the directory is unique per file, counts start at zero and tests may assert absolute totals. No reset step is needed between files.
- The directories live under the home directory on purpose. Using the OS temp dir would put them on tmpfs on Linux, an artificial speedup of the git-bound workload that the Dev Drive decision above already rejected. Side effect of the layout: the suite no longer touches a real `~/elek.io` at all.
- [`src/test/globalSetup.ts`](../src/test/globalSetup.ts) runs once in the main process, names the run, and sweeps the `worker-*` directories of runs that are gone, and their `.elek.io-*` directories in the repository root. In the base it removes only that prefix, so a developer-pointed `ELEK_IO_DATA_DIR` keeps its unrelated contents.
  - Directories of the current run are left in place for debugging and swept at the next start. Long watch sessions accumulate them across reruns, they are mostly empty because test files destroy their Projects.
- Tests that bind the local API take a port from `freePort()` in [`src/test/worker.ts`](../src/test/worker.ts) rather than deriving one from the worker slot. 31310 stays the documented product default and nothing in the suite binds it.
- `workerSetup.ts` also points `GIT_CONFIG_GLOBAL` at an empty file inside the worker's own data directory, so git ignores the developer's global config. CI runners carry no global identity, and one on a developer's machine once let a raw `git commit` in a test pass locally that would have failed in CI.
  - A test that commits with git directly passes its own identity through `-c user.name=` and `-c user.email=`.
- All of this relies on the vitest `forks` pool (the default), where each test file gets its own process and env. Switching to the `threads` pool would break the per-file env derivation and the `vi.stubEnv` based tests.

### Two runs in one checkout

Two runs may overlap, so every path either of them writes carries the run that wrote it, except a path under the OS temp directory, which is unique per call instead. [`globalSetup.ts`](../src/test/globalSetup.ts) names the run and puts the name in `ELEK_IO_TEST_RUN_ID`, which the workers and everything they spawn inherit. It is the suite's own variable, not one Core reads.

| What | Where | Named |
| --- | --- | --- |
| A test file's data directory | `<base>/worker-<poolId>-<runId>-<fileId>` | Per run and per file |
| The CLI tests' output | `.elek.io-<runId>` in the repository root | Per run |
| The Node entry test's relative data directory | `.elek.io-node-test-<runId>` in the repository root | Per run |
| The empty git config | Inside the test file's own data directory | Per run and per file |
| A path under the OS temp directory | `uuid()` in the name, or `mkdtemp` | Per call |

- A run id is `r<pid>-<12 hex>`. The pid says whether the run still exists, and the random part makes a recycled pid a different run, so a leftover naming this run's own pid is swept rather than adopted.
- The two directories in the repository root cannot move under the base. The generated client imports `@elek-io/core`, which resolves only by Node self-reference from inside the checkout.
- Both `.gitignore` and the `ignorePatterns` of [`.oxlintrc.json`](../.oxlintrc.json) carry `.elek.io-*`, so a leftover of a crashed run breaks neither `git status` nor a check. [`ignoreLists.test.ts`](../src/test/ignoreLists.test.ts) plants a file in both directories and fails when either list stops covering them.
- A fixed path under the OS temp directory would be shared by every run on the machine. [`tmpPaths.test.ts`](../src/test/tmpPaths.test.ts) reads the test sources and fails on a new one.
- [`concurrentRuns.test.ts`](../src/test/concurrentRuns.test.ts) starts two real runs of [`collisions.test.ts`](../src/test/collisions.test.ts) at once, over all four shared resources, and plants the leftovers whose fate the run starts have to get right.

### What a run start may remove

The sweep in [`src/test/sweep.ts`](../src/test/sweep.ts) exists for the run that crashed before its cleanup, so it has to tell a crashed run from one that is still working:

- A directory of this run stays, and so does one whose pid is still there.
- Only `ESRCH` means gone. `EPERM` means the process exists and belongs to somebody else, so a filter reading every throw as dead would sweep a live run.
- A test that means a run that is gone takes its pid from `gonePid()`, which probes until `ESRCH` answers for one. A number written into a test is an attainable pid on a machine that has been up a while, and the leftover then reads as a live run's.
- A directory whose pid reads as alive but which has not been written to for the job cap times the budget multiple is removed anyway, so a recycled pid cannot make the base grow without bound.
- A removal is retried, through `fs.rm`'s own `maxRetries` because `Fs.remove` takes no options. Which error a held file raises differs per platform, so nothing reads it.
- Another run's directory that resists removal is reported in one line and left behind, within half a second, so the worst case is one leaked directory rather than a run that stalls before its first test. A failure on this run's own directories stays fatal.
- That line carries the directory and what the removal said went wrong, the deadline included, because a permission problem and a process holding the directory send a maintainer to different places.

### One Astro suite per test file

Every `sync()` builds a full Astro pipeline inside the worker process, and the memory is not fully reclaimed between calls. Six of them in one file exhausted a 4 GB heap, so each Astro suite lives in its own file:

- [`src/index.astro.test.ts`](../src/index.astro.test.ts)
- [`.integration`](../src/index.astro.integration.test.ts)
- [`.mixed`](../src/index.astro.mixed.test.ts)
- [`.config`](../src/index.astro.config.test.ts)
- [`.collections`](../src/index.astro.collections.test.ts)
- [`.assets`](../src/index.astro.assets.test.ts)
- [`.components`](../src/index.astro.components.test.ts)

Add a new file rather than a sixth sync to an existing one. The `.integration` file sits at four syncs and is the one that hit the wall, a fifth sync in it exhausts the heap again.

Two related limits, both found the hard way:

- **`build()` does not work from a test.** Astro stages its prerender output in `<cwd>/.astro` whenever the site root sits outside the current working directory, then renames it into place. Test roots live under the OS temp directory, so that rename crosses filesystems and fails wherever `/tmp` is a separate mount.
- **`dev()` does not work from a test either.** A dev server started inside a vitest worker accepts connections but never routes, vite inside vite. It is fine in a standalone script, which is how the Astro assets behavior was verified by hand.

So Astro suites assert what `sync()` produces: the generated types, the files on disk and the content store. Anything that needs a rendered page has to be checked manually and written down instead.

### What was verified by hand

Dev-mode content watching cannot be integration-tested for the reason above, and `sync()` passes no watcher, so the suite covers the wiring in isolation ([`src/astro/watch.test.ts`](../src/astro/watch.test.ts)) and the reload path through the shared sync function. Verified by hand against a real `astro dev` on a Project with two languages, an image Asset, a PDF Asset and a slug-routed Collection:

- Editing an Entry through the programmatic API, standing in for the Desktop app, updated the open page about a second later, repeatedly, with no restart.
- Creating an Asset added it to the rendered page and served its binary.
- 25 seconds of idle produced zero additional syncs, so writing Asset binaries below `src/` does not feed the watcher back into itself.
- Adding a field definition, removing one, and adding a field to a Component each logged the model-changed warning and left the store alone. Before that check existed, the first silently dropped the field, the second failed with `InvalidContentEntryDataError` and the third did nothing at all.
- The generated types never changed in any of those runs, which is what makes the restart unavoidable rather than a shortcut.

Re-check these when touching `watch.ts`, the loaders' sync functions or the loaders' Core options.

### Git over HTTP

The suite's usual remotes are bare repositories on the local filesystem, and git skips its whole credential machinery for local paths. [`GitService.cloudGit.test.ts`](../src/service/GitService.cloudGit.test.ts) closes that gap with two fixtures and no new dependency:

- [`src/test/gitHost.ts`](../src/test/gitHost.ts) is a git host over plain HTTP. It serves git's smart HTTP protocol and the Git LFS batch API behind basic auth. git and git-lfs reach it as a forward proxy through `http_proxy`, so any host name works without DNS or TLS.
  - It runs `upload-pack` and `receive-pack` with `--stateless-rpc` itself rather than `git http-backend`, which MinGit, dugite's git on Windows, does not ship. Through `http-backend` every request on Windows answered 500.
- [`src/test/cloudGit.ts`](../src/test/cloudGit.ts) models elek.io Cloud's two git endpoints. The fake Cloud answers from it, and the git host asks it which token reaches which repository.
- [`src/test/credentialRecorder.ts`](../src/test/credentialRecorder.ts) stands in for the person's keychain and askpass, and records whether git asked them.
  - Its global config starts with an empty helper. MinGit's system config sets Git Credential Manager, which would otherwise be asked ahead of the stand-in and refuses a plain HTTP host whose name holds `github`.

Real Projects are pushed and cloned on two host names, LFS objects included. [`gitCredentialRelay.test.ts`](../src/util/gitCredentialRelay.test.ts) drives the same helper through dugite's own `git credential fill`, which needs no HTTP at all.

On a Linux whose `libcurl.so.4` dugite's git cannot load, the HTTP suite fails with `PreconditionFailed` naming the library. Point `LOCAL_GIT_DIRECTORY` at a system git and put dugite's `git/libexec/git-core` on `PATH` for its git-lfs, see [`peer-dependencies.md`](./peer-dependencies.md#dugite-323-required).

CI runs both on Linux, macOS and Windows, where MinGit's `sh` runs the helper's shell snippet. What no test covers, to check by hand before releasing a change to the credential path:

- A data directory or Node path holding spaces or non-ASCII characters. CI's paths hold neither.
- An Electron host running the helper with `ELECTRON_RUN_AS_NODE`.
- LFS object availability for old Release tags on real providers.

### Deliberately untested

Two more paths are left uncovered on purpose. Each is listed so the next person reading a coverage report does not take it for an oversight:

- **`--watch` on `elek export`, `generate:types` and `generate:client`.** Each is the same six-line wrapper that logs and hands `watchProjects()` to the same regenerate call. A test would start a watcher that never settles and assert the wrapper rather than the watching.
  - The debouncing and overlap handling that is worth proving lives in `watchContent` and is covered by [`src/astro/watch.test.ts`](../src/astro/watch.test.ts).
- **A remote without a `draft` branch.** Provisioning the `draft` channel refuses one, but no Core operation produces such a remote. The fixture would have to be built by hand purely to read the error message back.

### Worker count: do not set it

`maxWorkers` is deliberately not configured. Vitest computes it per machine from `os.availableParallelism()`: all cores minus one for `vitest run`, half the cores in watch mode so the machine stays responsive. That call is cgroup aware, so containers and CI runners get their real quota, not the host core count.

Measurements below show the suite saturates early (4 workers are within 10% of 11), so raising the count buys nothing and lowering it only slows local runs. Do not add `maxWorkers` to `vitest.config.ts`, it would pin every machine to one value, and the `VITEST_MAX_WORKERS` env var overrides the config anyway.

The one case for intervening: if CI data from the slow runners shows git-heavy tests nearing their measured budget under contention, first re-measure and raise the global budgets (consistent with the generous-timeouts decision above), and only then cap workers via a `VITEST_MAX_WORKERS` env line in `ci.yml`, so the measure stays CI-specific.

### Measurements

Measured locally (Linux, 12 cores, 3 runs each): parallel 17.5s to 18.3s, serial via `--no-file-parallelism` 65.7s to 66.6s, a 3.7x speedup. Capped to `VITEST_MAX_WORKERS=4` the suite still finishes in 19.2s and at 2 workers in 34.4s, so the suite saturates early. Contention roughly doubled the slowest individual test durations (1.5s to 2.7s worst case).

The CI gains are in the runner performance table above. The timeout of the day held up on the slow runners: on Windows, the most contended platform, the summed per-test time rose 36% under parallelism and no test came near the 15s limit that was in force then.

## See also

- [`toolchain.md`](./toolchain.md) - why vitest, and what the suite runs next to
- [`documentation.md`](./documentation.md) - the documentation rules this suite enforces
- [`git-credentials.md`](./git-credentials.md) - the credential helper the HTTP suite drives
- [`logging.md`](./logging.md) - the sentinel tests that guard what a log file may carry
