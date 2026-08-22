import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { createGunzip, gzip as gzipCallback } from 'node:zlib';
import type { Logform, Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as packageJson from '../../package.json' with { type: 'json' };
import { type ElekIoCoreOptions } from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import type {
  LogAttributeName,
  LogProps,
  LogRecord,
  LogResource,
  LogTail,
} from '../schema/logSchema.js';
import {
  logConsoleTransportSchema,
  logRecordSchema,
  logSchema,
  logSeverityNumbers,
  logSourceSchema,
} from '../schema/logSchema.js';

const gzip = promisify(gzipCallback);

/** The Resource without the part that differs per record */
type LogResourceBase = Omit<LogResource, 'service.name'>;

/** How much of a record was rewritten, and how much of it went */
type RedactionCounts = { masked: number; redacted: number };

/**
 * OpenTelemetry names the operating system and the CPU architecture from
 * its own enumerations, which are not the values Node reports. A
 * Semantic Convention name has to carry a Semantic Convention value, so
 * the two Node spells differently are translated and everything else
 * passes through unchanged.
 */
const OS_TYPES: Record<string, string> = { win32: 'windows', sunos: 'solaris' };
const HOST_ARCHS: Record<string, string> = {
  x64: 'amd64',
  ia32: 'x86',
  arm: 'arm32',
  ppc: 'ppc32',
};

const SEVERITY_NUMBERS = new Map<string, number>(
  Object.entries(logSeverityNumbers)
);

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a tail reaches */
const TAIL_WINDOW_MS = DAY_MS;

/** Written before a tail is collected, so a reader can see where one ended */
const TAIL_MARKER = 'Collecting a log tail';

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

const REDACTED = '[redacted]';
const REDACTED_EMAIL = '[email]';

// Named rather than inlined, so the vocabulary in logSchema.ts types them
const MASKED_COUNT: LogAttributeName = 'redaction.masked.count';
const REDACTED_COUNT: LogAttributeName = 'redaction.redacted.count';
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
const SECRET_KEY_PARTS = [
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
 * Collects the records of a tail in order, collapsing a run of identical
 * ones into the first of them and a count.
 *
 * That collapse is the whole algorithm rather than a nicety. A measured
 * day was 78 MB, 67% of it one repeated stack, and it came out at 0.04 MB
 * without dropping anything a reader needs. It is what removes the need
 * for a trim loop, and it happens during the read, since reading 78 MB
 * into memory to collapse it afterwards defeats the point.
 *
 * A collector rather than state on `LogService`, because it belongs to
 * one call of `tail()` rather than to the service.
 */
class TailBuffer {
  private readonly lines: (string | undefined)[] = [];
  private head = 0;
  private bytes = 0;
  private pending: LogRecord | undefined;
  private pendingKey = '';
  private repeats = 0;
  private lastTimestamp = '';
  public isTruncated = false;

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

/**
 * Service that handles logging to file and console
 */
export class LogService {
  private readonly logger: Logger;
  private readonly pathTo: PathTo;

  constructor(options: ElekIoCoreOptions, pathTo: PathTo) {
    this.pathTo = pathTo;
    const { transports: logTransports, rotatingFile } =
      LogService.createTransports(options, pathTo);

    rotatingFile.on('rotate', (oldFilename, newFilename) => {
      this.info({
        message: `Rotated log file from ${oldFilename} to ${newFilename}`,
        source: 'core',
      });
    });

    rotatingFile.on('error', (error) => {
      this.error({
        message: `Error rotating log file: ${error.message}`,
        source: 'core',
        meta: {
          'exception.type': error.name,
          'exception.message': error.message,
        },
      });
    });

    this.logger = createLogger({
      level: options.log.level,
      // The timestamp every record is written with. Set once here rather
      // than per transport, so the console formatting its own copy cannot
      // change what lands in the file
      format: format.timestamp(),
      transports: logTransports,
    });
  }

  public debug(props: LogProps) {
    const { source, message, meta } = logSchema.parse(props);

    this.logger.debug(message, { source, meta });
  }

  public info(props: LogProps) {
    const { source, message, meta } = logSchema.parse(props);

    this.logger.info(message, { source, meta });
  }

  public warn(props: LogProps) {
    const { source, message, meta } = logSchema.parse(props);

    this.logger.warn(message, { source, meta });
  }

  public error(props: LogProps) {
    const { source, message, meta } = logSchema.parse(props);

    this.logger.error(message, { source, meta });
  }

  /**
   * Reads the last 24 hours of log files back as one gzipped blob.
   *
   * Public because it is a log concern rather than a reporting one: it is
   * what a report attaches when the User consented to it, and equally
   * what a "save my diagnostics to a file" button writes out with no
   * network involved.
   *
   * What comes back is safe to hand to someone else. The records Core
   * authored are safe already, since that is decided at the call site,
   * and the rest is scrubbed here: the home directory prefix, and the key
   * names a host's `meta` must not carry a value under. Ids, paths and
   * timestamps stay exact, because they are what makes a line resolvable
   * against the repository. See contributing/logging.md.
   */
  public async tail(): Promise<LogTail> {
    // winston hands a record to a write stream and there is no per
    // transport flush, so a tail collected right after a crash can stop
    // short of the lines it was collected for. Yielding a macrotask gives
    // the stream a chance to drain, and the marker says in the file where
    // the tail ended. A hedge rather than a fix, see docs/features.md
    this.info({ source: 'core', message: TAIL_MARKER });
    await new Promise((resolve) => setImmediate(resolve));

    const to = new Date();
    const from = new Date(to.getTime() - TAIL_WINDOW_MS);
    const buffer = new TailBuffer();
    const scrub = LogService.createLogScrubber({
      homedir: Os.homedir(),
      platform: process.platform,
    });

    for (const name of await LogService.logFilesInWindow(
      this.pathTo.logs,
      from,
      to
    )) {
      await LogService.readLogFile(
        Path.join(this.pathTo.logs, name),
        (line) => {
          const record = LogService.toTailRecord(line);
          if (record === null) {
            return;
          }
          const time = Date.parse(record.timestamp);
          if (time < from.getTime() || time > to.getTime()) {
            return;
          }
          buffer.add(scrub(record));
        }
      );
    }

    const data = await gzip(Buffer.from(buffer.end(), 'utf8'));

    return {
      encoding: 'gzip+base64',
      from: from.toISOString(),
      to: to.toISOString(),
      isTruncated: buffer.isTruncated,
      data: data.toString('base64'),
    };
  }

  /**
   * Flushes and closes the logger, removing the process-level
   * exception and rejection handlers it registered
   */
  public close(): Promise<void> {
    // Remove the process handlers first, synchronously, so an ended logger is
    // never left with a live exception or rejection handler
    this.logger.exceptions.unhandle();
    this.logger.rejections.unhandle();
    return new Promise<void>((resolve) => {
      // Graceful flush, ends each transport before emitting 'finish'
      this.logger.once('finish', () => resolve());
      this.logger.end();
    });
  }

  /**
   * Builds the part of the Resource that is the same for every record of
   * this process.
   *
   * Static and taking its inputs rather than reading `process`, so what a
   * platform is written as can be asserted for all of them from any one.
   */
  public static createLogResource(props: {
    coreVersion: string;
    platform: string;
    arch: string;
  }): LogResourceBase {
    return {
      'service.version': props.coreVersion,
      'os.type': OS_TYPES[props.platform] ?? props.platform,
      'host.arch': HOST_ARCHS[props.arch] ?? props.arch,
    };
  }

  /**
   * Turns what winston hands a transport into the record written to a log
   * file, following the OpenTelemetry Logs Data Model.
   *
   * The record is built from an allowlist rather than from whatever is
   * left on the info object. Core's log files can be attached to a bug
   * report, so a field nobody reviewed must not reach one: winston's own
   * uncaught exception record carries `process.cwd`, `process.execPath`
   * and `process.argv`, none of which Core authored. See
   * contributing/logging.md.
   */
  public static toLogRecord(
    info: Logform.TransformableInfo,
    resource: LogResourceBase
  ): LogRecord {
    const source = logSourceSchema.safeParse(info['source']).data ?? 'core';
    const attributes = {
      ...LogService.exceptionAttributes(info),
      ...LogService.metaAttributes(info['meta']),
    };
    const message =
      typeof info.message === 'string' ? info.message : String(info.message);

    return {
      timestamp:
        typeof info['timestamp'] === 'string'
          ? info['timestamp']
          : new Date().toISOString(),
      level: info.level,
      severityNumber: LogService.severityNumberOf(info.level),
      // winston joins the stack onto an exception message, which belongs in
      // exception.stacktrace rather than in the Body
      message: LogService.isThrown(info)
        ? (message.split('\n')[0] ?? message)
        : message,
      resource: {
        'service.name': source,
        // Core does not know the version of a host that logs through it
        ...(source === 'core'
          ? { 'service.version': resource['service.version'] }
          : {}),
        'os.type': resource['os.type'],
        'host.arch': resource['host.arch'],
      },
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    };
  }

  /**
   * Builds the transports a LogService logs through.
   *
   * Static so the exception handling policy can be asserted directly.
   * `service/index.ts` is not re-exported from the package entries, so
   * this stays internal to Core.
   *
   * Only the rotating file handles exceptions and rejections. The console
   * must not, because winston writes an uncaught exception to every
   * transport that handles them: a console write that fails is itself a
   * new uncaught exception, which winston writes to the console again.
   * That loop was measured at 5450 records a second for 13 minutes inside
   * an Astro build whose stdout pipe had closed. The file transport is
   * never part of it, since the sink it writes to is not the one failing.
   * See contributing/logging.md.
   */
  public static createTransports(
    options: ElekIoCoreOptions,
    pathTo: PathTo
  ): { transports: Logger['transports']; rotatingFile: DailyRotateFile } {
    const resource = LogService.createLogResource({
      coreVersion: packageJson.default.version,
      platform: process.platform,
      arch: process.arch,
    });

    const rotatingFile = new DailyRotateFile({
      dirname: pathTo.logs,
      filename: '%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
      // winston registers its process-level listeners because a transport
      // declares these, so leaving them off is what keeps Core out of the
      // host's error handling entirely.
      handleExceptions: options.log.hasProcessErrorHandlers,
      handleRejections: options.log.hasProcessErrorHandlers,
      format: format.combine(
        format((info) => {
          // What reaches the file is the record, not whatever winston left
          // on the info object
          const record = LogService.toLogRecord(info, resource);
          for (const key of Object.keys(info)) {
            delete info[key];
          }
          return Object.assign(info, record);
        })(),
        // Insertion order rather than winston's default alphabetical one, so
        // a line reads timestamp first. Still circular safe, which matters
        // for the meta a host hands Core over IPC
        format.json({ deterministic: false })
      ),
    });

    const consoleTransport = new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf((props) => {
          // winston stashes the extra arguments of a log call under a symbol
          // key its TransformableInfo type does not describe, so reaching them
          // means naming both the key and what it holds
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const splatArgs = props[Symbol.for('splat') as unknown as string] as
            Record<string, unknown>[] | undefined;
          const result = logConsoleTransportSchema.safeParse({
            ...splatArgs?.[0],
            timestamp: props['timestamp'],
            level: props.level,
            message: props.message,
          });

          if (result.success) {
            const { timestamp, level, source, message } = result.data;
            return `${timestamp} [${source}] ${level}: ${message}`;
          }

          // Fallback for logs not originating from LogService (e.g. unhandled exceptions caught by winston)
          return `${String(props['timestamp'])} ${props.level}: ${String(props.message)}`;
        })
      ),
    });

    return { transports: [rotatingFile, consoleTransport], rotatingFile };
  }

  /**
   * Takes out of a record what must not leave the machine, and says how
   * much it took.
   *
   * OpenTelemetry's redaction processor stamps `redaction.redacted.count`
   * and `redaction.masked.count` on a record it changed, so a reader can
   * tell a deliberate gap from an empty one. A tail carries the same two.
   *
   * The machine is an input rather than something this reads off
   * `process`, so what Windows does with a home directory it spells two
   * ways can be asserted from anywhere.
   */
  public static createLogScrubber(props: {
    homedir: string;
    platform: string;
  }): (record: LogRecord) => LogRecord {
    const mask = LogService.createLogMasker(props);

    return (record) => {
      const counts: RedactionCounts = { masked: 0, redacted: 0 };
      const message = LogService.scrubValue(record.message, mask, counts);
      const scrubbed = LogService.scrubValue(
        record.attributes ?? {},
        mask,
        counts
      );
      const attributes: Record<string, unknown> = {
        ...(typeof scrubbed === 'object' && scrubbed !== null ? scrubbed : {}),
      };
      if (counts.redacted > 0) {
        attributes[REDACTED_COUNT] = counts.redacted;
      }
      if (counts.masked > 0) {
        attributes[MASKED_COUNT] = counts.masked;
      }

      const next: LogRecord = {
        ...record,
        message: typeof message === 'string' ? message : record.message,
      };
      if (Object.keys(attributes).length > 0) {
        next.attributes = attributes;
      } else {
        delete next.attributes;
      }
      return next;
    };
  }

  private static severityNumberOf(level: string): number {
    // 0 is UNSPECIFIED, which is what a level Core does not know is
    return SEVERITY_NUMBERS.get(level) ?? 0;
  }

  /** True for the records winston writes itself, which Core never authored */
  private static isThrown(info: Logform.TransformableInfo): boolean {
    return info['exception'] === true || info['rejection'] === true;
  }

  private static exceptionAttributes(
    info: Logform.TransformableInfo
  ): Record<string, unknown> {
    if (!LogService.isThrown(info)) {
      return {};
    }

    const attributes: Record<string, unknown> = {};
    const error: unknown = info['error'];
    if (error instanceof Error) {
      attributes['exception.type'] = error.name;
      attributes['exception.message'] = error.message;
    } else if (typeof error === 'string') {
      // Anything can be thrown, not only an Error
      attributes['exception.message'] = error;
    } else if (error !== undefined && error !== null) {
      attributes['exception.message'] = JSON.stringify(error);
    }
    if (typeof info['stack'] === 'string') {
      attributes['exception.stacktrace'] = info['stack'];
    }
    return attributes;
  }

  private static metaAttributes(meta: unknown): Record<string, unknown> {
    if (typeof meta !== 'object' || meta === null) {
      return {};
    }
    return { ...meta };
  }

  /**
   * Rewrites what a string must not say, for the records Core did not
   * author.
   *
   * Core decides at the call site what it writes down, so this is only
   * ever a backstop: for winston's uncaught exception text, and for the
   * `meta` a host logs through Core. It preserves the kind of what it
   * took out rather than removing it, because an absence reads as "this
   * did not happen".
   */
  private static createLogMasker(props: {
    homedir: string;
    platform: string;
  }): (value: string) => string {
    const home = LogService.homeExpressions(props);

    return (value) => {
      let masked = value
        // The git signature, which `redactGitArgs` takes out at the write
        // site. This is the backstop under it
        .replace(/--author=[^\s<][^<>\n]*<[^>\n]*>/g, `--author=${REDACTED}`)
        .replace(/--author=\S+/g, `--author=${REDACTED}`)
        .replace(/\buser\.(name|email)\s+\S.*/g, `user.$1 ${REDACTED}`)
        // A credential in a URL, never the SSH shorthand git@host:org/repo,
        // where the user is part of the address rather than a person
        .replace(/([a-zA-Z][\w+.-]*:\/\/)[^/@\s]+@/g, `$1${REDACTED}@`)
        .replace(
          /(?<![\w@.-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![:\w-])/g,
          REDACTED_EMAIL
        );
      for (const expression of home) {
        masked = masked.replace(expression, '~');
      }
      return masked;
    };
  }

  /**
   * The home directory as it can appear in a string.
   *
   * On Windows both `C:\Users\Nils` and `C:\users\nils` occur, and a path
   * can arrive with either separator, so the needle is matched case
   * insensitively and in both spellings there.
   */
  private static homeExpressions(props: {
    homedir: string;
    platform: string;
  }): RegExp[] {
    const { homedir, platform } = props;
    if (homedir.length < 2) {
      return [];
    }
    const isWindows = platform === 'win32';
    const needles = isWindows
      ? [...new Set([homedir, homedir.replaceAll('\\', '/')])]
      : [homedir];
    return needles.map(
      (needle) =>
        new RegExp(LogService.escapeRegExp(needle), isWindows ? 'gi' : 'g')
    );
  }

  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static isSecretAttributeKey(key: string): boolean {
    const lowercased = key.toLowerCase();
    return SECRET_KEY_PARTS.some((part) => lowercased.includes(part));
  }

  private static scrubValue(
    value: unknown,
    mask: (value: string) => string,
    counts: RedactionCounts
  ): unknown {
    if (typeof value === 'string') {
      const masked = mask(value);
      if (masked !== value) {
        counts.masked += 1;
      }
      return masked;
    }
    if (Array.isArray(value)) {
      return value.map((entry: unknown) =>
        LogService.scrubValue(entry, mask, counts)
      );
    }
    if (typeof value === 'object' && value !== null) {
      const scrubbed: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        if (LogService.isSecretAttributeKey(key)) {
          counts.redacted += 1;
          continue;
        }
        scrubbed[key] = LogService.scrubValue(entry, mask, counts);
      }
      return scrubbed;
    }
    return value;
  }

  /**
   * Reads one line of a log file as a record.
   *
   * A half written last line is the ordinary case rather than an error,
   * so anything that is not a record is skipped instead of throwing.
   */
  private static toTailRecord(line: string): LogRecord | null {
    if (line.trim() === '') {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return null;
    }
    return logRecordSchema.safeParse(parsed).data ?? null;
  }

  /** The day a log file is named after, or null for anything else */
  private static logFileDate(name: string): number | null {
    const match = /^(\d{4}-\d{2}-\d{2})\.log(\.gz)?$/.exec(name);
    if (match === null) {
      return null;
    }
    return Date.parse(`${match[1]}T00:00:00.000Z`);
  }

  /**
   * The log files that can hold a record of the window, oldest first.
   *
   * Keyed off the extension rather than the date, because the transport
   * only gzips on a rotation event while the process is running: close
   * the app and reopen it the next day and yesterday's file stays plain
   * forever. The rotation's `.*-audit.json` dotfiles are not log files.
   *
   * A file is named after a local date while a record is stamped in UTC,
   * so the range is padded by a day on either side. The record's own
   * timestamp is what decides, this only decides which of the 30 kept
   * files are worth opening at all.
   */
  private static async logFilesInWindow(
    dir: string,
    from: Date,
    to: Date
  ): Promise<string[]> {
    if ((await Fs.pathExists(dir)) === false) {
      return [];
    }
    const names = await Fs.readdir(dir);

    return names
      .flatMap((name) => {
        const date = LogService.logFileDate(name);
        return date === null ? [] : [{ name, date }];
      })
      .filter(
        (file) =>
          file.date + 2 * DAY_MS >= from.getTime() &&
          file.date - DAY_MS <= to.getTime()
      )
      .toSorted((a, b) => a.date - b.date)
      .map((file) => file.name);
  }

  /**
   * Streams a log file line by line, gunzipping a rotated one on the way.
   *
   * Never read into memory whole: a real one measured 78 MB, and the
   * point of collapsing during the read is that it never has to be.
   */
  private static async readLogFile(
    path: string,
    onLine: (line: string) => void
  ): Promise<void> {
    const file = Fs.createReadStream(path);
    const isGzipped = path.endsWith('.gz');
    const stream = isGzipped ? file.pipe(createGunzip()) : file;
    if (isGzipped) {
      // `pipe` does not forward an error, so a file that cannot be read
      // would otherwise leave the gunzip stream waiting for a chunk that
      // never comes, and the tail with it
      file.on('error', (error) => stream.destroy(error));
    }
    const lines = createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const line of lines) {
        onLine(line);
      }
    } catch {
      // A truncated or corrupt file gives up what it already read, which
      // is better than a report with no logs in it at all
    } finally {
      lines.close();
      stream.destroy();
      file.destroy();
    }
  }
}
