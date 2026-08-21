import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { type ElekIoCoreOptions } from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import type { LogProps } from '../schema/logSchema.js';
import { logConsoleTransportSchema, logSchema } from '../schema/logSchema.js';

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
    format: format.combine(format.timestamp(), format.json()),
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
        meta: { error },
      });
    });

    this.logger = createLogger({
      level: options.log.level,
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
