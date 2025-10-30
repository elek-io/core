import { createMiddleware } from 'hono/factory';
import type { ApiEnv } from '../lib/types.js';

/**
 * Middleware that logs the details of each request and response
 */
export const requestResponseLogger = createMiddleware<ApiEnv>(
  async (c, next) => {
    const { method, url } = c.req;
    const requestId = c.get('requestId');

    c.var.logService.info(
      `Recieved API request "${method} ${url}" with requestId ${requestId}`
    );
    const start = Date.now();

    await next();

    const durationMs = Date.now() - start;
    const statusCode = c.res.status.toString();
    const resultLog = `Response for API request "${method} ${url}" with requestId ${requestId} and status code ${statusCode} in ${durationMs}ms`;

    if (statusCode.startsWith('2')) {
      c.var.logService.info(resultLog);
    } else if (statusCode.startsWith('3')) {
      c.var.logService.warn(resultLog);
    } else if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
      c.var.logService.error(resultLog);
    }
  }
);
