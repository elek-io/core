import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  entrySchema,
  paginatedListOf,
  uuidSchema,
} from '../../schema/index.js';
import { EntryService } from '../../service/index.js';

export class EntryApiV1 {
  public readonly api: OpenAPIHono;
  private entryService: EntryService;

  constructor(entryService: EntryService) {
    this.entryService = entryService;
    this.api = new OpenAPIHono();

    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.api.openapi(listEntriesRoute, async (context) => {
      const { projectId, collectionId } = context.req.valid('param');
      const { limit, offset } = context.req.valid('query');

      const entries = await this.entryService.list({
        projectId,
        collectionId,
        limit,
        offset,
      });

      return context.json(entries, 200);
    });

    this.api.openapi(countEntriesRoute, async (context) => {
      const { projectId, collectionId } = context.req.valid('param');
      const count = await this.entryService.count({ projectId, collectionId });

      return context.json(count, 200);
    });

    this.api.openapi(readEntryRoute, async (context) => {
      const { projectId, collectionId, entryId } = context.req.valid('param');

      const entry = await this.entryService.read({
        projectId,
        collectionId,
        id: entryId,
      });

      return context.json(entry, 200);
    });
  }
}

export const listEntriesRoute = createRoute({
  tags: ['Entries'],
  description: 'Lists all Entries of the given Project',
  method: 'get',
  path: '/projects/{projectId}/collections/{collectionId}/entries',
  operationId: 'listEntries',
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
          schema: paginatedListOf(entrySchema),
        },
      },
      description: 'A list of Entries of the given Project',
    },
  },
});

export const countEntriesRoute = createRoute({
  tags: ['Entries'],
  description: 'Counts all Entries of the given Project',
  method: 'get',
  path: '/projects/{projectId}/collections/{collectionId}/entries/count',
  operationId: 'countEntries',
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
          schema: z.number(),
        },
      },
      description: 'The number of Entries of the given Project',
    },
  },
});

export const readEntryRoute = createRoute({
  tags: ['Entries'],
  description: 'Retrieve a Project by ID',
  method: 'get',
  path: '/projects/{projectId}/collections/{collectionId}/entries/{entryId}',
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
      entryId: uuidSchema.openapi({
        param: {
          name: 'entryId',
          in: 'path',
        },
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: entrySchema,
        },
      },
      description: 'The requested Collection',
    },
    404: {
      description: 'The requested Collection does not exist',
    },
  },
});
