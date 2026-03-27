import { createRouter } from '../../../lib/util.js';
import { createRoute, z } from '@hono/zod-openapi';
import {
  collectionSchema,
  paginatedListOf,
  uuidSchema,
} from '../../../../schema/index.js';

const tags = ['Content API v1'];

const router = createRouter()
  .openapi(
    createRoute({
      summary: 'List Collections',
      description: 'Lists all Collections of the given Project',
      method: 'get',
      path: '/{projectId}/collections',
      tags,
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
            description: 'The maximum number of Collections to return',
          }),
          offset: z.string().pipe(z.coerce.number()).optional().openapi({
            default: '0',
            description:
              'The number of Collections to skip before starting to collect the result set',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: paginatedListOf(collectionSchema),
            },
          },
          description: 'A list of Collections for the given Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');
      const data = await c.var.collectionService.list({
        projectId,
        limit,
        offset,
      });

      return c.json(data, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Count Collections',
      description: 'Counts all Collections of the given Project',
      method: 'get',
      path: '/{projectId}/collections/count',
      tags,
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
        [200]: {
          content: {
            'application/json': {
              schema: z.number(),
            },
          },
          description: 'The number of Collections of the given Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const data = await c.var.collectionService.count({ projectId });

      return c.json(data, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Get one Collection',
      description: 'Retrieve a Collection by UUID or slug',
      method: 'get',
      path: '/{projectId}/collections/{collectionIdOrSlug}',
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
              schema: collectionSchema,
            },
          },
          description: 'The requested Collection',
        },
      },
    }),
    async (c) => {
      const { projectId, collectionIdOrSlug } = c.req.valid('param');
      const id = await c.var.collectionService.resolveCollectionId({ projectId, idOrSlug: collectionIdOrSlug });
      const data = await c.var.collectionService.read({ projectId, id });

      return c.json(data, 200);
    }
  );

export default router;
