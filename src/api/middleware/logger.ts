import { createMiddleware } from 'hono/factory';
import { LogService } from '../../service/index.js';

export class LoggerMiddleware {
  private logService: LogService;

  constructor(logService: LogService) {
    this.logService = logService;
  }

  public handler = createMiddleware(async (c, next) => {
    const { method, url } = c.req;

    this.logService.info(`Recieved API request "${method} ${url}"`);
    const start = Date.now();

    await next();

    const durationMs = Date.now() - start;
    const statusCode = c.res.status.toString();
    const resultLog = `Response for API request "${method} ${url}" with status code ${statusCode} in ${durationMs}ms`;

    if (statusCode.startsWith('2')) {
      this.logService.info(resultLog);
    } else if (statusCode.startsWith('3')) {
      this.logService.warn(resultLog);
    } else if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
      this.logService.error(resultLog);
    }
  });
}
