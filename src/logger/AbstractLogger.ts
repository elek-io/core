import Fs from 'fs-extra';
import Pino from 'pino';
import SonicBoom from 'sonic-boom';
import { CoreEventName } from '../../type/coreEvent';
import EventService from '../service/EventService';

export default abstract class AbstractLogger {
  public readonly log: Pino.Logger;
  private readonly eventService: EventService;
  private readonly options: Pino.LoggerOptions = {};
  private readonly destination: SonicBoom;

  protected constructor(filePath: string, eventService: EventService) {
    this.eventService = eventService;
    Fs.ensureFileSync(filePath);

    // Assign the file destination
    this.destination = Pino.destination(filePath);

    // Log all debug messages when not in production
    if (process.env.NODE_ENV !== 'production') {
      this.options = {
        level: 'debug'
      };
    }

    this.log = Pino(this.options, this.destination);
    this.registerEmergencyFlush();
  }

  /**
   * Reliably flush every log line in case of unexpected crashes to prevent loosing logs.
   * Also emits an event to spread the bad news 
   * 
   * @see http://getpino.io/#/docs/help?id=exit-logging
   */
  private registerEmergencyFlush() {
    ['uncaughtException', 'unhandledRejection'].forEach((errorToHandle) => {
      process.on(errorToHandle, Pino.final(this.log, (err, finalLogger) => {
        finalLogger.error(err, errorToHandle);
        this.eventService.emit(CoreEventName.ERROR, {
          data: {
            error: err,
            message: errorToHandle
          } 
        });
      }));
    });
  }
}
