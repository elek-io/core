import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LogService } from './LogService.js';
import type { ElekIoCoreOptions } from '../schema/index.js';
import { createPathTo } from '../util/node.js';
import { finishesWithin } from '../util/teardown.js';
import { hungTeardownMs } from '../test/budgets.js';
import { uuid } from '../util/shared.js';

const options: ElekIoCoreOptions = {
  log: { level: 'debug', hasProcessErrorHandlers: true },
  cache: true,
  cloud: { url: 'https://api.elek.io', gitUrl: 'https://*.git.elek.io' },
  dataDir: Path.join(Os.tmpdir(), `elek-io-core-logservice-test-${uuid()}`),
  isReadOnly: false,
};
const pathTo = createPathTo(options.dataDir);

afterAll(async function () {
  await Fs.remove(options.dataDir);
});

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
    const second = log.close();
    expect(
      await finishesWithin(second, hungTeardownMs),
      'close() never resolved'
    ).toBe(true);
    expect(await second).toBe(true);
  });

  it('resolves both when two closes are in flight at once', async function () {
    const log = new LogService(options, pathTo);

    const both = Promise.all([log.close(), log.close()]);
    expect(
      await finishesWithin(both, hungTeardownMs),
      'close() never resolved'
    ).toBe(true);
    expect(await both).toEqual([true, true]);
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

/**
 * `core.logger.mask()` is what an application showing text Core wrote runs
 * it through, so it keeps no copy of these rules. See
 * contributing/logging.md.
 */
describe('the masker an application can call', function () {
  it('masks a credential, an address and this process home directory', async function () {
    const log = new LogService(options, pathTo);
    const home = Os.homedir();

    expect(
      log.mask(
        `Cloning https://nils:ghp_notreal@github.com/a/b.git into ${Path.join(home, 'elek.io')}`
      )
    ).toBe(
      `Cloning https://[redacted]@github.com/a/b.git into ${Path.join('~', 'elek.io')}`
    );
    expect(log.mask('mara@autohaus-ebersfelde.de: Permission denied')).toBe(
      '[email]: Permission denied'
    );
    expect(log.mask('Remote git@github.com:elek-io/core.git')).toBe(
      'Remote git@github.com:elek-io/core.git'
    );
    await log.close();
  });

  it('runs the rules a tail runs, rather than a copy of them', async function () {
    const log = new LogService(options, pathTo);
    const scrub = LogService.createLogScrubber({
      homedir: Os.homedir(),
      platform: process.platform,
    });
    const text = `git commit --author=John Doe <john.doe@test.com> in ${Os.homedir()} from https://nils:ghp_notreal@github.com/a/b.git`;

    expect(log.mask(text)).toBe(
      scrub({
        timestamp: '2026-08-21T14:02:11.000Z',
        level: 'info',
        severityNumber: 9,
        message: text,
        resource: {
          'service.name': 'core',
          'service.version': '0.0.0',
          'os.type': 'linux',
          'host.arch': 'amd64',
        },
      }).message
    );
    await log.close();
  });

  it('answers any string without throwing, since it guards text it did not build', async function () {
    const log = new LogService(options, pathTo);
    const strange = [
      '',
      ' ',
      '[]{}()*+?^$|\\',
      '%',
      '%E0%A4%A',
      '\u{1F600}',
      '\uD800',
      'a@b',
      'https://',
      '@'.repeat(500),
      'x'.repeat(100_000),
    ];

    for (const text of strange) {
      expect(typeof log.mask(text)).toBe('string');
    }
    await log.close();
  });
});
