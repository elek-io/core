import type { Logform, Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as packageJson from '../../package.json' with { type: 'json' };
import { type ElekIoCoreOptions } from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import type { LogProps, LogRecord, LogResource } from '../schema/logSchema.js';
import {
  logConsoleTransportSchema,
  logSchema,
  logSeverityNumbers,
  logSourceSchema,
} from '../schema/logSchema.js';

/** The Resource without the part that differs per record */
type LogResourceBase = Omit<LogResource, 'service.name'>;

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

/**
 * Builds the part of the Resource that is the same for every record of
 * this process
 */
export function createLogResource(props: {
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
 * The record is built from an allowlist rather than from whatever is left
 * on the info object. Core's log files can be attached to a bug report,
 * so a field nobody reviewed must not reach one: winston's own uncaught
 * exception record carries `process.cwd`, `process.execPath` and
 * `process.argv`, none of which Core authored. See
 * contributing/logging.md.
 */
export function toLogRecord(
  info: Logform.TransformableInfo,
  resource: LogResourceBase
): LogRecord {
  const source = logSourceSchema.safeParse(info['source']).data ?? 'core';
  const attributes = {
    ...exceptionAttributes(info),
    ...metaAttributes(info['meta']),
  };
  const message =
    typeof info.message === 'string' ? info.message : String(info.message);

  return {
    timestamp:
      typeof info['timestamp'] === 'string'
        ? info['timestamp']
        : new Date().toISOString(),
    level: info.level,
    severityNumber: severityNumberOf(info.level),
    // winston joins the stack onto an exception message, which belongs in
    // exception.stacktrace rather than in the Body
    message: isThrown(info) ? (message.split('\n')[0] ?? message) : message,
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

const SEVERITY_NUMBERS = new Map<string, number>(
  Object.entries(logSeverityNumbers)
);

function severityNumberOf(level: string): number {
  // 0 is UNSPECIFIED, which is what a level Core does not know is
  return SEVERITY_NUMBERS.get(level) ?? 0;
}

/** True for the records winston writes itself, which Core never authored */
function isThrown(info: Logform.TransformableInfo): boolean {
  return info['exception'] === true || info['rejection'] === true;
}

function exceptionAttributes(
  info: Logform.TransformableInfo
): Record<string, unknown> {
  if (!isThrown(info)) {
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

function metaAttributes(meta: unknown): Record<string, unknown> {
  if (typeof meta !== 'object' || meta === null) {
    return {};
  }
  return { ...meta };
}

/**
 * Builds the transports a LogService logs through.
 *
 * Exported so the exception handling policy can be asserted directly.
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
export function createTransports(
  options: ElekIoCoreOptions,
  pathTo: PathTo
): { transports: Logger['transports']; rotatingFile: DailyRotateFile } {
  const resource = createLogResource({
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
        const record = toLogRecord(info, resource);
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
 * Service that handles logging to file and console
 */
export class LogService {
  private readonly logger: Logger;

  constructor(options: ElekIoCoreOptions, pathTo: PathTo) {
    const { transports: logTransports, rotatingFile } = createTransports(
      options,
      pathTo
    );

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
}
