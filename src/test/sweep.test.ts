import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budgetMultiple, jobTimeoutMinutes } from './budgets.js';
import {
  foreignRemovalMs,
  isRunAlive,
  removalRetries,
  removeTree,
  staleRunDirMs,
  sweepDeadRuns,
} from './sweep.js';
import { tmpDirPath } from './util.js';
import {
  cliRunDirName,
  createFileId,
  createRunId,
  nodeRunDirName,
} from './worker.js';

/** Fails the test when the sweep reports it kept something */
function fail(message: string): never {
  throw new Error(`The sweep reported a directory it kept: ${message}`);
}

/** An error carrying the code `process.kill` raises, without a type cast */
function killError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** A run id of a pid this process does not hold */
const foreignRunId = 'r424242-0123456789ab';

/** A base and a root to sweep, both removed when the test finishes */
function scratch(): { base: string; root: string } {
  return { base: tmpDirPath(), root: tmpDirPath() };
}

/** Plants a directory with one file in it, so a removal has work to do */
async function plant(directory: string, name: string): Promise<string> {
  const path = Path.join(directory, name);
  await Fs.outputFile(Path.join(path, 'inside.txt'), 'planted');
  return path;
}

describe('isRunAlive', () => {
  it('reads this process as alive', () => {
    expect(isRunAlive({ runId: createRunId() })).toBe(true);
  });

  it('reads a pid nothing holds as gone', () => {
    expect(isRunAlive({ runId: 'r999999-0123456789ab' })).toBe(false);
  });

  it('reads only ESRCH as gone, so EPERM keeps a foreign run alive', () => {
    const kill = (code: string) => () => {
      throw killError(code);
    };

    expect(isRunAlive({ runId: foreignRunId, kill: kill('ESRCH') })).toBe(
      false
    );
    expect(isRunAlive({ runId: foreignRunId, kill: kill('EPERM') })).toBe(true);
  });

  it('reads a string that is no run id as gone', () => {
    expect(isRunAlive({ runId: 'not-a-run-id' })).toBe(false);
  });

  it('reads a throw it cannot put a code to as alive', () => {
    const withoutCode = () => {
      throw new Error('something else went wrong');
    };
    const withANumericCode = () => {
      throw Object.assign(new Error('something else'), { code: 3 });
    };

    expect(isRunAlive({ runId: foreignRunId, kill: withoutCode })).toBe(true);
    expect(isRunAlive({ runId: foreignRunId, kill: withANumericCode })).toBe(
      true
    );
  });
});

