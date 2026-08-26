# Testing

Run the suite with `pnpm test`, watch mode with `pnpm dev`, coverage with `pnpm coverage`.

The suite is integration heavy. Most service tests create real Projects, which means real git repositories. A full run spawns several thousand git subprocesses and writes tens of thousands of small files.

Each test file writes to its own fresh data directory, `~/elek.io-test/worker-<poolId>-<uuid>` by default, see the parallel test files section below. This profile dominates how fast the suite runs on a given machine and explains the CI choices below.

## Coverage under-reports two areas

`pnpm coverage` measures what runs inside the vitest worker. Two parts of Core do not, so their numbers are far lower than what the suite actually exercises:

- **The Astro loaders.** The Astro suites write a content config that imports [`src/index.astro.ts`](../src/index.astro.ts) by absolute path, and `sync()` loads it through Astro's own vite pipeline. v8 attributes nothing back to the source file, so [`src/astro/loaders.ts`](../src/astro/loaders.ts) reads around 12% while six suites drive it end to end.
- **The CLI.** [`src/index.cli.test.ts`](../src/index.cli.test.ts) spawns the built binary, which is the point: it is the only thing that proves a consumer install starts. A spawned process is not instrumented either, so the action modules look thinner than they are.

Do not close those gaps by unit-testing the same behavior in process. A test that reaches for the loader's internals to make a number move proves less than the sync-based test next to it. Add a test there when the behavior is worth proving, and accept the reported number.

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

The vitest `testTimeout` is raised to 15s in [`vitest.config.ts`](../vitest.config.ts) because git-heavy tests that finish in ~3s on the fast runners need 7s or more on Windows and Intel macOS. Parallel test files add CPU contention between workers on the 3 to 4 core CI runners, which is another reason the value stays generous.

Individual tests known to be heavier (full Project lifecycles) override it with 30s or more.

When a test times out, vitest cannot abort its still-running async work, so leftover Projects can leak into later tests. Since every test file has its own data directory, that leak is confined to the file that timed out and cannot break other files. Generous timeouts still protect against the within-file cascade.

## Parallel test files

Test files run in parallel, one file per vitest worker. This works because no state is shared between files:

