import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type DailyRotateFile from 'winston-daily-rotate-file';
import { LocalApi } from '../api/index.js';
import ElekIoCore from '../index.node.js';
import { logRecordSchema, type LogRecord } from '../schema/logSchema.js';
import { LogService } from '../service/LogService.js';
import { GitCredentialRelay } from '../util/gitCredentialRelay.js';
import { uuid } from '../util/shared.js';
import { finishesWithin, TEARDOWN_BOUND_MS } from '../util/teardown.js';
import { cleanupTimeoutMs, hungTeardownMs } from './budgets.js';
import sharedCore from './setup.js';
import { cleanUpTmpCore } from './util.js';

/**
 * Drives every teardown step into never finishing, which is what a cleanup
 * looks like when one of its steps stops coming back.
 *
 * Each perturbation costs its bound in real time. Faking the timers would
 * take that back and leave the real IO of the steps around it unscheduled,
 * so the bounds are waited out instead.
 *
 * @see ../../contributing/testing.md
 */

/**
 * The level a packaged host runs at, stated rather than resolved, so the
 * record a stall writes is written whatever ELEK_IO_LOG_LEVEL says. Every
 * Core below keeps the process handlers a host gets, and is disposed.
 */
const log = { level: 'info' } as const;

/** A never settling promise, standing in for a handle nothing releases. */
function neverFinishes(): Promise<never> {
  return new Promise<never>(() => {});
}

/** A data directory of its own, removed once the perturbation is restored. */
function tmpDataDir(): string {
  const dataDir = Path.join(Os.tmpdir(), `elek-io-core-teardown-${uuid()}`);
  onTestFinished(async () => {
    vi.restoreAllMocks();
    await Fs.remove(dataDir);
  });
  return dataDir;
}

/**
 * A Core whose rotating log file never emits `finish`, which is what winston
 * waits for on every transport before it emits its own.
 *
 * The transport is ended for real once the test is done, so removing the
 * data directory cannot meet a file another handle still holds.
 */
function coreWithAStuckLogFile(dataDir: string): ElekIoCore {
  const createTransports = LogService.createTransports.bind(LogService);
  let rotatingFile: DailyRotateFile | undefined;
  vi.spyOn(LogService, 'createTransports').mockImplementation(
    (options, pathTo) => {
      const built = createTransports(options, pathTo);
      rotatingFile = built.rotatingFile;
      vi.spyOn(built.rotatingFile, 'end').mockImplementation(
        () => built.rotatingFile
      );
      return built;
    }
  );
  onTestFinished(async () => {
    vi.restoreAllMocks();
    const file = rotatingFile;
    await finishesWithin(
      new Promise<void>((resolve) => {
        if (file === undefined) {
          resolve();
          return;
        }
        file.once('finish', () => resolve());
        file.end();
      }),
      hungTeardownMs
    );
  });

  return new ElekIoCore({ dataDir, log });
}

/** The records of a Core's log directory, in the order they were written. */
async function readRecords(dir: string): Promise<LogRecord[]> {
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );

  return contents
    .join('\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line))
    .map((line) => logRecordSchema.parse(line));
}

