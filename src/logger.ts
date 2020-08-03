import Fs from 'fs-extra';
import Path from 'path';
import Pino from 'pino';
import SonicBoom from 'sonic-boom';
import * as Util from './util';

/**
 * Logger
 * 
 * @todo check how to write to the log file without prettyPrint
 * while not in production environment
 */
export default class Logger {
  public log: Pino.Logger;
  private _options: Pino.LoggerOptions = {};
  private _destination: SonicBoom;

  constructor(projectId?: string) {
    // Can be a logger for a specific project in which case the logs
    // will be written to the projects "logs" directory
    let destinationPath = '';
    if (projectId) {
      destinationPath = Path.join(Util.pathTo.projectLogs(projectId), 'core.log');
    } else {
      destinationPath = Path.join(Util.pathTo.logs, 'core.log');
    }

    // Assure the log file exists
    Fs.ensureFileSync(destinationPath);

    // Assign the file destination
    this._destination = Pino.destination(destinationPath);

    // Pretty print when not in production
    if (process.env.NODE_ENV !== 'production') {
      this._options = {
        prettyPrint: true
      };
    }

    this.log = Pino(this._options, this._destination);

    this.registerEmergencyFlush();
  }

  /**
   * Reliably flush every log line in case of unexpected crashes to prevent loosing logs
   * 
   * @see http://getpino.io/#/docs/help?id=exit-logging
   */
  private registerEmergencyFlush() {
    process.on('uncaughtException', Pino.final(this.log, (err, finalLogger) => {
      finalLogger.error(err, 'uncaughtException');
      process.exit(1);
    }));
    process.on('unhandledRejection', Pino.final(this.log, (err, finalLogger) => {
      finalLogger.error(err, 'unhandledRejection');
      process.exit(1);
    }));
  }
}