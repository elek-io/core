import Crypto from 'node:crypto';
import Net from 'node:net';
import Path from 'node:path';

/**
 * Prefix of per-file test data directories.
 * globalSetup sweeps directories with this prefix, so it must not
 * match anything else a developer might keep in the base directory.
 */
export const workerDirPrefix = 'worker-';

/**
 * Carries the run id from globalSetup to the workers and whatever they spawn.
 * It belongs to the suite rather than to Core, which ignores it.
 */
export const runIdEnvVar = 'ELEK_IO_TEST_RUN_ID';

/** A run id, `r` and the pid of the run, then a random part. */
const runIdPattern = /^r(\d+)-[0-9a-f]+$/;

/** A per-file data directory, naming the run that created it. */
const workerDirPattern = /^worker-\d+-(r\d+-[0-9a-f]+)-[0-9a-f]+$/;

/** A run directory in the repository root, the CLI one or the Node one. */
const rootDirPattern = /^\.elek\.io-(?:node-test-)?(r\d+-[0-9a-f]+)$/;

/**
 * Random part of a directory name, 12 hex characters.
 *
 * Over a watch session of 20,000 names that is a collision probability of
 * 7.1e-07, against 0.045 at 8 characters.
 */
function randomPart(): string {
  return Crypto.randomBytes(6).toString('hex');
}

/**
 * Names one suite run, so every path it writes can carry that name.
 *
 * The pid says whether the run is still alive, and the random part makes a
 * recycled pid a different run, see contributing/testing.md.
 */
export function createRunId(pid: number = process.pid): string {
  return `r${pid}-${randomPart()}`;
}

/** Tells the directories of one run's workers apart, reruns included. */
export function createFileId(): string {
  return randomPart();
}

/** The pid inside a run id, or undefined when the string is not one. */
export function pidOfRunId(runId: string): number | undefined {
  const digits = runIdPattern.exec(runId)?.[1];
  if (digits === undefined) return undefined;
  const pid = Number(digits);
  // Signal 0 to pid 0 reaches the whole process group, never one process.
  return pid > 0 ? pid : undefined;
}

/** The run this process belongs to, named by globalSetup. */
export function currentRunId(): string {
  const runId = process.env[runIdEnvVar];
  if (runId === undefined || pidOfRunId(runId) === undefined) {
    throw new Error(
      `Expected ${runIdEnvVar} to hold a run id, got "${runId}". Run the suite through vitest.`
    );
  }
  return runId;
}

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
 * The pool id is kept in the name to see which worker slot ran the file, and
 * the run id so a second run in the same checkout writes somewhere else.
 */
export function testFileDataDir(props: {
  envDataDir: string | undefined;
  homedir: string;
  poolId: string;
  runId: string;
  fileId: string;
}): string {
  return Path.join(
    testDataDirBase(props),
    `${workerDirPrefix}${props.poolId}-${props.runId}-${props.fileId}`
  );
}

/** The run that created a per-file data directory, read from its name. */
export function runIdOfWorkerDir(name: string): string | undefined {
  return workerDirPattern.exec(name)?.[1];
}

/** The run that created a repository-root directory, read from its name. */
export function runIdOfRootDir(name: string): string | undefined {
  return rootDirPattern.exec(name)?.[1];
}

/**
 * The base this run's per-file data directories sit in.
 *
 * It answers inside a worker only, where workerSetup has already pointed
 * ELEK_IO_DATA_DIR at the directory of the test file being run.
 */
export function currentDataDirBase(): string {
  const dataDir = process.env['ELEK_IO_DATA_DIR'] ?? '';
  if (runIdOfWorkerDir(Path.basename(dataDir)) === undefined) {
    throw new Error(
      `Expected ELEK_IO_DATA_DIR to hold a data directory of this run, got "${dataDir}"`
    );
  }
  return Path.dirname(dataDir);
}

/**
 * Name of the directory the CLI tests write in the repository root.
 *
 * It cannot move under the data directory base: the generated client imports
 * `@elek-io/core`, which resolves only by Node self-reference from inside the
 * checkout, see contributing/testing.md.
 */
export function cliRunDirName(runId: string): string {
  return `.elek.io-${runId}`;
}

/** Name of the directory the Node entry test writes in the repository root. */
export function nodeRunDirName(runId: string): string {
  return `.elek.io-node-test-${runId}`;
}

/**
 * A port nothing holds, obtained by binding zero and letting it go again.
 *
 * A port derived from the worker slot collides with the same slot of another
 * run, because every run numbers its slots from one.
 */
export async function freePort(): Promise<number> {
  const server = Net.createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error(`Expected a bound TCP address, got ${String(address)}`);
    }
    return address.port;
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