describe('a step of dispose that never finishes', function () {
  it('names the local API, and leaves a record saying so', async function () {
    const dataDir = tmpDataDir();
    const stalling = new ElekIoCore({ dataDir, log });
    vi.spyOn(LocalApi.prototype, 'stop').mockReturnValue(neverFinishes());

    const disposing = stalling.dispose();
    expect(
      await finishesWithin(disposing, hungTeardownMs),
      'dispose() did not resolve, so nothing bounded the step'
    ).toBe(true);
    expect((await disposing).stalledSteps).toEqual(['api']);

    const stalls = (await readRecords(stalling.util.pathTo.logs)).filter(
      (record) => record.attributes?.['elek.teardown.step'] !== undefined
    );
    expect(stalls.map((record) => [record.level, record.message])).toEqual([
      [
        'warn',
        `Gave up on the local API after ${TEARDOWN_BOUND_MS}ms while disposing elek.io Core`,
      ],
    ]);
    expect(stalls[0]?.attributes).toMatchObject({
      'elek.teardown.step': 'api',
      'elek.duration_ms': TEARDOWN_BOUND_MS,
    });
  });

  it('names the credential relay, and closes the logger anyway', async function () {
    const dataDir = tmpDataDir();
    const stalling = new ElekIoCore({ dataDir, log });
    vi.spyOn(GitCredentialRelay.prototype, 'close').mockReturnValue(
      neverFinishes()
    );

    const disposing = stalling.dispose();
    expect(
      await finishesWithin(disposing, hungTeardownMs),
      'dispose() did not resolve, so nothing bounded the step'
    ).toBe(true);
    expect((await disposing).stalledSteps).toEqual(['relay']);

    const messages = (await readRecords(stalling.util.pathTo.logs)).map(
      (record) => record.message
    );
    expect(messages).toContain(
      `Gave up on the credential relay after ${TEARDOWN_BOUND_MS}ms while disposing elek.io Core`
    );
    // The logger ran after the stalled step and flushed, which is what put
    // the record above on disk
    expect(messages).toContain('Disposing elek.io Core');
  });

  it('names the logger, which no record of its own can name', async function () {
    const dataDir = tmpDataDir();
    // Other test files share this worker process, so the counts below are
    // read as deltas rather than as absolutes
    const uncaught = process.listenerCount('uncaughtException');
    const unhandled = process.listenerCount('unhandledRejection');
    const stalling = coreWithAStuckLogFile(dataDir);

    const disposing = stalling.dispose();
    expect(
      await finishesWithin(disposing, hungTeardownMs),
      'dispose() did not resolve, so nothing bounded the step'
    ).toBe(true);
    expect((await disposing).stalledSteps).toEqual(['logger']);
    // The same bounded promise every later caller of close() gets back
    expect(await stalling.logger.close()).toBe(false);
    // close() unhandles before it ends the stream, so a flush nobody waits
    // for any more still hands the process-level handlers back
    expect([
      process.listenerCount('uncaughtException'),
      process.listenerCount('unhandledRejection'),
    ]).toEqual([uncaught, unhandled]);
    // A host disposing on quit and again on a signal waits for nothing the
    // first call already gave up on
    const startedAt = Date.now();
    expect(await stalling.dispose()).toEqual({ stalledSteps: ['logger'] });
    expect(Date.now() - startedAt).toBeLessThan(TEARDOWN_BOUND_MS);
  });

  it('rejects when a step fails rather than reporting a stall', async function () {
    const dataDir = tmpDataDir();
    const failing = new ElekIoCore({ dataDir, log });
    vi.spyOn(LocalApi.prototype, 'stop').mockRejectedValue(
      new Error('the port is gone')
    );

    await expect(failing.dispose()).rejects.toThrow('the port is gone');

    vi.restoreAllMocks();
    expect(await failing.dispose()).toEqual({ stalledSteps: [] });
  });
});

describe('the bound of a step', function () {
  /** The timers of this worker that are keeping its event loop alive. */
  function referencedTimers(): number {
    return process
      .getActiveResourcesInfo()
      .filter((resource) => resource === 'Timeout').length;
  }

  it('holds the event loop, so an idle host cannot exit past it', function () {
    let finish = (): void => {};
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });

    // Read with nothing awaited in between, so no other timer of this
    // worker can appear or go between the two readings
    const before = referencedTimers();
    const bounded = finishesWithin(work, hungTeardownMs);
    const waiting = referencedTimers();

    expect(
      waiting - before,
      'An unreferenced bound only holds while something else keeps the loop alive, so a host with nothing left to do would exit before dispose() resolved and report nothing.'
    ).toBe(1);

    finish();
    return bounded.then((finished) => {
      expect(finished).toBe(true);
      expect(
        referencedTimers(),
        'A bound that is no longer waited on has to be cleared, or finishing work still costs the bound.'
      ).toBe(before);
    });
  });
});

