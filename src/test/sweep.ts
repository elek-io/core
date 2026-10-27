import Fs from 'fs-extra';
import Fsp from 'node:fs/promises';
import Path from 'node:path';
import { budgetMultiple, jobTimeoutMinutes } from './budgets.js';
import {
  pidOfRunId,
  runIdOfRootDir,
  runIdOfWorkerDir,
  workerDirPrefix,
} from './worker.js';

/**
 * Age at which a leftover is removed although its pid reads as alive.
 *
 * No run can have left one of its own directories untouched for longer than
 * its job cap lets it run, so an older one belongs to a run that died and
 * whose pid the system has since handed to somebody else. The cap times the
 * budget multiple leaves room for a local run no cap stops.
 */
export const staleRunDirMs = jobTimeoutMinutes * 60_000 * budgetMultiple;

/**
 * What the removal of one other run's leftover gets, in milliseconds.
 *
 * A removal another process keeps contending is abandoned and reported rather
 * than waited out, so the worst case is one leaked directory instead of a run
 * that stalls before its first test.
 */
export const foreignRemovalMs = 500;

/** How often a contended removal is retried before it gives up. */
export const removalRetries = 10;

/** A directory of some run, and the run that created it. */
interface Leftover {
  path: string;
  /** Undefined when the name carries no run id, so nobody owns it */
  runId: string | undefined;
}

/** What the sweep needs, and the seams a test replaces. */
export interface SweepProps {
  /** Base holding the per-file data directories */
  base: string;
  /** Repository root holding the run directories the test files write there */
  root: string;
  /** The run doing the sweeping, whose own directories are left in place */
  runId: string;
  /** Reports a directory the sweep could not remove, once per directory */
  onKept: (message: string) => void;
  isAlive?: (runId: string) => boolean;
  remove?: (path: string) => Promise<void>;
  now?: number;
}

/** The error code of a thrown value, without asserting its shape. */
function codeOf(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error) {
    const { code } = error;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Whether the process a run id names still exists.
 *
 * Only `ESRCH` means gone. `EPERM` means the process is there and belongs to
 * somebody else, so a filter that read every throw as dead would sweep a live
 * run's directories.
 */
export function isRunAlive(props: {
  runId: string;
  kill?: (pid: number) => void;
}): boolean {
  const pid = pidOfRunId(props.runId);
  if (pid === undefined) return false;
  const kill = props.kill ?? ((target: number) => process.kill(target, 0));
  try {
    kill(pid);
    return true;
  } catch (error) {
    return codeOf(error) !== 'ESRCH';
  }
}

/**
 * Removes a directory tree, retrying while another process holds a file in it.
 *
 * `Fs.remove` takes no options, so the retries go to `fs.rm` itself. Which
 * error a held file raises differs per platform, so nothing here reads it.
 */
export async function removeTree(
  path: string,
  rm: typeof Fsp.rm = Fsp.rm
): Promise<void> {
  await rm(path, { recursive: true, force: true, maxRetries: removalRetries });
}

/** Runs a removal under a deadline, and says whether it got there. */
async function removeWithin(props: {
  path: string;
  ms: number;
  remove: (path: string) => Promise<void>;
}): Promise<boolean> {
  // An abandoned removal keeps running and its failure is swallowed, so a
  // directory another process holds cannot reject into the run start.
  const removal = props.remove(props.path).then(
    () => true,
    () => false
  );
  const deadline = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), props.ms).unref();
  });
  return Promise.race([removal, deadline]);
}

/** Every entry of a directory, or none when the directory is not there. */
async function entriesOf(directory: string): Promise<string[]> {
  if (!(await Fs.pathExists(directory))) return [];
  return Fs.readdir(directory);
}

/** The run directories inside one directory, whoever they belong to. */
async function leftoversIn(props: {
  directory: string;
  runIdOf: (name: string) => string | undefined;
  isSuiteOwned: (name: string) => boolean;
}): Promise<Leftover[]> {
  const found: Leftover[] = [];
  for (const name of await entriesOf(props.directory)) {
    const runId = props.runIdOf(name);
    if (runId === undefined && !props.isSuiteOwned(name)) continue;
    found.push({ path: Path.join(props.directory, name), runId });
  }
  return found;
}

/** Whether nothing has been written to a directory for longer than the age. */
async function isStale(path: string, now: number): Promise<boolean> {
  const stats = await Fs.stat(path).catch(() => null);
  return stats !== null && now - stats.mtimeMs > staleRunDirMs;
}

/**
 * Removes what runs that are gone left in the data directory base and in the
 * repository root.
 *
 * A directory of this run and one of a run that is still alive stay, and a
 * removal another process resists is reported rather than waited out, see
 * contributing/testing.md.
 */
export async function sweepDeadRuns(props: SweepProps): Promise<void> {
  const isAlive = props.isAlive ?? ((runId: string) => isRunAlive({ runId }));
  const remove = props.remove ?? removeTree;
  const now = props.now ?? Date.now();
  const ownPid = pidOfRunId(props.runId);

  const leftovers = [
    ...(await leftoversIn({
      directory: props.base,
      runIdOf: runIdOfWorkerDir,
      isSuiteOwned: (name) => name.startsWith(workerDirPrefix),
    })),
    ...(await leftoversIn({
      directory: props.root,
      runIdOf: runIdOfRootDir,
      isSuiteOwned: () => false,
    })),
  ];

  await Promise.all(
    leftovers.map(async ({ path, runId }) => {
      if (runId === props.runId) return;
      // A leftover naming this run's own pid cannot belong to a live run.
      // This process holds that pid and did not create it.
      const isNamesake = runId !== undefined && pidOfRunId(runId) === ownPid;
      const keeps =
        runId !== undefined &&
        !isNamesake &&
        isAlive(runId) &&
        !(await isStale(path, now));
      if (keeps) return;

      const isRemoved = await removeWithin({
        path,
        ms: foreignRemovalMs,
        remove,
      });
      if (!isRemoved) {
        props.onKept(
          `Left ${path} behind, another process is holding it. The run continued.`
        );
      }
    })
  );
}
