import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import { logRecordSchema, type LogRecord } from '../schema/logSchema.js';
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
    const records = await readRecords(dataDir);

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
    const records = await readRecords(dataDir);

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
 * Every record written so far, oldest file first. The transport writes on a
 * stream, so a yielded macrotask gives it a chance to drain first, the same
 * hedge `tail()` uses.
 */
async function readRecords(dataDir: string): Promise<LogRecord[]> {
  await new Promise((resolve) => setImmediate(resolve));

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