describe('the bound a consumer reads', function () {
  it('is the one Core gives a step', async function () {
    const usage = Path.join(
      Path.dirname(fileURLToPath(import.meta.url)),
      '../../docs/usage.md'
    );

    expect(
      await Fs.readFile(usage, 'utf8'),
      'A consumer sizes their own shutdown on this number, so the doc has to carry the bound Core runs on.'
    ).toContain(`${TEARDOWN_BOUND_MS.toLocaleString('en-US')}ms`);
  });
});

describe("the cleanup of a test's Core", function () {
  it('fails in seconds naming a dispose step that never finished', async function () {
    const dataDir = tmpDataDir();
    const stalling = new ElekIoCore({ dataDir, log });
    vi.spyOn(LocalApi.prototype, 'stop').mockReturnValue(neverFinishes());

    const startedAt = Date.now();
    await expect(cleanUpTmpCore(stalling, dataDir)).rejects.toThrow(
      'gave up on: local API'
    );

    expect(Date.now() - startedAt).toBeLessThan(hungTeardownMs);
    // Every step after the stalled one still ran
    expect(await Fs.pathExists(dataDir)).toBe(false);
  });

  it('fails in seconds naming the credential relay', async function () {
    const dataDir = tmpDataDir();
    const stalling = new ElekIoCore({ dataDir, log });
    vi.spyOn(GitCredentialRelay.prototype, 'close').mockReturnValue(
      neverFinishes()
    );

    const startedAt = Date.now();
    await expect(cleanUpTmpCore(stalling, dataDir)).rejects.toThrow(
      'gave up on: credential relay'
    );

    expect(Date.now() - startedAt).toBeLessThan(hungTeardownMs);
    expect(await Fs.pathExists(dataDir)).toBe(false);
  });

  it('fails in seconds naming the logger', async function () {
    const dataDir = tmpDataDir();
    const stalling = coreWithAStuckLogFile(dataDir);

    const startedAt = Date.now();
    await expect(
      // The stuck transport still holds the log file, so the directory is
      // left to the helper above, which ends the transport for real first
      cleanUpTmpCore(stalling, dataDir, async () => {})
    ).rejects.toThrow('gave up on: logger');

    expect(Date.now() - startedAt).toBeLessThan(hungTeardownMs);
  });

  it('fails in seconds naming the data directory', async function () {
    const dataDir = tmpDataDir();
    const stalling = new ElekIoCore({ dataDir, log });

    const startedAt = Date.now();
    await expect(
      cleanUpTmpCore(stalling, dataDir, () => neverFinishes())
    ).rejects.toThrow('gave up on: data directory');

    expect(Date.now() - startedAt).toBeLessThan(hungTeardownMs);
    // Whoever reads the log of a failed run finds the step there too. The
    // shared Core writes it, because the test's own logger is closed by
    // then, and winston has no per transport flush, so the read repeats
    await vi.waitFor(
      async () => {
        const records = await readRecords(sharedCore.util.pathTo.logs);
        expect(
          records.map((record) => [record.level, record.message])
        ).toContainEqual([
          'error',
          "The cleanup of a test's Core gave up on: data directory",
        ]);
      },
      { timeout: hungTeardownMs, interval: 20 }
    );
  });

  it('fails nothing when a step is only slow', async function () {
    const dataDir = tmpDataDir();
    const slow = new ElekIoCore({ dataDir, log });
    // A fraction of the bound rather than a hair under it, so no jitter on
    // a slow runner can turn a slow step into a reported stall
    const slowly = async (path: string) => {
      await new Promise((resolve) => setTimeout(resolve, cleanupTimeoutMs / 3));
      await Fs.remove(path);
    };

    await expect(
      cleanUpTmpCore(slow, dataDir, slowly)
    ).resolves.toBeUndefined();
    expect(await Fs.pathExists(dataDir)).toBe(false);
  });

  it('reports nothing when every step finishes', async function () {
    const dataDir = tmpDataDir();
    const finishing = new ElekIoCore({ dataDir, log });

    expect(await finishing.dispose()).toEqual({ stalledSteps: [] });
    await expect(cleanUpTmpCore(finishing, dataDir)).resolves.toBeUndefined();
    expect(await Fs.pathExists(dataDir)).toBe(false);
  });
});
