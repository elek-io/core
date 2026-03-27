import { createRouter } from '../../../lib/util.js';
import { createRoute, z } from '@hono/zod-openapi';
import {
  componentSchema,
  paginatedListOf,
  uuidSchema,
} from '../../../../schema/index.js';

const tags = ['Content API v1'];

const router = createRouter()
  .openapi(
    createRoute({
      summary: 'List Components',
      description: 'Lists all Components of the given Project',
      method: 'get',
      path: '/{projectId}/components',
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
            description: 'The maximum number of Components to return',
          }),
          offset: z.string().pipe(z.coerce.number()).optional().openapi({
            default: '0',
            description:
              'The number of Components to skip before starting to collect the result set',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: paginatedListOf(componentSchema),
            },
          },
          description: 'A list of Components for the given Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const { limit, offset } = c.req.valid('query');
      const data = await c.var.componentService.list({
        projectId,
        limit,
        offset,
      });

      return c.json(data, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Count Components',
      description: 'Counts all Components of the given Project',
      method: 'get',
      path: '/{projectId}/components/count',
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
          description: 'The number of Components of the given Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const data = await c.var.componentService.count({ projectId });

      return c.json(data, 200);
    }
  )

  .openapi(
    createRoute({
      summary: 'Get one Component',
      description: 'Retrieve a Component by UUID or slug',
      method: 'get',
      path: '/{projectId}/components/{componentIdOrSlug}',
      tags,
      request: {
        params: z.object({
          projectId: uuidSchema.openapi({
            param: {
              name: 'projectId',
              in: 'path',
            },
          }),
          componentIdOrSlug: z.string().openapi({
            param: {
              name: 'componentIdOrSlug',
              in: 'path',
            },
            description: 'Component UUID or slug',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: componentSchema,
            },
          },
          description: 'The requested Component',
        },
      },
    }),
    async (c) => {
      const { projectId, componentIdOrSlug } = c.req.valid('param');
      const id = await c.var.componentService.resolveComponentId({ projectId, idOrSlug: componentIdOrSlug });
      const data = await c.var.componentService.read({ projectId, id });

      return c.json(data, 200);
    }
  );

export default router;
