# Testing

Run the suite with `pnpm test`, watch mode with `pnpm dev`, coverage with `pnpm coverage`.

The suite is integration heavy. Most service tests create real Projects, which means real git repositories. A full run spawns several thousand git subprocesses and writes tens of thousands of small files. All test data is written to the regular Core working directory `~/elek.io`, see [`storage-layout.md`](./storage-layout.md). This profile dominates how fast the suite runs on a given machine and explains the CI choices below.

## CI runner performance

CI runs the suite on four platforms. They differ a lot in speed for this git-bound workload. Measured from CI logs (June 2026), average duration per git invocation and the total vitest duration:

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

The vitest `testTimeout` is raised to 15s in [`vitest.config.ts`](../vitest.config.ts) because git-heavy tests that finish in ~3s on the fast runners need 7s or more on Windows and Intel macOS. Individual tests known to be heavier (full Project lifecycles) override it with 30s or more. When a test times out, vitest cannot abort its still-running async work, so leftover Projects can leak into later test files and break tests that count Projects. Generous timeouts protect against this cascade too.

## Known limitations

Test files run sequentially (`fileParallelism: false`) because all files share one working directory and some tests assert global counts. Giving each vitest worker its own working directory would allow parallel files and roughly halve suite duration on all runners.
