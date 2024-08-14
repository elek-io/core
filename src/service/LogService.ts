import Path from 'path';
import winston from 'winston';
import { type ElekIoCoreOptions } from '../schema/index.js';
import { workingDirectory } from '../util/node.js';

/**
 * Service that handles logging to file and console
 *
 * @todo maybe use child loggers to expose for usage in Client and later plugins
 */
export class LogService {
  private readonly logger: winston.Logger;

  constructor(options: ElekIoCoreOptions) {
    this.logger = winston.createLogger({
      level: options.log.level,
      transports: [
        new winston.transports.File({
          filename: Path.join(workingDirectory, 'core.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        }),
        new winston.transports.Console({
          format: winston.format.cli(),
        }),
      ],
    });
  }

  public debug(message: string, ...meta: any[]): winston.Logger {
    return this.logger.debug(message, ...meta);
  }

  public info(message: string, ...meta: any[]): winston.Logger {
    return this.logger.info(message, ...meta);
  }

  public warn(message: string, ...meta: any[]): winston.Logger {
    return this.logger.warn(message, ...meta);
  }

  public error(message: string, ...meta: any[]): winston.Logger {
    return this.logger.error(message, ...meta);
  }

  public read(options?: winston.QueryOptions) {
    this.logger.query(options);
  }
}
