import Os from 'node:os';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LogService } from './LogService.js';
import type { ElekIoCoreOptions } from '../schema/index.js';
import { createPathTo } from '../util/node.js';

const options: ElekIoCoreOptions = {
  log: { level: 'debug', hasProcessErrorHandlers: true },
  cache: true,
  cloud: { url: 'https://api.elek.io' },
  dataDir: Path.join(Os.tmpdir(), 'elek-io-core-logservice-test'),
  isReadOnly: false,
};
const pathTo = createPathTo(options.dataDir);

// Other test files share this worker process, so assert on deltas, not
// absolute process listener counts.
describe('LogService teardown', function () {
  it('returns process listeners to baseline after create + close', async function () {
    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');

    const log = new LogService(options, pathTo);
    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled + 1);

    await log.close();
    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled);
  });

  it('does not accumulate listeners across many create / close cycles', async function () {
    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');

    for (let i = 0; i < 15; i++) {
      const log = new LogService(options, pathTo);
      await log.close();
    }

    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled);
  });
});

describe('LogService double close', function () {
  it('resolves a second close, so a double dispose does not hang', async function () {
    // winston ends the underlying stream on the first call, and an ended
    // stream never emits `finish` again
    const log = new LogService(options, pathTo);

    await log.close();
    await expect(
      Promise.race([
        log.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('close() never resolved')), 5000)
        ),
      ])
    ).resolves.toBeUndefined();
  });

  it('resolves both when two closes are in flight at once', async function () {
    const log = new LogService(options, pathTo);

    await expect(
      Promise.race([
        Promise.all([log.close(), log.close()]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('close() never resolved')), 5000)
        ),
      ])
    ).resolves.toEqual([undefined, undefined]);
  });
});

describe('LogService writes after close', function () {
  it('drops a record instead of throwing at the ended stream', function () {
    // Teardown races the last in-flight service call, and a host that logs
    // through core.logger may still hold it after dispose()
    const log = new LogService(options, pathTo);

    return log.close().then(() => {
      expect(() =>
        log.info({ source: 'core', message: 'after close' })
      ).not.toThrow();
    });
  });

  it('still rejects a malformed payload', function () {
    const log = new LogService(options, pathTo);

    return log.close().then(() => {
      // @ts-expect-error a source the union does not carry, which is what
      // the schema is there to catch whether or not teardown has run
      expect(() => log.info({ source: 42, message: 'after close' })).toThrow();
    });
  });
});

describe('LogService exception handling', function () {
  it('does not let the console transport handle exceptions', function () {
    // The console transport writing an uncaught exception to a stdout that
    // is itself broken is what closed the loop: an EPIPE from the console
    // write became a new uncaughtException, which winston wrote to the
    // console again, 5450 times a second for 13 minutes. See
    // contributing/logging.md.
    const handlers = LogService.createTransports(
      options,
      pathTo
    ).transports.filter((transport) => transport.handleExceptions === true);

    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBeInstanceOf(DailyRotateFile);
  });

  it('does not let the console transport handle rejections either', function () {
    const handlers = LogService.createTransports(
      options,
      pathTo
    ).transports.filter((transport) => transport.handleRejections === true);

    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBeInstanceOf(DailyRotateFile);
  });

  it('keeps the durable sink handling them, so nothing is lost', function () {
    const { rotatingFile } = LogService.createTransports(options, pathTo);

    expect(rotatingFile.handleExceptions).toBe(true);
    expect(rotatingFile.handleRejections).toBe(true);
  });
});

describe('LogService process error handlers', function () {
  it('leaves the transport flags off when opted out, which is what winston keys on', function () {
    const { transports } = LogService.createTransports(
      { ...options, log: { ...options.log, hasProcessErrorHandlers: false } },
      pathTo
    );

    expect(
      transports.filter((transport) => transport.handleExceptions === true)
    ).toHaveLength(0);
    expect(
      transports.filter((transport) => transport.handleRejections === true)
    ).toHaveLength(0);
  });

  it('registers them by default, which is what Core has always done', async function () {
    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');

    const log = new LogService(options, pathTo);

    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled + 1);
    await log.close();
  });

  it('registers none when the host owns its own error handling', async function () {
    // What the Astro entry does. Inside a build the host owns the process,
    // and Core taking it over is what let one broken pipe run away.
    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');

    const log = new LogService(
      { ...options, log: { ...options.log, hasProcessErrorHandlers: false } },
      pathTo
    );

    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(baseUnhandled);
    await log.close();
  });

  it('closes cleanly when it registered none', async function () {
    const baseUncaught = process.listenerCount('uncaughtException');

    const log = new LogService(
      { ...options, log: { ...options.log, hasProcessErrorHandlers: false } },
      pathTo
    );
    await log.close();

    expect(process.listenerCount('uncaughtException')).toBe(baseUncaught);
  });
});
