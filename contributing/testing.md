# Testing

Run the suite with `pnpm test`, watch mode with `pnpm dev`, coverage with `pnpm coverage`.

The suite is integration heavy. Most service tests create real Projects, which means real git repositories. A full run spawns several thousand git subprocesses and writes tens of thousands of small files. Each test file writes to its own fresh data directory, `~/elek.io-test/worker-<poolId>-<uuid>` by default, see the parallel test files section below. This profile dominates how fast the suite runs on a given machine and explains the CI choices below.

## CI runner performance

CI runs the suite on four platforms. They differ a lot in speed for this git-bound workload. Measured from CI logs (June 2026), average duration per git invocation and the total vitest duration. The full suite durations predate parallel test files (`fileParallelism: false` was still set) and are expected to drop, re-measure after the parallelism change is merged:

| git command      | ubuntu 24.04 | macOS arm | macOS Intel | Windows |
| ---------------- | ------------ | --------- | ----------- | ------- |
| trivial (`show`) | ~3ms         | ~6ms      | ~14ms       | ~29ms   |
| `clone`          | ~27ms        | ~57ms     | ~190ms      | ~288ms  |
| `merge`          | ~25ms        | ~115ms    | ~262ms      | ~330ms  |
| `lfs` operations | ~28ms        | ~126ms    | ~335ms      | ~601ms  |
| full suite       | 68s          | 151s      | 342s        | 408s    |

Findings from researching these gaps:

- **ubuntu** is the fastest on every measure and the baseline the others are compared against. Linux has the cheapest process spawn and the `git-lfs` subprocess chain barely costs extra there.
- **macOS arm** has a fast CPU but spawning processes costs noticeably more than on Linux, which shows in commands that fork helpers (`lfs` ~4.5x, `merge` ~4.6x over ubuntu). Still comfortably fast in total.
- **macOS Intel** is uniformly ~2.3x slower than the arm runners. This is the hardware itself. `macos-15-intel` is the last x86_64 image GitHub offers (until August 2027) and runs on aging Intel Macs. The earlier `PerfPowerServices` 100% CPU bug ([runner-images#13358](https://github.com/actions/runner-images/issues/13358)) was fixed in the image in December 2025. Nothing actionable remains, the suite is simply slower there.
- **Windows** pays a fixed ~25ms tax per process spawn that cannot be avoided. Windows Defender is not the cause, GitHub already disables realtime monitoring on hosted images. The `windows-2025` image also removed the fast D: drive that `windows-2022` had ([runner-images#12647](https://github.com/actions/runner-images/issues/12647)).

### Decision: no I/O workarounds, generous timeouts instead

For Windows, creating a ReFS Dev Drive in CI ([samypr100/setup-dev-drive](https://github.com/samypr100/setup-dev-drive)) and redirecting test data onto it was evaluated and rejected. It would speed up the file I/O part of git operations, but no real user runs elek.io on a ReFS Dev Drive. Tests should reproduce the environment users actually have, and an artificial filesystem setup adds surface for Windows-specific behavior that real machines would not show. The slow runners are accepted as representative slow machines and the test timeout is sized for them instead.

## Timeouts

The vitest `testTimeout` is raised to 15s in [`vitest.config.ts`](../vitest.config.ts) because git-heavy tests that finish in ~3s on the fast runners need 7s or more on Windows and Intel macOS. Parallel test files add CPU contention between workers on the 3 to 4 core CI runners, which is another reason the value stays generous. Individual tests known to be heavier (full Project lifecycles) override it with 30s or more. When a test times out, vitest cannot abort its still-running async work, so leftover Projects can leak into later tests. Since every test file has its own data directory, that leak is confined to the file that timed out and cannot break other files anymore. Generous timeouts still protect against the within-file cascade.

## Parallel test files

Test files run in parallel, one file per vitest worker. This works because no state is shared between files:

- [`src/test/workerSetup.ts`](../src/test/workerSetup.ts) is a vitest setup file. It runs in the worker process before each test file and its imports, and points `ELEK_IO_DATA_DIR` at a fresh directory, `~/elek.io-test/worker-<poolId>-<uuid>`. Every Core the file constructs without an explicit `dataDir` resolves it, including CLI subprocesses (they inherit the worker's env) and the Astro loader (it runs in-process). A developer-set `ELEK_IO_DATA_DIR` is respected as the base the worker directories nest beneath, so the whole suite can still be redirected.
- Because the directory is unique per file, counts start at zero and tests may assert absolute totals. No reset step is needed between files.
- The directories live under the home directory on purpose. Using the OS temp dir would put them on tmpfs on Linux, an artificial speedup of the git-bound workload that the Dev Drive decision above already rejected. Side effect of the layout: the suite no longer touches a real `~/elek.io` at all.
- [`src/test/globalSetup.ts`](../src/test/globalSetup.ts) runs once in the main process and sweeps `worker-*` directories left by previous runs. It removes only that prefix, so a developer-pointed `ELEK_IO_DATA_DIR` keeps its unrelated contents. Directories of the current run are left in place for debugging and swept at the next start. Long watch sessions accumulate them across reruns, they are mostly empty because test files destroy their Projects.
- Tests that bind the local API use `testApiPort` from [`src/test/setup.ts`](../src/test/setup.ts), which is `31310 + poolId`, so concurrent workers never contend for a port. 31310 stays the documented product default.
- All of this relies on the vitest `forks` pool (the default), where each test file gets its own process and env. Switching to the `threads` pool would break the per-file env derivation and the `vi.stubEnv` based tests.

### Worker count: do not set it

`maxWorkers` is deliberately not configured. Vitest computes it per machine from `os.availableParallelism()`: all cores minus one for `vitest run`, half the cores in watch mode so the machine stays responsive. That call is cgroup aware, so containers and CI runners get their real quota, not the host core count. Measurements below show the suite saturates early (4 workers are within 10% of 11), so raising the count buys nothing and lowering it only slows local runs. Do not add `maxWorkers` to `vitest.config.ts`, it would pin every machine to one value and the `VITEST_MAX_WORKERS` env var overrides the config anyway.

The one case for intervening: if CI data from the slow runners shows git-heavy tests nearing the 15s timeout under contention, first raise `testTimeout` (consistent with the generous-timeouts decision above), and only then cap workers via a `VITEST_MAX_WORKERS` env line in `ci.yml`, so the measure stays CI-specific.

### Measurements

Measured locally (Linux, 12 cores, 3 runs each): parallel 17.5s to 18.3s, serial via `--no-file-parallelism` 65.7s to 66.6s, a 3.7x speedup. Capped to `VITEST_MAX_WORKERS=4` the suite still finishes in 19.2s and at 2 workers in 34.4s, so the 4 core CI runners should see most of the gain. Contention roughly doubled the slowest individual test durations (1.5s to 2.7s worst case), which stays far below the 15s timeout here but is worth re-checking on the slow runners.
