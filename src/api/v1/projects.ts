import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  listProjectsSchema,
  paginatedListOf,
  projectSchema,
  uuidSchema,
} from '../../schema/index.js';
import { ProjectService } from '../../service/index.js';

export class ProjectsApiV1 {
  public readonly api: OpenAPIHono;
  private projectService: ProjectService;

  constructor(projectService: ProjectService) {
    this.projectService = projectService;
    this.api = new OpenAPIHono();

    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.api.openapi(countProjectsRoute, async (context) => {
      const count = await this.projectService.count();

      return context.json(count, 200);
    });

    this.api.openapi(listProjectsRoute, async (context) => {
      const { limit, offset } = context.req.valid('query');

      const projects = await this.projectService.list({ limit, offset });

      return context.json(projects, 200);
    });

    this.api.openapi(readProjectRoute, async (context) => {
      const { id } = context.req.valid('param');

      const project = await this.projectService.read({ id });

      return context.json(project, 200);
    });
  }
}

export const countProjectsRoute = createRoute({
  tags: ['Projects'],
  description: 'Counts all Projects you currently have access to',
  method: 'get',
  path: '/count',
  operationId: 'countProjects',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.number(),
        },
      },
      description: 'The number of Projects you have acces to',
    },
  },
});

export const listProjectsRoute = createRoute({
  tags: ['Projects'],
  description: 'Lists all Projects you currently have access to',
  method: 'get',
  path: '/',
  operationId: 'listProjects',
  request: {
    query: listProjectsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: paginatedListOf(projectSchema),
        },
      },
      description: 'A list of Projects you have access to',
    },
  },
});

export const readProjectRoute = createRoute({
  tags: ['Projects'],
  description: 'Retrieve a Project by ID',
  method: 'get',
  path: '/{id}',
  operationId: 'readProject',
  request: {
    params: z.object({
      id: uuidSchema.openapi({
        param: {
          name: 'id',
          in: 'path',
        },
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: projectSchema,
        },
      },
      description: 'The requested Project',
    },
    404: {
      description:
        'The requested Project does not exist or you have no right to access it',
    },
  },
});