- [`src/test/workerSetup.ts`](../src/test/workerSetup.ts) is a vitest setup file. It runs in the worker process before each test file and its imports, and points `ELEK_IO_DATA_DIR` at a fresh directory, `~/elek.io-test/worker-<poolId>-<uuid>`.
  - Every Core the file constructs without an explicit `dataDir` resolves it, including CLI subprocesses (they inherit the worker's env) and the Astro loader (it runs in-process).
  - A developer-set `ELEK_IO_DATA_DIR` is respected as the base the worker directories nest beneath, so the whole suite can still be redirected.
- Because the directory is unique per file, counts start at zero and tests may assert absolute totals. No reset step is needed between files.
- The directories live under the home directory on purpose. Using the OS temp dir would put them on tmpfs on Linux, an artificial speedup of the git-bound workload that the Dev Drive decision above already rejected. Side effect of the layout: the suite no longer touches a real `~/elek.io` at all.
- [`src/test/globalSetup.ts`](../src/test/globalSetup.ts) runs once in the main process and sweeps `worker-*` directories left by previous runs. It removes only that prefix, so a developer-pointed `ELEK_IO_DATA_DIR` keeps its unrelated contents.
  - Directories of the current run are left in place for debugging and swept at the next start. Long watch sessions accumulate them across reruns, they are mostly empty because test files destroy their Projects.
- Tests that bind the local API use `testApiPort` from [`src/test/setup.ts`](../src/test/setup.ts), which is `31310 + poolId`, so concurrent workers never contend for a port. 31310 stays the documented product default.
- All of this relies on the vitest `forks` pool (the default), where each test file gets its own process and env. Switching to the `threads` pool would break the per-file env derivation and the `vi.stubEnv` based tests.

### One Astro suite per test file

Every `sync()` builds a full Astro pipeline inside the worker process, and the memory is not fully reclaimed between calls. Six of them in one file exhausted a 4 GB heap, so each Astro suite lives in its own file:

- [`src/index.astro.test.ts`](../src/index.astro.test.ts)
- [`.integration`](../src/index.astro.integration.test.ts)
- [`.mixed`](../src/index.astro.mixed.test.ts)
- [`.config`](../src/index.astro.config.test.ts)
- [`.collections`](../src/index.astro.collections.test.ts)
- [`.assets`](../src/index.astro.assets.test.ts)

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

### Limitation: git credentials cannot be integration-tested

The suite's remotes are bare repositories on the local filesystem, and git skips its whole credential machinery for local paths. The `ELEK_IO_REMOTE_ACCESS_TOKEN` askpass flow (`buildCredentialEnv` and the helper scripts in `GitService`) is therefore covered by unit tests on the env it builds, plus a negative integration test asserting the token never lands in `.git/config` or the remote URL.

What no test covers:

- git actually invoking the askpass helper against an HTTP remote, and the Windows `.bat` trampoline in particular.
- LFS object availability for old Release tags on real providers.

Verify those manually against a real private HTTPS remote when touching the credential path, and before releasing changes to it. A local HTTP git server fixture would close this gap if it ever becomes worth the setup. The design rationale behind the askpass approach is in [`git-credentials.md`](./git-credentials.md).

### Deliberately untested

Three more paths are left uncovered on purpose. Each is listed so the next person reading a coverage report does not take it for an oversight:

- **`--watch` on `elek export`, `generate:types` and `generate:client`.** Each is the same six-line wrapper that logs and hands `watchProjects()` to the same regenerate call. A test would start a watcher that never settles and assert the wrapper rather than the watching.
  - The debouncing and overlap handling that is worth proving lives in `watchContent` and is covered by [`src/astro/watch.test.ts`](../src/astro/watch.test.ts).
- **Auth failures on `push` and the generic git runner.** Both classify the stderr of a remote that rejected a credential, which the local bare remotes cannot produce, for the reason in the credentials limitation above.
- **A remote without a `work` branch.** Provisioning the `draft` channel refuses one, but no Core operation produces such a remote. The fixture would have to be built by hand purely to read the error message back.

### Worker count: do not set it

`maxWorkers` is deliberately not configured. Vitest computes it per machine from `os.availableParallelism()`: all cores minus one for `vitest run`, half the cores in watch mode so the machine stays responsive. That call is cgroup aware, so containers and CI runners get their real quota, not the host core count.

Measurements below show the suite saturates early (4 workers are within 10% of 11), so raising the count buys nothing and lowering it only slows local runs. Do not add `maxWorkers` to `vitest.config.ts`, it would pin every machine to one value, and the `VITEST_MAX_WORKERS` env var overrides the config anyway.

The one case for intervening: if CI data from the slow runners shows git-heavy tests nearing the 15s timeout under contention, first raise `testTimeout` (consistent with the generous-timeouts decision above), and only then cap workers via a `VITEST_MAX_WORKERS` env line in `ci.yml`, so the measure stays CI-specific.

### Measurements

Measured locally (Linux, 12 cores, 3 runs each): parallel 17.5s to 18.3s, serial via `--no-file-parallelism` 65.7s to 66.6s, a 3.7x speedup. Capped to `VITEST_MAX_WORKERS=4` the suite still finishes in 19.2s and at 2 workers in 34.4s, so the suite saturates early. Contention roughly doubled the slowest individual test durations (1.5s to 2.7s worst case).

The CI gains are in the runner performance table above. The timeout held up on the slow runners: on Windows, the most contended platform, the summed per-test time rose 36% under parallelism and no test came near the 15s limit.

## See also

- [`toolchain.md`](./toolchain.md) - why vitest, and what the suite runs next to
- [`documentation.md`](./documentation.md) - the documentation rules this suite enforces
- [`git-credentials.md`](./git-credentials.md) - the one path the suite cannot reach
- [`logging.md`](./logging.md) - the sentinel tests that guard what a log file may carry
