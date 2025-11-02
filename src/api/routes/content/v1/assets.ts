import { createRouter } from '../../../lib/util.js';
import { createRoute, z } from '@hono/zod-openapi';
import {
  assetSchema,
  paginatedListOf,
  uuidSchema,
} from '../../../../schema/index.js';

const tags = ['Content API v1'];

const router = createRouter()
  .openapi(
    createRoute({
      summary: 'List Assets',
      description: 'Lists all Assets of the given Project',
      method: 'get',
      path: '/{projectId}/assets',
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
            description: 'The maximum number of Assets to return',
          }),
          offset: z.string().pipe(z.coerce.number()).optional().openapi({
            default: '0',
            description:
              'The number of Assets to skip before starting to collect the result set',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: paginatedListOf(assetSchema),
            },
          },
          description: 'A list of Assets for the given Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');
      const assets = await c.var.assetService.list({
        projectId,
        limit,
        offset,
      });

      return c.json(assets, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Count Assets',
      description: 'Counts all Assets of the given Project',
      method: 'get',
      path: '/{projectId}/assets/count',
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
          description: 'The number of Assets of the given Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const count = await c.var.assetService.count({ projectId });

      return c.json(count, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Get one Asset',
      description: 'Retrieve an Asset by ID',
      method: 'get',
      path: '/{projectId}/assets/{assetId}',
      tags,
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
        [200]: {
          content: {
            'application/json': {
              schema: assetSchema,
            },
          },
          description: 'The requested Asset',
        },
      },
    }),
    async (c) => {
      const { projectId, assetId } = c.req.valid('param');
      const asset = await c.var.assetService.read({
        projectId,
        id: assetId,
      });

      return c.json(asset, 200);
    }
  );

export default router;
