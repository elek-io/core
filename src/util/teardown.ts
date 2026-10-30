/**
 * How long one step of tearing Core down may take before Core gives up on
 * it, in milliseconds.
 *
 * A full suite run of 2026-10-28 timed 208 `dispose()` calls, whose slowest
 * step took 7ms, so a step still running after five seconds is stuck rather
 * than slow. The bound is per step, so a `dispose()` whose every step stalls
 * still resolves.
 *
 * @see ../../docs/usage.md
 */
export const TEARDOWN_BOUND_MS = 5_000;

/**
 * Awaits given work, gives up on it after given bound in milliseconds, and
 * says which of the two happened.
 *
 * The timer is referenced while it waits, so the bound still holds in a host
 * with nothing else left on its event loop, which is what a shutdown is. It
 * is cleared as soon as either side wins, so it never outlives the work.
 * Work failing before the bound rejects this, as if nothing was bounded.
 * Failing after it is absorbed, because the caller moved on, and absorbing
 * it is what keeps it from surfacing as an unhandled rejection.
 */
export function finishesWithin(
  work: Promise<unknown>,
  boundMs: number
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), boundMs);
  });

  return Promise.race([work.then(() => true), bound]).finally(() =>
    clearTimeout(timer)
  );
}
