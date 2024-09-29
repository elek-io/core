import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  assetSchema,
  paginatedListOf,
  uuidSchema,
} from '../../schema/index.js';
import { AssetService } from '../../service/index.js';

export class AssetApiV1 {
  public readonly api: OpenAPIHono;
  private assetService: AssetService;

  constructor(assetService: AssetService) {
    this.assetService = assetService;
    this.api = new OpenAPIHono();

    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.api.openapi(listAssetsRoute, async (context) => {
      const { projectId } = context.req.valid('param');
      const { limit, offset } = context.req.valid('query');

      const assets = await this.assetService.list({
        projectId,
        limit,
        offset,
      });

      return context.json(assets, 200);
    });

    this.api.openapi(countAssetsRoute, async (context) => {
      const { projectId } = context.req.valid('param');
      const count = await this.assetService.count({ projectId });

      return context.json(count, 200);
    });

    this.api.openapi(readAssetRoute, async (context) => {
      const { projectId, assetId } = context.req.valid('param');

      const asset = await this.assetService.read({
        projectId,
        id: assetId,
      });

      return context.json(asset, 200);
    });
  }
}

export const listAssetsRoute = createRoute({
  tags: ['Assets'],
  description: 'Lists all Assets of the given Project',
  method: 'get',
  path: '/',
  operationId: 'listAssets',
  request: {
    params: z.object({
      projectId: uuidSchema.openapi({
        param: {
          name: 'projectId',
          in: 'path',
        },
      }),
    }),
    query: z.object({
      limit: z.string().pipe(z.coerce.number()).optional().openapi({
        default: '15',
        description: 'The maximum number of items to return',
      }),
      offset: z.string().pipe(z.coerce.number()).optional().openapi({
        default: '0',
        description:
          'The number of items to skip before starting to collect the result set',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: paginatedListOf(assetSchema),
        },
      },
      description: 'A list of Assets of the given Project',
    },
  },
});

export const countAssetsRoute = createRoute({
  tags: ['Assets'],
  description: 'Counts all Assets of the given Project',
  method: 'get',
  path: '/count',
  operationId: 'countAssets',
  request: {
    params: z.object({
      projectId: uuidSchema.openapi({
        param: {
          name: 'projectId',
          in: 'path',
        },
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.number(),
        },
      },
      description: 'The number of Assets of the given Project',
    },
  },
});

export const readAssetRoute = createRoute({
  tags: ['Assets'],
  description: 'Retrieve an Asset by ID',
  method: 'get',
  path: '/{assetId}',
  operationId: 'readAsset',
  request: {
    params: z.object({
      projectId: uuidSchema.openapi({
        param: {
          name: 'projectId',
          in: 'path',
        },
      }),
      assetId: uuidSchema.openapi({
        param: {
          name: 'assetId',
          in: 'path',
        },
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: assetSchema,
        },
      },
      description: 'The requested Asset',
    },
    404: {
      description: 'The requested Asset does not exist',
    },
  },
});
