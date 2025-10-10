import type { Schema } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { requestId } from 'hono/request-id';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';
import { requestResponseLogger } from '../middleware/requestResponseLogger.js';
import type { Api, ApiEnv } from './types.js';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { cors } from 'hono/cors';
import {
  AssetService,
  CollectionService,
  EntryService,
  LogService,
  ProjectService,
} from '../../service/index.js';
import { createMiddleware } from 'hono/factory';
import { trimTrailingSlash } from 'hono/trailing-slash';

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
          StatusCodes.UNPROCESSABLE_ENTITY
        );
      }
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
        c.set('entryService', entryService);
        c.set('assetService', assetService);
        return next();
      })
    )
    .use(requestResponseLogger);

  api.notFound((c) => {
    return c.json(
      {
        message: `${ReasonPhrases.NOT_FOUND} - ${c.req.path}`,
      },
      StatusCodes.NOT_FOUND
    );
  });

  api.onError((err, c) => {
    const currentStatus =
      'status' in err ? err.status : c.newResponse(null).status;
    const statusCode =
      currentStatus !== StatusCodes.OK
        ? (currentStatus as ContentfulStatusCode)
        : StatusCodes.INTERNAL_SERVER_ERROR;

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
  entryService: EntryService,
  assetService: AssetService
) {
  return createApi(
    logService,
    projectService,
    collectionService,
    entryService,
    assetService
  ).route('/', router);
}
