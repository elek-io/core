import Path from 'path';
import {
  createLogger,
  format,
  Logger,
  QueryOptions,
  transports,
} from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { type ElekIoCoreOptions } from '../schema/index.js';
import { pathTo } from '../util/node.js';

/**
 * Service that handles logging to file and console
 *
 * @todo maybe use child loggers to expose for usage in Client and later plugins
 */
export class LogService {
  private readonly logger: Logger;

  constructor(options: ElekIoCoreOptions) {
    const rotatingFileTransport = new DailyRotateFile({
      filename: Path.join(pathTo.logs, 'core-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
      handleExceptions: true,
      handleRejections: true,
      format: format.combine(format.timestamp(), format.json()),
    });

    this.logger = createLogger({
      level: options.log.level,
      transports: [
        rotatingFileTransport,
        new transports.Console({
          handleExceptions: true,
          handleRejections: true,
          format: format.json(),
        }),
      ],
    });

    rotatingFileTransport.on('rotate', (oldFilename, newFilename) => {
      this.logger.info(
        `Rotated log file from ${oldFilename} to ${newFilename}`
      );
    });
  }

  public debug(message: string, ...meta: any[]): Logger {
    return this.logger.debug(message, ...meta);
  }

  public info(message: string, ...meta: any[]): Logger {
    return this.logger.info(message, ...meta);
  }

  public warn(message: string, ...meta: any[]): Logger {
    return this.logger.warn(message, ...meta);
  }

  public error(message: string, ...meta: any[]): Logger {
    return this.logger.error(message, ...meta);
  }

  public read(options?: QueryOptions) {
    return this.logger.query(options);
  }
}
