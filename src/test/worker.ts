import Path from 'node:path';

/**
 * Prefix of per-file test data directories.
 * globalSetup sweeps directories with this prefix, so it must not
 * match anything else a developer might keep in the base directory.
 */
export const workerDirPrefix = 'worker-';

/**
 * Base directory holding the per-file test data directories.
 * A developer-set ELEK_IO_DATA_DIR wins over the default
 * `~/elek.io-test`, test directories nest beneath it.
 * Trim and resolve semantics mirror resolveDataDir.
 */
export function testDataDirBase(props: {
  envDataDir: string | undefined;
  homedir: string;
}): string {
  const fromEnv = props.envDataDir?.trim();
  return Path.resolve(fromEnv || Path.join(props.homedir, 'elek.io-test'));
}

/**
 * Unique data directory for one test file.
 * The pool id is kept in the name to see which worker slot ran the file.
 */
export function testFileDataDir(props: {
  envDataDir: string | undefined;
  homedir: string;
  poolId: string;
  uniqueId: string;
}): string {
  return Path.join(
    testDataDirBase(props),
    `${workerDirPrefix}${props.poolId}-${props.uniqueId}`
  );
}

/**
 * Port the local API binds during tests, offset by the pool id so
 * test files running concurrently in different workers never collide.
 * 31310 stays untouched as the documented product default.
 */
export function workerApiPort(poolId: string | undefined): number {
  const parsed = Number.parseInt(poolId ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(
      `Expected VITEST_POOL_ID to be a positive integer, got "${poolId}"`
    );
  }
  return 31310 + parsed;
}
