import { describe, expect, it } from 'vitest';
import { logRecordSchema, type LogResource } from '../schema/logSchema.js';
import { LogService } from './LogService.js';

/**
 * A log file is parsed for 30 days, so its record shape is expensive to
 * change later. It follows the OpenTelemetry Logs Data Model, see
 * contributing/logging.md.
 */
const resource: Omit<LogResource, 'service.name'> = {
  'service.version': '0.24.0',
  'os.type': 'linux',
  'host.arch': 'amd64',
};

function info(props: Record<string, unknown>) {
  return {
    level: 'info',
    message: 'Created file "/tmp/a.json"',
    timestamp: '2026-08-21T14:02:11.000Z',
    source: 'core',
    ...props,
  };
}

describe('toLogRecord', function () {
  it('writes a record the schema describes', function () {
    const record = LogService.toLogRecord(info({}), resource);

    expect(logRecordSchema.safeParse(record).success).toBe(true);
    expect(record.timestamp).toBe('2026-08-21T14:02:11.000Z');
    expect(record.message).toBe('Created file "/tmp/a.json"');
  });

  it('adds the SeverityNumber of every level Core logs at', function () {
    const numbers = (['debug', 'info', 'warn', 'error'] as const).map(
      (level) =>
        LogService.toLogRecord(info({ level }), resource).severityNumber
    );

    expect(numbers).toEqual([5, 9, 13, 17]);
  });

  it('keeps the level text next to the number, because both are read', function () {
    expect(
      LogService.toLogRecord(info({ level: 'warn' }), resource).level
    ).toBe('warn');
  });

  it('maps a level Core does not know to UNSPECIFIED', function () {
    expect(
      LogService.toLogRecord(info({ level: 'silly' }), resource).severityNumber
    ).toBe(0);
  });

  it('lifts the source onto the Resource, since it describes the emitter', function () {
    const record = LogService.toLogRecord(
      info({ source: 'desktop' }),
      resource
    );

    expect(record.resource['service.name']).toBe('desktop');
    expect(Object.keys(record)).not.toContain('source');
  });

  it('carries the Core version for records Core emitted', function () {
    expect(
      LogService.toLogRecord(info({}), resource).resource['service.version']
    ).toBe('0.24.0');
  });

  it('leaves a host record unversioned when the host declared nothing', function () {
    // Core cannot know the version of a host that logs through it, so an
    // undeclared one is left out rather than guessed at
    expect(
      LogService.toLogRecord(info({ source: 'desktop' }), resource).resource[
        'service.version'
      ]
    ).toBeUndefined();
  });

  it('carries the host version when the host declared one', function () {
    // Otherwise a log file sent on its own, without a report around it,
    // cannot be tied to the build that wrote it
    const record = LogService.toLogRecord(
      info({ source: 'desktop' }),
      resource,
      '0.3.4'
    );

    expect(record.resource['service.version']).toBe('0.3.4');
    expect(logRecordSchema.safeParse(record).success).toBe(true);
  });

  it('never lets a declared host version reach a record Core emitted', function () {
    expect(
      LogService.toLogRecord(info({}), resource, '0.3.4').resource[
        'service.version'
      ]
    ).toBe('0.24.0');
  });

  it('falls back to core for a record with no source, which is what winston writes', function () {
    expect(
      LogService.toLogRecord(info({ source: undefined }), resource).resource
    ).toEqual({
      'service.name': 'core',
      ...resource,
    });
  });

  it('moves meta to attributes and leaves the dotted keys alone', function () {
    const record = LogService.toLogRecord(
      info({ meta: { 'elek.project.id': 'abc', 'file.path': '/tmp/a.json' } }),
      resource
    );

    expect(record.attributes).toEqual({
      'elek.project.id': 'abc',
      'file.path': '/tmp/a.json',
    });
  });

  it('omits attributes when there are none, rather than writing an empty object', function () {
    expect(
      Object.keys(LogService.toLogRecord(info({}), resource))
    ).not.toContain('attributes');
  });

  it('leaves TraceId and SpanId unset until there is something to put in them', function () {
    const keys = Object.keys(LogService.toLogRecord(info({}), resource));

    expect(keys).not.toContain('traceId');
    expect(keys).not.toContain('spanId');
    expect(keys).not.toContain('traceFlags');
  });

  it('writes only the keys the record shape names', function () {
    // The record is built from an allowlist rather than from whatever
    // winston left on the info object, which is what keeps a field nobody
    // reviewed out of a file that can be attached to a bug report
    const record = LogService.toLogRecord(
      info({ splat: ['x'], somethingNobodyReviewed: 'leak' }),
      resource
    );

    expect(Object.keys(record).toSorted()).toEqual([
      'level',
      'message',
      'resource',
      'severityNumber',
      'timestamp',
    ]);
  });
});

