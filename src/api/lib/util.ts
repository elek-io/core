import type { Context, Schema, TypedResponse } from 'hono';
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
import type { Result } from 'neverthrow';
import type { CoreError } from '../../util/shared.js';

/**
 * Handles a neverthrow Result by returning the appropriate JSON response
 */
export function handleResult<T, S extends ContentfulStatusCode = 200>(
  c: Context,
  result: Result<T, CoreError>,
  status: S = 200 as S
): TypedResponse<T, S, 'json'> {
  return result.match(
    (data) => c.json(data, status),
    (error) =>
      c.json(
        {
          error: {
            type: error.type,
            message: error.message,
            statusCode: error.statusCode,
            stack: error.cause instanceof Error ? error.cause.stack : undefined,
          },
        },
        error.statusCode
      )
  ) as TypedResponse<T, S, 'json'>;
}

/**
 * Creates a new OpenAPIHono router with default settings
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
 * Creates a new OpenAPIHono instance, injects services into context and adds error handling
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
    const currentStatus =
      'status' in err ? err.status : c.newResponse(null).status;
    const statusCode =
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
