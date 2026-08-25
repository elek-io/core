import { createMiddleware } from 'hono/factory';
import type { LogProps } from '../../schema/index.js';
import type { ApiEnv } from '../lib/types.js';

/**
 * Middleware that logs the details of each request and response
 */
export const requestResponseLogger = createMiddleware<ApiEnv>(
  async (c, next) => {
    const { method, url } = c.req;
    const requestId = c.get('requestId');

    c.var.logService.info({
      source: 'core',
      message: `Received API request "${method} ${url}" with requestId ${requestId}`,
      meta: {
        'http.request.method': method,
        'url.full': url,
        'elek.request.id': requestId,
      },
    });
    const start = Date.now();

    await next();

    const durationMs = Date.now() - start;
    const statusCode = c.res.status.toString();
    const resultLog: LogProps = {
      source: 'core',
      message: `Response for API request "${method} ${url}" with requestId ${requestId} and status code ${statusCode} in ${durationMs}ms`,
      meta: {
        'http.request.method': method,
        'url.full': url,
        'elek.request.id': requestId,
        'http.response.status_code': c.res.status,
        'elek.duration_ms': durationMs,
      },
    };

    if (statusCode.startsWith('2')) {
      c.var.logService.info(resultLog);
    } else if (statusCode.startsWith('3')) {
      c.var.logService.warn(resultLog);
    } else if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
      c.var.logService.error(resultLog);
    }
  }
);
