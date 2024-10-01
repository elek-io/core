import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  collectionSchema,
  paginatedListOf,
  uuidSchema,
} from '../../schema/index.js';
import { CollectionService } from '../../service/index.js';

export class CollectionApiV1 {
  public readonly api: OpenAPIHono;
  private collectionService: CollectionService;

  constructor(collectionService: CollectionService) {
    this.collectionService = collectionService;
    this.api = new OpenAPIHono();

    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.api.openapi(listCollectionsRoute, async (context) => {
      const { projectId } = context.req.valid('param');
      const { limit, offset } = context.req.valid('query');

      const collections = await this.collectionService.list({
        projectId,
        limit,
        offset,
      });

      return context.json(collections, 200);
    });

    this.api.openapi(countCollectionsRoute, async (context) => {
      const { projectId } = context.req.valid('param');
      const count = await this.collectionService.count({ projectId });

      return context.json(count, 200);
    });

    this.api.openapi(readCollectionRoute, async (context) => {
      const { projectId, collectionId } = context.req.valid('param');

      const collection = await this.collectionService.read({
        projectId,
        id: collectionId,
      });

      return context.json(collection, 200);
    });
  }
}

export const listCollectionsRoute = createRoute({
  tags: ['Collections'],
  description: 'Lists all Collections of the given Project',
  method: 'get',
  path: '/projects/{projectId}/collections',
  operationId: 'listCollections',
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
          schema: paginatedListOf(collectionSchema),
        },
      },
      description: 'A list of Collections of the given Project',
    },
  },
});

export const countCollectionsRoute = createRoute({
  tags: ['Collections'],
  description: 'Counts all Collections of the given Project',
  method: 'get',
  path: '/projects/{projectId}/collections/count',
  operationId: 'countCollections',
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
      description: 'The number of Collections of the given Project',
    },
  },
});

export const readCollectionRoute = createRoute({
  tags: ['Collections'],
  description: 'Retrieve a Project by ID',
  method: 'get',
  path: '/projects/{projectId}/collections/{collectionId}',
  operationId: 'readCollection',
  request: {
    params: z.object({
      projectId: uuidSchema.openapi({
        param: {
          name: 'projectId',
          in: 'path',
        },
      }),
      collectionId: uuidSchema.openapi({
        param: {
          name: 'collectionId',
          in: 'path',
        },
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: collectionSchema,
        },
      },
      description: 'The requested Collection',
    },
    404: {
      description: 'The requested Collection does not exist',
    },
  },
});
