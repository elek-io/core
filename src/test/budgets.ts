/**
 * The suite's time budgets, derived from measured durations.
 *
 * Each budget is the slowest measured duration of what it bounds times one
 * multiple. The measured set is windows-only, apart from the cleanup budget
 * that says so itself, and no platform is reliably the slowest, so every
 * number here is a floor that rises as the suite gains tests, and a slower
 * run supersedes one at the next re-measurement of the whole set rather
 * than on the spot.
 *
 * @see ../../contributing/testing.md
 */

import { TEARDOWN_BOUND_MS } from '../util/teardown.js';

/**
 * Margin every budget carries over the slowest duration measured for it.
 *
 * It is the smallest whole number above the run to run spread of one test on
 * the measured runner, which reached 2.2x at the 90th percentile of the 306
 * tests those jobs timed at least twice.
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
 * Slowest whole test job of the measured set, in seconds.
 *
 * It ran 99% of the 15 minute cap in force then, so the next slowdown would
 * have been killed with no summary of what failed. A verification run of the
 * same day took 937s on another platform, which the cap now clears too.
 */
export const slowestJobSeconds = 889;

/** The vitest `testTimeout`, and the floor every per-test budget keeps. */
export const testTimeoutMs = slowestTestMs * budgetMultiple;

/**
 * The vitest `hookTimeout`, and the floor every per-hook budget keeps.
 *
 * It is paid once per test, because a `beforeEach` runs once per test, so one
 * stuck hook can still exhaust the job cap rather than failing on a named
 * test. The widest one in src/ leaves a margin of 732ms, measured in
 * contributing/testing.md.
 */
export const hookTimeoutMs = slowestHookMs * budgetMultiple;

/** What every job that runs the suite gives itself, in whole minutes. */
export const jobTimeoutMinutes = Math.ceil(
  (slowestJobSeconds * budgetMultiple) / 60
);

/**
 * Slowest step of a test Core's cleanup measured on 2026-10-28, scaled to
 * the slowest runner, in milliseconds.
 *
 * Over one full run on Linux, removing the data directory peaked at 24ms of
 * 184 cleanups and every step of `dispose()` stayed below 10ms of 208 calls.
 * Nothing in CI reports a cleanup duration, so this is the one set here that
 * is not windows-only, and the measurement is scaled by 21, the widest per
 * operation factor between ubuntu and windows-2025 in the platform table.
 *
 * @see ../../contributing/testing.md
 */
export const slowestCleanupMs = 24 * 21;

/**
 * The bound the suite gives the one cleanup step Core does not bound itself,
 * removing a test Core's data directory.
 *
 * It is no per-test and no per-hook budget. A hook keeps the global one and
 * fails on this far sooner, with the step that stalled named.
 */
export const cleanupTimeoutMs = slowestCleanupMs * budgetMultiple;

/**
 * How long a test waits for a bounded teardown before it reads it as hung.
 *
 * Core gives one step of tearing down `TEARDOWN_BOUND_MS`, so a step that
 * has not resolved by that times the multiple is hung rather than slow. It
 * keeps a regression naming its step in seconds, which is what the bounds
 * are for.
 */
export const hungTeardownMs = TEARDOWN_BOUND_MS * budgetMultiple;
