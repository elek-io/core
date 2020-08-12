import Fs from 'fs-extra';
import Pino from 'pino';
import SonicBoom from 'sonic-boom';
import _ from 'lodash';

/**
 * Base Logger to extend on
 */
export default abstract class Logger {
  public log: Pino.Logger;
  private _options: Pino.LoggerOptions = {};
  private _destination: SonicBoom;

  constructor(filePath: string) {

    // Assure the log file exists
    Fs.ensureFileSync(filePath);

    // Assign the file destination
    this._destination = Pino.destination(filePath);

    // Pretty print when not in production
    if (process.env.NODE_ENV !== 'production') {
      this._options = {
        level: 'debug',
        // prettyPrint: true
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
    _.forEach(['uncaughtException', 'unhandledRejection'], (errorToHandle) => {
      process.on(errorToHandle, Pino.final(this.log, (err, finalLogger) => {
        finalLogger.error(err, errorToHandle);
        process.exit(1);
      }));
    });
  }
}