import { createRouter, handleResult } from '../../../lib/util.js';
import { createRoute, z } from '@hono/zod-openapi';
import {
  paginatedListOf,
  projectSchema,
  uuidSchema,
} from '../../../../schema/index.js';

const tags = ['Content API v1'];

const router = createRouter()
  .openapi(
    createRoute({
      summary: 'List Projects',
      description: 'Lists all Projects you currently have access to',
      method: 'get',
      path: '/',
      tags,
      request: {
        query: z.object({
          limit: z.string().pipe(z.coerce.number()).optional().openapi({
            default: 15,
            description: 'The maximum number of Projects to return',
          }),
          offset: z.string().pipe(z.coerce.number()).optional().openapi({
            default: 0,
            description:
              'The number of Projects to skip before starting to collect the result set',
          }),
        }),
      },
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: paginatedListOf(projectSchema),
            },
          },
          description: 'A list of Projects you have access to',
        },
      },
    }),
    async (c) => {
      const { limit, offset } = c.req.valid('query');
      const result = await c.var.projectService.list({ limit, offset });

      return handleResult(c, result);
    }
  )

  .openapi(
    createRoute({
      summary: 'Count Projects',
      description: 'Counts all Projects you currently have access to',
      method: 'get',
      path: '/count',
      tags,
      responses: {
        [200]: {
          content: {
            'application/json': {
              schema: z.number(),
            },
          },
          description: 'The number of Projects you have access to',
        },
      },
    }),
    async (c) => {
      const result = await c.var.projectService.count();

      return handleResult(c, result);
    }
  )

  .openapi(
    createRoute({
      summary: 'Get one Project',
      description: 'Retrieve a Project by ID',
      method: 'get',
      path: '/{projectId}',
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
              schema: projectSchema,
            },
          },
          description: 'The requested Project',
        },
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const result = await c.var.projectService.read({ id: projectId });

      return handleResult(c, result);
    }
  );

export default router;
