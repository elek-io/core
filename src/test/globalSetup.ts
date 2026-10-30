import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { sweepDeadRuns } from './sweep.js';
import {
  cliRunDirName,
  createRunId,
  runIdEnvVar,
  testDataDirBase,
} from './worker.js';

/**
 * Runs once in the main process before the entire test suite.
 *
 * It names this run, hands the name to the workers through the environment
 * and sweeps what runs that are gone left behind, including runs that failed
 * before their cleanup code could execute, see contributing/testing.md.
 */
export default async function globalSetup() {
  const runId = createRunId();
  // Read by workerSetup and inherited by every process a test spawns
  process.env[runIdEnvVar] = runId;

  const base = testDataDirBase({
    envDataDir: process.env['ELEK_IO_DATA_DIR'],
    homedir: Os.homedir(),
  });
  const root = Path.resolve();

  // A failure on either of these is fatal. Without them this run has nowhere
  // to write, while a directory of another run is only ever reported.
  await Fs.ensureDir(base);
  await Fs.ensureDir(Path.join(root, cliRunDirName(runId)));

  await sweepDeadRuns({
    base,
    root,
    runId,
    onKept: (message) => console.warn(message),
  });
}