describe('removeTree', () => {
  it('asks fs.rm for the retries, which fs-extra cannot take', async () => {
    const seen: { path: string; options: unknown }[] = [];

    await removeTree('/somewhere', (path, options) => {
      seen.push({ path: String(path), options });
      return Promise.resolve();
    });

    expect(seen).toEqual([
      {
        path: '/somewhere',
        options: {
          recursive: true,
          force: true,
          maxRetries: removalRetries,
        },
      },
    ]);
    expect(removalRetries).toBeGreaterThan(0);
  });

  it('resolves while another writer keeps putting files back', async () => {
    const directory = tmpDirPath();
    await Fs.outputFile(Path.join(directory, 'start.txt'), 'x');
    let isWriting = true;
    const writer = (async () => {
      for (let round = 0; isWriting && round < 200; round++) {
        await Fs.outputFile(
          Path.join(directory, `contend-${round}.txt`),
          'x'
        ).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    })();

    await expect(removeTree(directory)).resolves.toBeUndefined();

    isWriting = false;
    await writer;
  });
});

describe('sweepDeadRuns', () => {
  it('removes what a run that is gone left in both directories', async () => {
    const { base, root } = scratch();
    const gone = 'r999999-0123456789ab';
    const planted = [
      await plant(base, `worker-1-${gone}-${createFileId()}`),
      await plant(root, cliRunDirName(gone)),
      await plant(root, nodeRunDirName(gone)),
    ];

    await sweepDeadRuns({ base, root, runId: createRunId(), onKept: fail });

    expect(
      await Promise.all(planted.map((path) => Fs.pathExists(path)))
    ).toEqual([false, false, false]);
  });

  it('keeps the directories of this run and of a run still alive', async () => {
    const { base, root } = scratch();
    const runId = createRunId();
    const own = [
      await plant(base, `worker-1-${runId}-${createFileId()}`),
      await plant(root, cliRunDirName(runId)),
    ];
    const foreign = [
      await plant(base, `worker-2-${foreignRunId}-${createFileId()}`),
      await plant(root, nodeRunDirName(foreignRunId)),
    ];

    await sweepDeadRuns({
      base,
      root,
      runId,
      onKept: fail,
      isAlive: () => true,
    });

    expect(
      await Promise.all([...own, ...foreign].map((path) => Fs.pathExists(path)))
    ).toEqual([true, true, true, true]);
  });

  it('sweeps a stale namesake rather than adopting it', async () => {
    const { base, root } = scratch();
    const runId = createRunId();
    const namesake = createRunId(process.pid);
    const planted = [
      await plant(base, `worker-1-${namesake}-${createFileId()}`),
      await plant(root, cliRunDirName(namesake)),
    ];

    // This process holds that pid, so a liveness check alone reads the
    // leftover as a live run's and would leave it in place
    expect(isRunAlive({ runId: namesake })).toBe(true);
    await sweepDeadRuns({ base, root, runId, onKept: fail });

    expect(
      await Promise.all(planted.map((path) => Fs.pathExists(path)))
    ).toEqual([false, false]);
  });

  it('keeps everything the suite did not name', async () => {
    const { base, root } = scratch();
    await Fs.outputFile(Path.join(base, 'notes.txt'), 'a maintainer owns this');
    await plant(base, 'my-own-directory');
    await plant(root, '.elek.io');
    await plant(root, '.elek.io-node-test');

    await sweepDeadRuns({ base, root, runId: createRunId(), onKept: fail });

    expect((await Fs.readdir(base)).toSorted()).toEqual([
      'my-own-directory',
      'notes.txt',
    ]);
    expect((await Fs.readdir(root)).toSorted()).toEqual([
      '.elek.io',
      '.elek.io-node-test',
    ]);
  });

  it('sweeps a worker directory left before the names carried a run', async () => {
    const { base, root } = scratch();
    const old = await plant(
      base,
      'worker-1-0d9a1f3e-7c2b-4a51-9f0e-2b6d8c4a1e73'
    );

    await sweepDeadRuns({ base, root, runId: createRunId(), onKept: fail });

    expect(await Fs.pathExists(old)).toBe(false);
  });

  it('removes a leftover of an alive pid once it is old enough', async () => {
    const { base, root } = scratch();
    const stale = await plant(base, `worker-1-${foreignRunId}-aabbccddeeff`);
    const sweep = (now: number) =>
      sweepDeadRuns({
        base,
        root,
        runId: createRunId(),
        onKept: fail,
        isAlive: () => true,
        now,
      });

    await sweep(Date.now());
    expect(await Fs.pathExists(stale)).toBe(true);

    await sweep(Date.now() + staleRunDirMs + 1000);
    expect(await Fs.pathExists(stale)).toBe(false);
  });

  it('gives a live run longer than its job cap before calling it stale', () => {
    // A worker directory is written once and then only deeper inside, so its
    // own age reaches the whole length of the run that owns it
    expect(staleRunDirMs).toBeGreaterThan(jobTimeoutMinutes * 60_000);
    expect(staleRunDirMs).toBe(jobTimeoutMinutes * 60_000 * budgetMultiple);
  });

  it('reports a directory it cannot remove and starts the run anyway', async () => {
    const { base, root } = scratch();
    const held = await plant(
      base,
      'worker-1-r999999-0123456789ab-aabbccddeeff'
    );
    const kept: string[] = [];

    // A removal that never settles, which is what a directory another
    // process keeps writing to looks like from here
    await sweepDeadRuns({
      base,
      root,
      runId: createRunId(),
      onKept: (message) => kept.push(message),
      remove: () => new Promise<void>(() => undefined),
    });

    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain(held);
    expect(kept[0]).toContain('The run continued.');
    expect(await Fs.pathExists(held)).toBe(true);
    expect(foreignRemovalMs).toBeLessThan(1000);
  });

  it('reports a removal that fails rather than rejecting into the run', async () => {
    const { base, root } = scratch();
    const held = await plant(
      base,
      'worker-1-r999999-0123456789ab-aabbccddeeff'
    );
    const kept: string[] = [];

    await sweepDeadRuns({
      base,
      root,
      runId: createRunId(),
      onKept: (message) => kept.push(message),
      remove: () => Promise.reject(new Error('another process holds it')),
    });

    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain(held);
    expect(await Fs.pathExists(held)).toBe(true);
  });

  it('passes a base and a root that are not there', async () => {
    const base = Path.join(tmpDirPath(), 'absent-base');
    const root = Path.join(tmpDirPath(), 'absent-root');

    await expect(
      sweepDeadRuns({ base, root, runId: createRunId(), onKept: fail })
    ).resolves.toBeUndefined();
  });
});
