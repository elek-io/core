import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  logAttributeNames,
  logRecordSchema,
  logTailSchema,
  type LogRecord,
  type LogTail,
} from '../schema/logSchema.js';
import { createTmpCore } from '../test/util.js';
import { LogService } from './LogService.js';

/**
 * `core.logger.tail()` reads a window of log files back and hands it over
 * as one gzipped blob. Everything it does is either about what a reader
 * needs (ordering, ids, counts) or about what must not leave the machine.
 * See contributing/logging.md.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const host = { 'os.type': 'linux', 'host.arch': 'amd64' };

/** A file name winston-daily-rotate-file would have written that many days ago */
function logFileName(daysAgo: number, extension = '.log'): string {
  const date = new Date(Date.now() - daysAgo * DAY_MS);
  return `${date.toISOString().slice(0, 10)}${extension}`;
}

function record(props: Partial<LogRecord> & { message: string }): LogRecord {
  return {
    timestamp: new Date(Date.now() - HOUR_MS).toISOString(),
    level: 'info',
    severityNumber: 9,
    resource: {
      'service.name': 'core',
      'service.version': '0.24.0',
      ...host,
    },
    ...props,
  };
}

async function seedLogFile(
  dir: string,
  name: string,
  lines: unknown[]
): Promise<void> {
  await Fs.mkdirp(dir);
  const body = `${lines
    .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
    .join('\n')}\n`;
  const path = Path.join(dir, name);
  if (name.endsWith('.gz')) {
    await Fs.writeFile(path, gzipSync(Buffer.from(body, 'utf8')));
  } else {
    await Fs.writeFile(path, body, 'utf8');
  }
}

function recordsOf(tail: LogTail): LogRecord[] {
  return gunzipSync(Buffer.from(tail.data, 'base64'))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line))
    .map((line) => logRecordSchema.parse(line));
}

function messagesOf(tail: LogTail): string[] {
  return recordsOf(tail).map((entry) => entry.message);
}

describe('the tail a report carries', function () {
  it('covers the last 24 hours and says how it is encoded', async function () {
    const { core } = createTmpCore();

    const tail = await core.logger.tail();

    expect(logTailSchema.safeParse(tail).success).toBe(true);
    expect(tail.encoding).toBe('gzip+base64');
    expect(Date.parse(tail.to) - Date.parse(tail.from)).toBe(DAY_MS);
    expect(tail.isTruncated).toBe(false);
  });

  it('marks in the log file where it ended, since the last lines can be missing', async function () {
    // winston hands a record to a write stream and has no per transport
    // flush, so a tail collected right after a crash can stop short of the
    // interesting lines. The marker says where it stopped
    const { core } = createTmpCore();

    const tail = await core.logger.tail();

    expect(messagesOf(tail)).toContain('Collecting a log tail');
  });

  it('reads an old plain file next to a gzipped one, oldest record first', async function () {
    // The transport only gzips on a rotation event while the process is
    // running, so closing the app leaves yesterday's file plain forever
    const { core } = createTmpCore();
    const logs = core.util.pathTo.logs;
    await seedLogFile(logs, logFileName(2), [
      record({
        message: 'older, still plain',
        timestamp: new Date(Date.now() - 4 * HOUR_MS).toISOString(),
      }),
    ]);
    await seedLogFile(logs, logFileName(1, '.log.gz'), [
      record({
        message: 'newer, rotated and gzipped',
        timestamp: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
      }),
    ]);

    const messages = messagesOf(await core.logger.tail());

    expect(messages.indexOf('older, still plain')).toBeGreaterThanOrEqual(0);
    expect(messages.indexOf('older, still plain')).toBeLessThan(
      messages.indexOf('newer, rotated and gzipped')
    );
  });

  it('drops a record older than the window', async function () {
    const { core } = createTmpCore();
    await seedLogFile(core.util.pathTo.logs, logFileName(1), [
      record({
        message: 'inside the window',
        timestamp: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
      }),
      record({
        message: 'outside the window',
        timestamp: new Date(Date.now() - 30 * HOUR_MS).toISOString(),
      }),
    ]);

    const messages = messagesOf(await core.logger.tail());

    expect(messages).toContain('inside the window');
    expect(messages).not.toContain('outside the window');
  });

  it('never opens a log file from a day the window cannot reach', async function () {
    // 30 days are kept and one of them measured 78 MB, so which files are
    // opened is the difference between a tail and a stall
    const { core } = createTmpCore();
    await seedLogFile(core.util.pathTo.logs, logFileName(10), [
      record({ message: 'ten days ago' }),
    ]);

    expect(messagesOf(await core.logger.tail())).not.toContain('ten days ago');
  });

  it('ignores the rotation audit file, whatever is in it', async function () {
    // The dotfile the transport keeps its rotation state in. It is named
    // for a hash rather than a day, and nothing in it is a log record
    const { core } = createTmpCore();
    const logs = core.util.pathTo.logs;
    await Fs.mkdirp(logs);
    await Fs.writeFile(
      Path.join(logs, '.52822b-audit.json'),
      JSON.stringify(record({ message: 'not a log file' })),
      'utf8'
    );

    const tail = await core.logger.tail();

    expect(logTailSchema.safeParse(tail).success).toBe(true);
    expect(messagesOf(tail).length).toBeGreaterThan(0);
    expect(messagesOf(tail)).not.toContain('not a log file');
  });

  it('gives up on a file that will not decompress and reads the rest', async function () {
    const { core } = createTmpCore();
    const logs = core.util.pathTo.logs;
    await Fs.mkdirp(logs);
    await Fs.writeFile(
      Path.join(logs, logFileName(2, '.log.gz')),
      Buffer.from('this was never gzipped'),
      'utf8'
    );
    await seedLogFile(logs, logFileName(1), [
      record({ message: 'the file that still reads' }),
    ]);

    expect(messagesOf(await core.logger.tail())).toContain(
      'the file that still reads'
    );
  });

  it('keeps the records a half written line sits next to', async function () {
    // A log file is read while it is being written, so the last line of it
    // is regularly half a record
    const { core } = createTmpCore();
    await seedLogFile(core.util.pathTo.logs, logFileName(1), [
      record({ message: 'before the damage' }),
      '{"timestamp":"2026-08-21T14:0',
      '',
      'not json at all',
      // Valid JSON, but nothing a log file ever wrote
      { hello: 'world' },
      record({ message: 'after the damage' }),
    ]);

    const messages = messagesOf(await core.logger.tail());

    expect(messages).toContain('before the damage');
    expect(messages).toContain('after the damage');
  });
});

