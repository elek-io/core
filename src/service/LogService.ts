import Path from 'path';
import {
  createLogger,
  format,
  Logger,
  QueryOptions,
  transports,
} from 'winston';
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
    this.logger = createLogger({
      level: options.log.level,
      transports: [
        new transports.File({
          handleExceptions: true,
          handleRejections: true,
          filename: Path.join(pathTo.logs, 'core.log'),
          format: format.combine(format.timestamp(), format.json()),
        }),
        new transports.Console({
          handleExceptions: true,
          handleRejections: true,
          format: format.cli(),
        }),
      ],
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
    this.logger.query(options);
  }
}
