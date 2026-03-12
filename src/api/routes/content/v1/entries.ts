import { createRouter } from '../../../lib/util.js';
import { createRoute, z } from '@hono/zod-openapi';
import {
  entrySchema,
  paginatedListOf,
  uuidSchema,
} from '../../../../schema/index.js';

const tags = ['Content API v1'];

const router = createRouter()
  .openapi(
    createRoute({
      summary: 'List Entries',
      description: 'Lists all Entries of the given Projects Collection',
      method: 'get',
      path: '/{projectId}/collections/{collectionIdOrSlug}/entries',
      tags,
      request: {
        params: z.object({
          projectId: uuidSchema.openapi({
            param: {
              name: 'projectId',
              in: 'path',
            },
          }),
          collectionIdOrSlug: z.string().openapi({
            param: {
              name: 'collectionIdOrSlug',
              in: 'path',
            },
            description: 'Collection UUID or slug',
          }),
        }),
        query: z.object({
          limit: z.string().pipe(z.coerce.number()).optional().openapi({
            default: '15',
            description: 'The maximum number of Entries to return',
          }),
          offset: z.string().pipe(z.coerce.number()).optional().openapi({
            default: '0',
            description:
              'The number of Entries to skip before starting to collect the result set',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: paginatedListOf(entrySchema),
            },
          },
          description: 'A list of Entries for the given Projects Collection',
        },
      },
    }),
    async (c) => {
      const { projectId, collectionIdOrSlug } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');
      const collectionId = await c.var.collectionService.resolveCollectionId({
        projectId,
        idOrSlug: collectionIdOrSlug,
      });
      const entries = await c.var.entryService.list({
        projectId,
        collectionId,
        limit,
        offset,
      });

      return c.json(entries, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Count Entries',
      description: 'Counts all Entries of the given Projects Collection',
      method: 'get',
      path: '/{projectId}/collections/{collectionIdOrSlug}/entries/count',
      tags,
      request: {
        params: z.object({
          projectId: uuidSchema.openapi({
            param: {
              name: 'projectId',
              in: 'path',
            },
          }),
          collectionIdOrSlug: z.string().openapi({
            param: {
              name: 'collectionIdOrSlug',
              in: 'path',
            },
            description: 'Collection UUID or slug',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: z.number(),
            },
          },
          description: 'The number of Entries of the given Projects Collection',
        },
      },
    }),
    async (c) => {
      const { projectId, collectionIdOrSlug } = c.req.valid('param');
      const collectionId = await c.var.collectionService.resolveCollectionId({
        projectId,
        idOrSlug: collectionIdOrSlug,
      });
      const count = await c.var.entryService.count({
        projectId,
        collectionId,
      });

      return c.json(count, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Get one Entry',
      description: 'Retrieve an Entry by ID',
      method: 'get',
      path: '/{projectId}/collections/{collectionIdOrSlug}/entries/{entryId}',
      tags,
      request: {
        params: z.object({
          projectId: uuidSchema.openapi({
            param: {
              name: 'projectId',
              in: 'path',
            },
          }),
          collectionIdOrSlug: z.string().openapi({
            param: {
              name: 'collectionIdOrSlug',
              in: 'path',
            },
            description: 'Collection UUID or slug',
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
        [200]: {
          content: {
            'application/json': {
              schema: entrySchema,
            },
          },
          description: 'The requested Entry',
        },
      },
    }),
    async (c) => {
      const { projectId, collectionIdOrSlug, entryId } = c.req.valid('param');
      const collectionId = await c.var.collectionService.resolveCollectionId({
        projectId,
        idOrSlug: collectionIdOrSlug,
      });
      const entry = await c.var.entryService.read({
        projectId,
        collectionId,
        id: entryId,
      });

      return c.json(entry, 200);
    }
  );

export default router;
