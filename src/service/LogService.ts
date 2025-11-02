import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { type ElekIoCoreOptions } from '../schema/index.js';
import { pathTo } from '../util/node.js';
import type { LogProps } from '../schema/logSchema.js';
import { logConsoleTransportSchema, logSchema } from '../schema/logSchema.js';

/**
 * Service that handles logging to file and console
 */
export class LogService {
  private readonly logger: Logger;

  constructor(options: ElekIoCoreOptions) {
    const rotatingFileTransport = new DailyRotateFile({
      dirname: pathTo.logs,
      filename: '%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
      handleExceptions: true,
      handleRejections: true,
      format: format.combine(format.timestamp(), format.json()),
    });

    rotatingFileTransport.on('rotate', (oldFilename, newFilename) => {
      this.info({
        message: `Rotated log file from ${oldFilename} to ${newFilename}`,
        source: 'core',
      });
    });

    rotatingFileTransport.on('error', (error) => {
      this.error({
        message: `Error rotating log file: ${error.message}`,
        source: 'core',
        meta: { error },
      });
    });

    const consoleTransport = new transports.Console({
      handleExceptions: true,
      handleRejections: true,
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf((props) => {
          const { timestamp, level, source, message } =
            logConsoleTransportSchema.parse({
              // @ts-expect-error TS can not know about splat properties - thats exactly why we are parsing it here
              ...props[Symbol.for('splat')][0],
              timestamp: props['timestamp'],
              level: props.level,
              message: props.message,
            });

          return `${timestamp} [${source}] ${level}: ${message}`;
        })
      ),
    });

    this.logger = createLogger({
      level: options.log.level,
      transports: [rotatingFileTransport, consoleTransport],
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
}
