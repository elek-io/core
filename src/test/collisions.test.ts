import Fs from 'fs-extra';
import Path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import core from './setup.js';
import { createProject, tmpDirPath } from './util.js';
import {
  cliRunDirName,
  currentDataDirBase,
  currentRunId,
  freePort,
} from './worker.js';

/**
 * Everything two runs of the suite in one checkout could share.
 *
 * concurrentRuns.test.ts runs this file as a second real run while one is in
 * flight, so what it proves alone it has to prove under that too, see
 * contributing/testing.md.
 */
const runId = currentRunId();

/** This run's own corner of its directory in the repository root */
const ownRootDir = Path.resolve(cliRunDirName(runId), 'collisions');

/** Rounds of write and read back, so an overlap has time to show */
const rounds = 20;

/** Writes this run's id and reads it back, so nothing else may answer. */
async function keepsItsOwn(file: string): Promise<string[]> {
  const read: string[] = [];
  for (let round = 0; round < rounds; round++) {
    await Fs.outputFile(file, `${runId}-${round}`);
    read.push(await Fs.readFile(file, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  return read;
}

/** What every round should have read back */
const expected = Array.from(
  { length: rounds },
  (_, round) => `${runId}-${round}`
);

describe('what one run writes', () => {
  beforeAll(async () => {
    await Fs.ensureDir(ownRootDir);
  });

  it('keeps its data directory to itself, git repositories included', async () => {
    const dataDir = process.env['ELEK_IO_DATA_DIR'];

    expect(dataDir).toBe(
      Path.join(currentDataDirBase(), Path.basename(dataDir ?? ''))
    );
    expect(Path.basename(dataDir ?? '')).toContain(runId);

    const project = await createProject();
    const listed = await core.projects.list();

    expect(listed.list.map((found) => found.id)).toEqual([project.id]);
    await project.destroy();
  });

  it('keeps its directory in the repository root to itself', async () => {
    const read = await keepsItsOwn(Path.join(ownRootDir, 'root-marker.txt'));

    expect(read).toEqual(expected);
  });

  it('binds a port no other run holds', async () => {
    const port = await freePort();

    await core.api.start(port);
    const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
    await core.api.stop();

    expect(response.status).toBe(200);
  });

  it('keeps what it writes under the OS temp directory to itself', async () => {
    const read = await keepsItsOwn(Path.join(tmpDirPath(), 'tmp-marker.txt'));

    expect(read).toEqual(expected);
  });
});