describe('what a tail leaves behind', function () {
  it('takes the home directory out of a path and keeps the structure', async function () {
    const { core } = createTmpCore();
    const path = Path.join(
      Os.homedir(),
      'elek.io',
      'projects',
      'a3f',
      'collections',
      'b71.json'
    );
    await seedLogFile(core.util.pathTo.logs, logFileName(1), [
      record({
        message: `Created file "${path}"`,
        attributes: { 'file.path': path },
      }),
    ]);

    const created = recordsOf(await core.logger.tail()).find((entry) =>
      entry.message.startsWith('Created file')
    );

    // The path is the join key against the repository, so only the account
    // name comes out of it
    expect(created?.message).toContain(
      Path.join('~', 'elek.io', 'projects', 'a3f', 'collections', 'b71.json')
    );
    expect(created?.message).not.toContain(Os.homedir());
    expect(created?.attributes?.['file.path']).not.toContain(Os.homedir());
    expect(created?.attributes?.['redaction.masked.count']).toBe(2);
  });

  it('drops a key the meta of a host should not be carrying', async function () {
    // Desktop's meta arrives over IPC with a shape Core cannot type, so
    // the key names are all there is to go on
    const { core } = createTmpCore();
    await seedLogFile(core.util.pathTo.logs, logFileName(1), [
      record({
        message: 'Navigated',
        resource: { 'service.name': 'desktop', ...host },
        attributes: {
          accessToken: 'ghp_notreal',
          apiKey: 'sk-notreal',
          route: '/projects/a3f',
        },
      }),
    ]);

    const navigated = recordsOf(await core.logger.tail()).find(
      (entry) => entry.message === 'Navigated'
    );

    expect(navigated?.attributes).toEqual({
      route: '/projects/a3f',
      'redaction.redacted.count': 2,
    });
  });

  it('never drops a name Core declared, which is what makes the denylist safe', function () {
    // The denylist matches key names by substring and runs over every
    // record, so a Core attribute matching one would silently disappear
    const scrub = LogService.createLogScrubber({
      homedir: '/home/nils',
      platform: 'linux',
    });
    const attributes = Object.fromEntries(
      logAttributeNames.map((name) => [name, 'kept'])
    );

    const scrubbed = scrub(
      record({ message: 'every declared name', attributes })
    );

    expect(Object.keys(scrubbed.attributes ?? {}).toSorted()).toEqual(
      [...logAttributeNames].toSorted()
    );
  });
});

