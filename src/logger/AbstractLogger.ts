import Fs from 'fs-extra';
import Pino from 'pino';
import SonicBoom from 'sonic-boom';

export default abstract class AbstractLogger {
  public readonly log: Pino.Logger;
  private readonly options: Pino.LoggerOptions = {};
  private readonly destination: SonicBoom;

  protected constructor(filePath: string) {
    Fs.ensureFileSync(filePath);

    // Assign the file destination
    this.destination = Pino.destination(filePath);

    // Pretty print when not in production
    if (process.env.NODE_ENV !== 'production') {
      this.options = {
        level: 'debug',
        prettyPrint: true
      };
    }

    this.log = Pino(this.options, this.destination);
    this.registerEmergencyFlush();
  }

  /**
   * Reliably flush every log line in case of unexpected crashes to prevent loosing logs
   * 
   * @see http://getpino.io/#/docs/help?id=exit-logging
   */
  private registerEmergencyFlush() {
    ['uncaughtException', 'unhandledRejection'].forEach((errorToHandle) => {
      process.on(errorToHandle, Pino.final(this.log, (err, finalLogger) => {
        finalLogger.error(err, errorToHandle);
        process.exit(1);
      }));
    });
  }
}
