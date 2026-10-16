import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import type { LogAttributeName, LogRecord } from '../schema/logSchema.js';
import { logSeverityNumbers } from '../schema/logSchema.js';

export const gzip = promisify(gzipCallback);

/**
 * OpenTelemetry names the operating system and the CPU architecture from
 * its own enumerations, which are not the values Node reports. A
 * Semantic Convention name has to carry a Semantic Convention value, so
 * the two Node spells differently are translated and everything else
 * passes through unchanged.
 */
export const OS_TYPES: Record<string, string> = {
  win32: 'windows',
  sunos: 'solaris',
};
export const HOST_ARCHS: Record<string, string> = {
  x64: 'amd64',
  ia32: 'x86',
  arm: 'arm32',
  ppc: 'ppc32',
};

export const SEVERITY_NUMBERS = new Map<string, number>(
  Object.entries(logSeverityNumbers)
);

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a tail reaches */
export const TAIL_WINDOW_MS = DAY_MS;

/** Written before a tail is collected, so a reader can see where one ended */
export const TAIL_MARKER = 'Collecting a log tail';

/**
 * Ceiling on the records of a tail, before they are gzipped.
 *
 * A safety valve rather than a working limit. Collapsing the repeated
 * records is what keeps a tail small: it was worth 2079x on the day a
 * broken pipe filled a log file with one stack, and a realistic tail is
 * 1 to 25 KB. JSONL of this shape compresses at least fourfold, so even
 * a tail that reaches this ceiling stays inside the 1 MB a report may
 * carry. The oldest records go first, because a report is about what
 * just happened.
 */
const TAIL_MAX_BYTES = 4 * 1024 * 1024;

export const REDACTED = '[redacted]';
export const REDACTED_EMAIL = '[email]';

// Named rather than inlined, so the vocabulary in logSchema.ts types them
export const MASKED_COUNT: LogAttributeName = 'redaction.masked.count';
export const REDACTED_COUNT: LogAttributeName = 'redaction.redacted.count';
const REPEAT_COUNT: LogAttributeName = 'elek.log.repeat.count';
const REPEAT_LAST_TIMESTAMP: LogAttributeName =
  'elek.log.repeat.last_timestamp';

/**
 * Key names whose value is a credential, dropped from a tail at whatever
 * depth they sit.
 *
 * Sentry's default denylist, matched as a substring. It is the backstop
 * for the `meta` a host hands `core.logger` over IPC, whose shape Core
 * cannot type, and it runs over every record rather than only a host's: a
 * Core attribute matching one of these would be a leak, not a false
 * positive. `logTail.test.ts` checks that no declared name matches, so
 * this cannot start dropping something Core meant to write. See
 * contributing/logging.md.
 */
export const SECRET_KEY_PARTS = [
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'auth',
  'credentials',
  'privatekey',
  'private_key',
  'token',
  'bearer',
];

/**
 * Collects the records of a tail in order, collapsing a run of identical ones
 * into the first of them and a count.
 *
 * That collapse is the whole algorithm rather than a nicety, and it happens
 * during the read. A collector rather than state on `LogService`, because it
 * belongs to one call of `tail()` rather than to the service.
 *
 * @see ../../contributing/logging.md
 */
export class TailBuffer {
  private readonly lines: (string | undefined)[] = [];
  private head = 0;
  private bytes = 0;
  private pending: LogRecord | undefined;
  private pendingKey = '';
  private repeats = 0;
  private lastTimestamp = '';
  /** True once the oldest records were dropped to stay under the ceiling */
  public isTruncated = false;

  /** Takes the next record in file order, folding it into a run of repeats */
  public add(record: LogRecord): void {
    const key = TailBuffer.collapseKeyOf(record);
    if (this.pending !== undefined && key === this.pendingKey) {
      this.repeats += 1;
      this.lastTimestamp = record.timestamp;
      return;
    }
    this.flush();
    this.pending = record;
    this.pendingKey = key;
    this.repeats = 0;
    this.lastTimestamp = record.timestamp;
  }

  /** Every record that survived, one JSON object per line */
  public end(): string {
    this.flush();
    return this.lines
      .slice(this.head)
      .filter((line) => line !== undefined)
      .join('\n');
  }

  /** What everything but the timestamp of a record says */
  private static collapseKeyOf(record: LogRecord): string {
    return JSON.stringify({ ...record, timestamp: '' });
  }

  private static withRepeats(
    record: LogRecord,
    count: number,
    lastTimestamp: string
  ): LogRecord {
    return {
      ...record,
      attributes: {
        ...record.attributes,
        [REPEAT_COUNT]: count,
        [REPEAT_LAST_TIMESTAMP]: lastTimestamp,
      },
    };
  }

  private flush(): void {
    if (this.pending === undefined) {
      return;
    }
    const record =
      this.repeats > 0
        ? TailBuffer.withRepeats(
            this.pending,
            this.repeats + 1,
            this.lastTimestamp
          )
        : this.pending;
    this.pending = undefined;
    this.push(JSON.stringify(record));
  }

  private push(line: string): void {
    this.lines.push(line);
    this.bytes += Buffer.byteLength(line) + 1;
    while (this.bytes > TAIL_MAX_BYTES && this.head < this.lines.length - 1) {
      const dropped = this.lines[this.head];
      this.bytes -= Buffer.byteLength(dropped ?? '') + 1;
      // Freed rather than spliced, so a very long file is not held twice
      this.lines[this.head] = undefined;
      this.head += 1;
      this.isTruncated = true;
    }
  }
}