describe('collapsing what repeated', function () {
  it('turns a run of identical records into one and a count', async function () {
    // 20789 copies of one stack were 67% of a measured day. Without this a
    // report would spend its whole budget on them
    const { core } = createTmpCore();
    const last = new Date(Date.now() - HOUR_MS).toISOString();
    await seedLogFile(core.util.pathTo.logs, logFileName(1), [
      ...[5, 4, 3, 2].map((hoursAgo) =>
        record({
          level: 'error',
          severityNumber: 17,
          message: 'uncaughtException: write EPIPE',
          timestamp: new Date(Date.now() - hoursAgo * HOUR_MS).toISOString(),
        })
      ),
      record({
        level: 'error',
        severityNumber: 17,
        message: 'uncaughtException: write EPIPE',
        timestamp: last,
      }),
    ]);

    const repeated = recordsOf(await core.logger.tail()).filter(
      (entry) => entry.message === 'uncaughtException: write EPIPE'
    );

    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.attributes?.['elek.log.repeat.count']).toBe(5);
    // The first timestamp stays exact and the last one says how long it ran
    expect(repeated[0]?.attributes?.['elek.log.repeat.last_timestamp']).toBe(
      last
    );
  });

  it('leaves a record that repeated but not consecutively', async function () {
    const { core } = createTmpCore();
    await seedLogFile(core.util.pathTo.logs, logFileName(1), [
      record({
        message: 'Cache miss',
        timestamp: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
      }),
      record({
        message: 'Created file',
        timestamp: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
      }),
      record({
        message: 'Cache miss',
        timestamp: new Date(Date.now() - HOUR_MS).toISOString(),
      }),
    ]);

    const messages = messagesOf(await core.logger.tail());

    expect(messages.filter((message) => message === 'Cache miss')).toHaveLength(
      2
    );
  });

  it('drops the oldest records when the ceiling bites, and says so', async function () {
    const { core } = createTmpCore();
    const filler = 'x'.repeat(1000);
    await seedLogFile(
      core.util.pathTo.logs,
      logFileName(1),
      Array.from({ length: 5000 }, (_unused, index) =>
        record({
          message: `${index} ${filler}`,
          timestamp: new Date(Date.now() - 12 * HOUR_MS + index).toISOString(),
        })
      )
    );

    const tail = await core.logger.tail();
    const messages = messagesOf(tail);

    expect(tail.isTruncated).toBe(true);
    // A report is about what just happened, so the newest records stay
    expect(messages).toContain(`4999 ${filler}`);
    expect(messages).not.toContain(`0 ${filler}`);
  }, 60000);
});

describe('the scrubbers a tail runs, for the records Core did not author', function () {
  const timestamp = '2026-08-21T14:02:11.000Z';

  function scrubbed(props: {
    message: string;
    homedir?: string;
    platform?: string;
  }): LogRecord {
    const scrub = LogService.createLogScrubber({
      homedir: props.homedir ?? '/home/nils',
      platform: props.platform ?? 'linux',
    });
    return scrub(record({ message: props.message, timestamp }));
  }

  it('matches the home directory whatever its case on Windows', function () {
    // C:\Users\Nils and C:\users\nils both occur, and a path can arrive
    // with either separator
    const backslashed = scrubbed({
      message: 'Created file "C:\\users\\nils\\elek.io\\projects\\a3f.json"',
      homedir: 'C:\\Users\\Nils',
      platform: 'win32',
    });
    const slashed = scrubbed({
      message: 'Created file "C:/Users/Nils/elek.io/projects/a3f.json"',
      homedir: 'C:\\Users\\Nils',
      platform: 'win32',
    });

    expect(backslashed.message).toBe(
      'Created file "~\\elek.io\\projects\\a3f.json"'
    );
    expect(slashed.message).toBe('Created file "~/elek.io/projects/a3f.json"');
  });

  it('matches the home directory exactly everywhere else', function () {
    expect(scrubbed({ message: '/HOME/NILS/elek.io' }).message).toBe(
      '/HOME/NILS/elek.io'
    );
  });

  it('takes the git signature off a command line an older Core wrote', function () {
    expect(
      scrubbed({
        message:
          'Executed "git commit --author=John Doe <john.doe@test.com> --message=Create entry a3f"',
      }).message
    ).toBe(
      'Executed "git commit --author=[redacted] --message=Create entry a3f"'
    );
    expect(
      scrubbed({ message: 'git config --local user.name John Doe' }).message
    ).toBe('git config --local user.name [redacted]');
    expect(
      scrubbed({ message: 'git config --local user.email john@test.com' })
        .message
    ).toBe('git config --local user.email [redacted]');
  });

  it('leaves a command line the write site already redacted alone', function () {
    const already = scrubbed({
      message:
        'Executed "git commit --author=[redacted] --message=Create entry a3f"',
    });

    expect(already.message).toBe(
      'Executed "git commit --author=[redacted] --message=Create entry a3f"'
    );
    expect(already.attributes?.['redaction.masked.count']).toBeUndefined();
  });

  it('takes a credential out of a URL and keeps the host', function () {
    expect(
      scrubbed({
        message: 'Cloning https://nils:ghp_notreal@github.com/a/b.git',
      }).message
    ).toBe('Cloning https://[redacted]@github.com/a/b.git');
  });

  it('names an address rather than removing it', function () {
    expect(
      scrubbed({ message: 'Reached out to me@example.com.' }).message
    ).toBe('Reached out to [email].');
  });

  it('leaves the SSH shorthand, where the user is part of the address', function () {
    expect(
      scrubbed({ message: 'Remote git@github.com:elek-io/core.git' }).message
    ).toBe('Remote git@github.com:elek-io/core.git');
  });

  it('reaches into a nested attribute, since a host meta may nest', function () {
    const scrub = LogService.createLogScrubber({
      homedir: '/home/nils',
      platform: 'linux',
    });

    const result = scrub(
      record({
        message: 'Initializing elek.io Core',
        timestamp,
        attributes: { options: { dataDir: '/home/nils/elek.io', token: 'x' } },
      })
    );

    expect(result.attributes).toEqual({
      options: { dataDir: '~/elek.io' },
      'redaction.masked.count': 1,
      'redaction.redacted.count': 1,
    });
  });
});
