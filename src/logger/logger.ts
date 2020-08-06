import Fs from 'fs-extra';
import Pino from 'pino';
import SonicBoom from 'sonic-boom';

/**
 * Base Logger to extend on
 */
export default class Logger {
  public log: Pino.Logger;
  private _options: Pino.LoggerOptions = {};
  private _destination: SonicBoom;

  constructor(filePath: string) {

    // Assure the log file exists
    Fs.ensureFileSync(filePath);

    // Assign the file destination
    this._destination = Pino.destination(filePath);

    // Pretty print when not in production
    // if (process.env.NODE_ENV !== 'production') {
    //   this._options = {
    //     prettyPrint: true
    //   };
    // }

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