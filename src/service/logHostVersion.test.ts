import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { logRecordSchema, type LogRecord } from '../schema/logSchema.js';
import { logDrainTimeoutMs } from '../test/budgets.js';
import { createTmpCore } from '../test/util.js';

/**
 * A log file is often all we get. Somebody who zips `<dataDir>/logs` and
 * mails it sends no report around it, so the file itself has to say which
 * build wrote it. Core stamps `service.version` on its own records and
 * cannot know a host's, so `log.hostVersion` is how a host declares one.
 *
 * See contributing/logging.md.
 */
describe('log.hostVersion', function () {
  it('stamps service.version on a host record, and never on a Core one', async function () {
    const { core, dataDir } = createTmpCore({
      log: { level: 'info', hostVersion: '0.3.4' },
    });

    core.logger.info({ source: 'desktop', message: 'zqx-canary-host-record' });
    const records = await recordsHolding(dataDir, 'zqx-canary-host-record');

    const host = records.find((record) =>
      record.message.includes('zqx-canary-host-record')
    );
    expect(host?.resource['service.name']).toBe('desktop');
    expect(host?.resource['service.version']).toBe('0.3.4');

    // Core's own records keep Core's version, not the host's
    const own = records.find(
      (record) => record.resource['service.name'] === 'core'
    );
    expect(own).toBeDefined();
    expect(own?.resource['service.version']).not.toBe('0.3.4');
  });

  it('leaves a host record unversioned when nothing was declared', async function () {
    const { core, dataDir } = createTmpCore({ log: { level: 'info' } });

    core.logger.info({ source: 'desktop', message: 'zqx-canary-no-version' });
    const records = await recordsHolding(dataDir, 'zqx-canary-no-version');

    const host = records.find((record) =>
      record.message.includes('zqx-canary-no-version')
    );
    expect(host?.resource['service.name']).toBe('desktop');
    expect(host?.resource['service.version']).toBeUndefined();
  });

  it('refuses a version that is not semver, rather than writing it', function () {
    // The read contract validates `service.version`, so an unparseable one
    // would make every record of that run unreadable to `tail()`
    expect(() =>
      createTmpCore({ log: { level: 'info', hostVersion: 'nightly' } })
    ).toThrow();
  });
});

/**
 * Every record written so far, read again until the one holding the given
 * text is among them. The transport writes on a stream, and a single yielded
 * macrotask is not always enough for it to drain, which left the read empty
 * and the assertion below it reading `undefined`.
 *
 * The wait takes the measured drain budget, which is above vitest's
 * 1,000ms default, rather than that default.
 */
async function recordsHolding(
  dataDir: string,
  text: string
): Promise<LogRecord[]> {
  let records: LogRecord[] = [];
  await vi.waitFor(
    async () => {
      records = await readRecords(dataDir);
      if (records.some((record) => record.message.includes(text)) === false) {
        throw new Error(`no record holding "${text}" yet`);
      }
    },
    { timeout: logDrainTimeoutMs, interval: 20 }
  );
  return records;
}

/** Every record written so far, oldest file first. */
async function readRecords(dataDir: string): Promise<LogRecord[]> {
  const dir = Path.join(dataDir, 'logs');
  if ((await Fs.pathExists(dir)) === false) {
    return [];
  }
  const names = (await Fs.readdir(dir)).filter((name) => name.endsWith('.log'));
  const contents = await Promise.all(
    names.map(async (name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );

  return contents
    .flatMap((content) => content.split('\n'))
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const parsed = logRecordSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    });
}
