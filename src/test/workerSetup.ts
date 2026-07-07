import Os from 'node:os';
import { uuid } from '../util/shared.js';
import { testFileDataDir } from './worker.js';

// Registered as a vitest setup file. Runs in the worker process before each
// test file and its imports, so before setup.ts constructs the shared Core.
// Only import side-effect free modules here. In particular never import
// setup.ts or util.ts, both construct the shared Core at module level and
// that must not happen before the environment variable below is set.
//
// This relies on the forks pool where each test file gets its own process
// and env. Switching to the threads pool would break this and the
// vi.stubEnv based tests.
const poolId = process.env['VITEST_POOL_ID'];
if (!poolId) {
  throw new Error('VITEST_POOL_ID is not set, run the suite through vitest');
}

// Fresh data directory per test file, so no disk state is shared between
// test files and counts always start at zero. Developer-set ELEK_IO_DATA_DIR
// values become the base the directories nest beneath. Leftovers are swept
// by globalSetup at the next suite start, see contributing/testing.md.
process.env['ELEK_IO_DATA_DIR'] = testFileDataDir({
  envDataDir: process.env['ELEK_IO_DATA_DIR'],
  homedir: Os.homedir(),
  poolId,
  uniqueId: uuid(),
});
