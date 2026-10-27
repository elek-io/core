import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { createFileId, currentRunId, testFileDataDir } from './worker.js';

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

// Fresh data directory per test file, named for the run that created it, so a
// second run in the same checkout writes somewhere else. Developer-set
// ELEK_IO_DATA_DIR values become the base the directories nest beneath.
// Leftovers are swept by globalSetup, see contributing/testing.md.
const dataDir = testFileDataDir({
  envDataDir: process.env['ELEK_IO_DATA_DIR'],
  homedir: Os.homedir(),
  poolId,
  runId: currentRunId(),
  fileId: createFileId(),
});
process.env['ELEK_IO_DATA_DIR'] = dataDir;

// No global git config, so a developer's machine has no git identity, as CI.
// A global identity would otherwise sign a commit Core forgot to give the
// User, and the test would pass here and fail in CI. The file sits in this
// file's own data directory, so no two workers and no two runs share it.
Fs.mkdirSync(dataDir, { recursive: true });
const emptyGitConfig = Path.join(dataDir, 'empty.gitconfig');
Fs.writeFileSync(emptyGitConfig, '');
process.env['GIT_CONFIG_GLOBAL'] = emptyGitConfig;
