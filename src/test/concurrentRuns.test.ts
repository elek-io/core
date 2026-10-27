import { execFile, type ExecFileException } from 'node:child_process';
import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { testTimeoutMs } from './budgets.js';
import {
  cliRunDirName,
  createFileId,
  currentDataDirBase,
  currentRunId,
} from './worker.js';

/**
 * Two real suite runs in one checkout, at the same time.
 *
 * Each spawned run runs one purpose-made file rather than the whole suite,
 * and the leftovers planted below say which directories its start may take
 * away, see contributing/testing.md.
 */
const repositoryRoot = Path.resolve();

/** The vitest entry point, started the way a shell starts it */
const vitestBin = Path.resolve('node_modules/vitest/vitest.mjs');

/** The one file a spawned run runs */
const fixture = 'src/test/collisions.test.ts';

/**
 * What a spawned run gets before it is killed, in milliseconds.
 *
 * Half the per-test budget, so a run that hangs is killed and reported with
 * its own output while this test still has time to fail on that rather than
 * on its own timeout.
 */
const spawnedRunMs = testTimeoutMs / 2;

/** A run that was spawned, and how it ended. */
interface SpawnedRun {
  isTimedOut: boolean;
  exitCode: number | null;
  output: string;
}

/** The exit code of a finished child, or null when a signal ended it. */
function exitCodeOf(error: ExecFileException | null): number | null {
  if (error === null) return 0;
  return typeof error.code === 'number' ? error.code : null;
}

/** Runs the fixture as a suite run of its own, in the given data directory. */
function runFixture(base: string): Promise<SpawnedRun> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [vitestBin, 'run', fixture],
      {
        cwd: repositoryRoot,
        env: { ...process.env, ELEK_IO_DATA_DIR: base },
        timeout: spawnedRunMs,
        killSignal: 'SIGKILL',
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          isTimedOut: error?.killed === true,
          exitCode: exitCodeOf(error),
          output: `${stdout}\n${stderr}`,
        });
      }
    );
  });
}

/** Plants a directory with a file in it, so a removal has work to do. */
async function plant(path: string): Promise<string> {
  await Fs.outputFile(Path.join(path, 'inside.txt'), 'planted');
  return path;
}

describe('two suite runs in one checkout', () => {
  it('runs a second real run while one is in flight, and both are green', async () => {
    const base = currentDataDirBase();
    const runId = currentRunId();
    // A pid nothing holds, so both spawned runs read these as removable
    const gone = `r999999-${createFileId()}`;
    const goneInBase = await plant(
      Path.join(base, `worker-9-${gone}-${createFileId()}`)
    );
    const goneInRoot = await plant(
      Path.join(repositoryRoot, cliRunDirName(gone))
    );
    // This run is alive and its directories are in use, the empty git config
    // of this very worker among them
    const ownInRoot = await plant(
      Path.join(repositoryRoot, cliRunDirName(runId), 'concurrent-runs')
    );
    // Nothing sweeps a file the suite did not name, which is the point of it,
    // so this test takes it back out of the base itself
    const unrelated = Path.join(
      base,
      `a-maintainer-owns-${createFileId()}.txt`
    );
    await Fs.outputFile(unrelated, 'keep me');
    onTestFinished(async () => {
      await Fs.remove(unrelated);
    });

    const [first, second] = await Promise.all([
      runFixture(base),
      runFixture(base),
    ]);

    for (const run of [first, second]) {
      expect(
        run.isTimedOut,
        `A spawned run did not exit inside ${spawnedRunMs}ms:\n${run.output}`
      ).toBe(false);
      expect(run.exitCode, `A spawned run failed:\n${run.output}`).toBe(0);
    }

    // What the two starts were allowed to take away, and what they were not.
    // The empty git config is this worker's own, inside its data directory,
    // and git here has no identity without it.
    expect({
      goneInBase: await Fs.pathExists(goneInBase),
      goneInRoot: await Fs.pathExists(goneInRoot),
      ownInRoot: await Fs.pathExists(ownInRoot),
      unrelated: await Fs.pathExists(unrelated),
      ownGitConfig: await Fs.pathExists(process.env['GIT_CONFIG_GLOBAL'] ?? ''),
    }).toEqual({
      goneInBase: false,
      goneInRoot: false,
      ownInRoot: true,
      unrelated: true,
      ownGitConfig: true,
    });
  });
});
