import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { matchedRoutes } from 'hono/route';
import { METHOD_NAME_ALL } from 'hono/router';
import {
  uuidSchema,
  type LogAttributeName,
  type LogAttributes,
  type LogProps,
} from '../../schema/index.js';
import { entriesOf } from '../../util/typedObject.js';
import type { ApiEnv } from '../lib/types.js';

/** What `http.route` carries when nothing matched, so the record still says so */
const UNMATCHED = 'unmatched';

/**
 * Path parameters every route validates as a UUID, and the attribute each
 * one is written under.
 */
const idParameters = {
  projectId: 'elek.project.id',
  entryId: 'elek.entry.id',
  assetId: 'elek.asset.id',
} as const satisfies Record<string, LogAttributeName>;

/** The two path parameters that accept a slug instead of a UUID */
const idOrSlugParameters = ['collectionIdOrSlug', 'componentIdOrSlug'];

/**
 * Writes two records per request, the second one carrying the status class
 * as its level: 2xx `info`, 3xx `warn`, 4xx and 5xx `error`, anything else
 * unlogged.
 *
 * Both record the matched route pattern and the ids the request addressed,
 * never the URL, which carries whatever the caller sent.
 *
 * @see ../../../contributing/logging.md
 */
export const requestResponseLogger = createMiddleware<ApiEnv>(
  async (c, next) => {
    const { method } = c.req;
    const requestId = c.get('requestId');
    const route = matchedRoute(c);

    c.var.logService.info({
      source: 'core',
      message: `Received API request "${method} ${route}" with requestId ${requestId}`,
      meta: {
        'http.request.method': method,
        'http.route': route,
        'elek.request.id': requestId,
      },
    });
    const start = Date.now();

    await next();

    const durationMs = Date.now() - start;
    const statusCode = c.res.status.toString();
    const resultLog: LogProps = {
      source: 'core',
      message: `Response for API request "${method} ${route}" with requestId ${requestId} and status code ${statusCode} in ${durationMs}ms`,
      meta: {
        'http.request.method': method,
        'http.route': route,
        'elek.request.id': requestId,
        'http.response.status_code': c.res.status,
        'elek.duration_ms': durationMs,
        ...addressed(c),
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

/**
 * The route pattern the request matched, or `unmatched`.
 *
 * Middleware is registered for every method and a route handler for one, so
 * the first entry naming a method is the handler that runs. It is read here
 * rather than through `routePath`, which reports the middleware's own `/*`
 * until `next()` has returned and so cannot serve the request record.
 */
function matchedRoute(c: Context<ApiEnv>): string {
  const route = matchedRoutes(c).find(
    (candidate) => candidate.method !== METHOD_NAME_ALL
  );
  return route?.path ?? UNMATCHED;
}

/**
 * The ids the request addressed, plus which form addressed them.
 *
 * Only called once `next()` has returned, which is when the path parameters
 * and anything a route resolved into `c.var` are readable. A parameter is
 * written only when it parses as a UUID, since `c.req.param` hands back the
 * raw segment whether or not the route's schema accepted it.
 *
 * @see ../../../contributing/logging.md
 */
function addressed(c: Context<ApiEnv>): LogAttributes {
  const attributes: LogAttributes = {};

  for (const [parameter, attribute] of entriesOf(idParameters)) {
    const value = c.req.param(parameter);
    if (value !== undefined && uuidSchema.safeParse(value).success) {
      attributes[attribute] = value;
    }
  }

  const collectionId = c.get('collectionId');
  if (collectionId !== undefined) {
    attributes['elek.collection.id'] = collectionId;
  }

  const componentId = c.get('componentId');
  if (componentId !== undefined) {
    attributes['elek.component.id'] = componentId;
  }

  const idOrSlug = idOrSlugParameters
    .map((parameter) => c.req.param(parameter))
    .find((value) => value !== undefined);
  if (idOrSlug !== undefined) {
    attributes['elek.request.lookup'] = uuidSchema.safeParse(idOrSlug).success
      ? 'id'
      : 'slug';
  }

  return attributes;
}
