import type { Schema } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { requestId } from 'hono/request-id';
import { requestResponseLogger } from '../middleware/requestResponseLogger.js';
import type { Api, ApiEnv } from './types.js';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { cors } from 'hono/cors';
import type {
  AssetService,
  CollectionService,
  ComponentService,
  EntryService,
  LogService,
  ProjectService,
} from '../../service/index.js';
import { createMiddleware } from 'hono/factory';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { CoreError } from '../../util/shared.js';

/**
 * A router carrying the `defaultHook` that turns a failed zod request
 * validation into `422` with `{ success: false, error: { name, issues } }`.
 *
 * Every router built here answers a bad request the same way, so no handler
 * validates its own path or query parameters.
 */
export function createRouter() {
  return new OpenAPIHono<ApiEnv>({
    /**
     * @see https://github.com/honojs/middleware/tree/main/packages/zod-openapi#a-dry-approach-to-handling-validation-errors
     */
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: result.success,
            error: {
              name: result.error.name,
              issues: result.error.issues,
            },
          },
          422
        );
      }

      return result;
    },
  });
}

/**
 * The router stack every request passes through: a request id, a trailing
 * slash trim, CORS restricted to `http://localhost`, the services injected
 * into the context, and the request logger.
 *
 * It also installs the error envelopes, one for a `CoreError`, one for
 * anything else thrown, and one for a path no route matched.
 *
 * @see ../../../docs/local-api.md
 */
export default function createApi(
  logService: LogService,
  projectService: ProjectService,
  collectionService: CollectionService,
  componentService: ComponentService,
  entryService: EntryService,
  assetService: AssetService
) {
  const api = createRouter();

  api
    .use(requestId())
    .use(trimTrailingSlash())
    .use(
      cors({
        origin: ['http://localhost'],
      })
    )
    .use(
      // Register services in context
      createMiddleware<ApiEnv>((c, next) => {
        c.set('logService', logService);
        c.set('projectService', projectService);
        c.set('collectionService', collectionService);
        c.set('componentService', componentService);
        c.set('entryService', entryService);
        c.set('assetService', assetService);
        return next();
      })
    )
    .use(requestResponseLogger);

  api.notFound((c) => {
    return c.json(
      {
        message: `Not Found - ${c.req.path}`,
      },
      404
    );
  });

  api.onError((err, c) => {
    if (err instanceof CoreError) {
      return c.json(
        {
          error: {
            type: err.type,
            message: err.message,
            statusCode: err.statusCode,
            stack: err.cause instanceof Error ? err.cause.stack : undefined,
          },
        },
        // CoreError carries a plain number, hono wants its union of codes that
        // may carry a body. Every CoreError status is one of them
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        err.statusCode as ContentfulStatusCode
      );
    }

    const currentStatus =
      'status' in err ? err.status : c.newResponse(null).status;
    // Same hono status union as above, with 200 excluded because a 200 here
    // would be an error response carrying a success code
    const statusCode =
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      currentStatus !== 200 ? (currentStatus as ContentfulStatusCode) : 500;

    return c.json(
      {
        message: err.message,
        stack: err.stack,
      },
      statusCode
    );
  });

  return api;
}

/**
 * Mounts one router on exactly the stack `createApi` builds, so a route test
 * meets the real middleware and the real error envelope rather than a bare
 * handler.
 *
 * The OpenAPI document and the Scalar UI are left off on purpose, they belong
 * to `LocalApi` rather than to a route.
 */
export function createTestApi<S extends Schema>(
  router: Api<S>,
  logService: LogService,
  projectService: ProjectService,
  collectionService: CollectionService,
  componentService: ComponentService,
  entryService: EntryService,
  assetService: AssetService
) {
  return createApi(
    logService,
    projectService,
    collectionService,
    componentService,
    entryService,
    assetService
  ).route('/', router);
}
