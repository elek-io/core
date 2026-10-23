/**
 * The suite's time budgets, derived from measured durations.
 *
 * Each budget is the slowest platform's measured duration of what it bounds
 * times one multiple, so a slow runner fails on a named test rather than on a
 * number nobody chose. The measurements, the platform and the date are in
 * contributing/testing.md.
 *
 * @see ../../contributing/testing.md
 */

/**
 * Margin every budget carries over the slowest duration measured for it.
 *
 * It is the smallest whole number above the run to run spread of one test on
 * the slowest runner, which reached 2.5x at the 90th percentile.
 */
export const budgetMultiple = 3;

/**
 * Slowest single test measured on windows-2025 on 2026-10-23, in milliseconds.
 *
 * ReleaseService.remote.test.ts, "should refuse a Release whose draft is behind
 * the remote draft before changing anything".
 */
export const slowestTestMs = 55_872;

/**
 * Slowest fixture hook measured on windows-2025 on 2026-10-23, in milliseconds.
 *
 * Read as the whole duration of logSweep.test.ts, which holds one beforeAll
 * and no other hook, and whose 19 tests each stayed below the 300ms the
 * reporter prints a duration for.
 */
export const slowestHookMs = 78_796;

/**
 * Slowest whole test job measured on windows-2025 on 2026-10-23, in seconds.
 *
 * It ran 99% of the 15 minute cap that was in force then, so the next
 * slowdown would have been killed with no summary of what failed.
 */
export const slowestJobSeconds = 889;

/** The vitest `testTimeout`, and the floor every per-test budget keeps. */
export const testTimeoutMs = slowestTestMs * budgetMultiple;

/** The vitest `hookTimeout`, and the floor every per-hook budget keeps. */
export const hookTimeoutMs = slowestHookMs * budgetMultiple;

/** What the test job of the CI workflow gives itself, in whole minutes. */
export const jobTimeoutMinutes = Math.ceil(
  (slowestJobSeconds * budgetMultiple) / 60
);