describe('toLogRecord for the records winston writes itself', function () {
  const error = new TypeError('write EPIPE');
  error.stack = 'TypeError: write EPIPE\n    at Socket._write';

  const exception = {
    level: 'error',
    message: `uncaughtException: write EPIPE\n${error.stack}`,
    timestamp: '2026-08-21T14:02:11.000Z',
    stack: error.stack,
    error,
    exception: true,
    date: 'Fri Aug 21 2026',
    process: { pid: 1, cwd: '/home/nils', argv: ['node', 'x'] },
    os: { loadavg: [0], uptime: 1 },
    trace: [{ file: '/home/nils/x.js', line: 1 }],
  };

  it('describes an uncaught exception through the exception attributes', function () {
    const record = LogService.toLogRecord(exception, resource);

    expect(record.attributes).toEqual({
      'exception.type': 'TypeError',
      'exception.message': 'write EPIPE',
      'exception.stacktrace': error.stack,
    });
  });

  it('takes the stack out of the message, so the message stays one line', function () {
    expect(LogService.toLogRecord(exception, resource).message).toBe(
      'uncaughtException: write EPIPE'
    );
  });

  it('does not carry winston process and os blocks into the file', function () {
    // They repeat the Resource and add process.cwd, execPath and argv,
    // which is the account name and an arbitrary command line
    const written = JSON.stringify(LogService.toLogRecord(exception, resource));

    expect(written).not.toContain('/home/nils');
    expect(written).not.toContain('loadavg');
  });

  it('describes an unhandled rejection the same way', function () {
    const record = LogService.toLogRecord(
      { ...exception, exception: false, rejection: true },
      resource
    );

    expect(record.attributes?.['exception.type']).toBe('TypeError');
  });

  it('survives a thrown value that is not an Error', function () {
    const record = LogService.toLogRecord(
      {
        level: 'error',
        message: 'uncaughtException: boom',
        timestamp: '2026-08-21T14:02:11.000Z',
        error: 'boom',
        exception: true,
      },
      resource
    );

    expect(record.attributes?.['exception.message']).toBe('boom');
  });
});

describe('createLogResource', function () {
  it('uses the Semantic Convention value, not the Node one', function () {
    expect(
      LogService.createLogResource({
        coreVersion: '0.24.0',
        platform: 'win32',
        arch: 'x64',
      })
    ).toEqual({
      'service.version': '0.24.0',
      'os.type': 'windows',
      'host.arch': 'amd64',
    });
  });

  it('passes through the values that already match', function () {
    expect(
      LogService.createLogResource({
        coreVersion: '0.24.0',
        platform: 'darwin',
        arch: 'arm64',
      })
    ).toEqual({
      'service.version': '0.24.0',
      'os.type': 'darwin',
      'host.arch': 'arm64',
    });
  });

  it('keeps a value it has no mapping for rather than dropping it', function () {
    expect(
      LogService.createLogResource({
        coreVersion: '0.24.0',
        platform: 'haiku',
        arch: 'riscv64',
      })
    ).toEqual({
      'service.version': '0.24.0',
      'os.type': 'haiku',
      'host.arch': 'riscv64',
    });
  });
});
