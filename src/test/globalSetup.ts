import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { testDataDirBase, workerDirPrefix } from './worker.js';

/**
 * Runs once in the main process before the entire test suite.
 * Sweeps the per-file test data directories of previous runs, including
 * runs that failed before their cleanup code could execute.
 */
export default async function globalSetup() {
  const base = testDataDirBase({
    envDataDir: process.env['ELEK_IO_DATA_DIR'],
    homedir: Os.homedir(),
  });

  // Remove only worker directories. A developer may point ELEK_IO_DATA_DIR
  // at an existing directory whose other contents must survive.
  if (await Fs.pathExists(base)) {
    const entries = await Fs.readdir(base);
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(workerDirPrefix))
        .map((entry) => Fs.remove(Path.join(base, entry)))
    );
  }

  // Crash protection for the cwd-relative directories owned by
  // index.cli.test.ts and index.node.test.ts
  await Fs.emptyDir(Path.resolve('.elek.io'));
  await Fs.remove(Path.resolve('.elek.io-node-test'));
}
