import { serve } from '@hono/node-server';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Server } from 'node:http';
import { Http2SecureServer, Http2Server } from 'node:http2';
import {
  AssetService,
  CollectionService,
  EntryService,
  LogService,
  ProjectService,
} from '../service/index.js';
import createApi, { createRouter } from './lib/util.js';
import routes from './routes/index.js';
import type { ApiEnv } from './lib/types.js';
import {
  getEntrySchemaFromFieldDefinitions,
  projectSchema,
  uuidSchema,
} from '../schema/index.js';
import { Scalar } from '@scalar/hono-api-reference';

export class LocalApi {
  private logService: LogService;
  private projectService: ProjectService;
  private collectionService: CollectionService;
  private entryService: EntryService;
  private assetService: AssetService;
  private api: OpenAPIHono<ApiEnv>;
  private server: Server | Http2Server | Http2SecureServer | null = null;

  constructor(
    logService: LogService,
    projectService: ProjectService,
    collectionService: CollectionService,
    entryService: EntryService,
    assetService: AssetService
  ) {
    this.logService = logService;
    this.projectService = projectService;
    this.collectionService = collectionService;
    this.entryService = entryService;
    this.assetService = assetService;
    this.api = createApi(
      this.logService,
      this.projectService,
      this.collectionService,
      this.entryService,
      this.assetService
    )
      .route('/', routes)
      .doc('/openapi.json', {
        openapi: '3.0.0',
        externalDocs: { url: 'https://elek.io/docs' },
        info: {
          version: '0.1.0',
          title: 'elek.io local API',
          description:
            'This API allows reading content from local elek.io Projects. You can use this API for development and building static websites and applications locally.',
        },
        servers: [
          {
            url: 'http://localhost:{port}',
            description: 'elek.io local API',
            variables: {
              port: {
                default: 31310,
                description:
                  'The port specified in elek.io Clients user configuration',
              },
            },
          },
        ],
        tags: [
          {
            name: 'Content API v1',
            description:
              'Version 1 of the elek.io content API lets you read Projects, Collections, Entries and Assets. \n### Resources\n - [Projects](https://elek.io/docs/projects)\n - [Collections](https://elek.io/docs/collections)\n - [Entries](https://elek.io/docs/entries)\n - [Assets](https://elek.io/docs/assets)',
          },
          // {
          //   name: 'Projects',
          //   description: 'Retrieve information about Projects',
          //   externalDocs: { url: 'https://elek.io/docs/projects' },
          // },
          // {
          //   name: 'Collections',
          //   description: 'Retrieve information about Collections',
          //   externalDocs: { url: 'https://elek.io/docs/collections' },
          // },
          // {
          //   name: 'Entries',
          //   description: 'Retrieve information about Entries',
          //   externalDocs: { url: 'https://elek.io/docs/entries' },
          // },
          // {
          //   name: 'Assets',
          //   description: 'Retrieve information about Assets',
          //   externalDocs: { url: 'https://elek.io/docs/assets' },
          // },
        ],
      });

    this.api.get(
      '/',
      Scalar({
        pageTitle: 'elek.io local API',
        url: '/openapi.json',
        theme: 'kepler',
        layout: 'modern',
        defaultHttpClient: {
          targetKey: 'js',
          clientKey: 'fetch',
        },
      })
    );
  }

  /**
   * Starts the local API on given port
   */
  public async start(port: number) {
    // await this.generateDynamicRoutes();

    this.server = serve(
      {
        fetch: this.api.fetch,
        port,
      },
      (info) => {
        this.logService.info(
          `Started local API on http://localhost:${info.port}`
        );
      }
    );
  }

  /**
   * Stops the local API
   */
  public async stop() {
    this.server?.close(() => {
      this.logService.info('Stopped local API');
    });
  }

  /**
   * Returns true if the local API is running
   */
  public async isRunning() {
    if (this.server?.listening) {
      return true;
    }
    return false;
  }

  /**
   * Dynamically create routes for all locally available Projects, Collections and Entries
   * to provide the correct schema of Collections and Entries
   */
  private async generateDynamicRoutes() {
    const projects = await this.projectService.list({ limit: 0 });
    const router = createRouter();

    projects.list.forEach(async (project) => {
      router.openapi(
        createRoute({
          tags: [project.id],
          description: `Retrieve the Project "${project.name}"`,
          method: 'get',
          path: `/projects/${project.id}`,
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
        }),
        async (c) => {
          const resolvedProject = await this.projectService.read({
            id: project.id,
          });

          return c.json(resolvedProject, 200);
        }
      );

      const collections = await this.collectionService.list({
        projectId: project.id,
        limit: 0,
      });

      collections.list.forEach(async (collection) => {
        const generatedEntrySchema = getEntrySchemaFromFieldDefinitions(
          collection.fieldDefinitions
        );

        router.openapi(
          createRoute({
            tags: [project.id],
            description: 'Retrieve an Entry by ID',
            method: 'get',
            path: `/projects/${project.id}/collections/${collection.id}/entries/{entryId}`,
            request: {
              params: z.object({
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
                    schema: generatedEntrySchema,
                  },
                },
                description: 'The requested Entry',
              },
              404: {
                description: 'The requested Entry does not exist',
              },
            },
          }),
          async (context) => {
            const { entryId } = context.req.valid('param');

            this.logService.warn(
              `/projects/${project.id}/collections/${collection.id}/entries/${entryId}`
            );

            const entry = await this.entryService.read({
              projectId: project.id,
              collectionId: collection.id,
              id: entryId,
            });

            return context.json(entry, 200);
          }
        );
      });
    });

    router.doc('/openapi.json', {
      openapi: '3.0.0',
      externalDocs: { url: 'https://elek.io/docs' },
      info: {
        version: '0.1.0',
        title: 'elek.io Projects API v1',
        description: 'This API allows reading data from elek.io Projects',
      },
      servers: [
        {
          url: 'http://localhost:{port}/v1',
          description: 'Local development API',
          variables: {
            port: {
              default: 31310,
              description:
                'The port specified in elek.io Clients user configuration',
            },
          },
        },
        {
          url: 'https://api.elek.io/v1',
          description: 'Public production API',
          variables: {},
        },
      ],
      tags: [
        {
          name: 'Projects',
          description: 'Retrieve information about Projects',
          externalDocs: { url: 'https://elek.io/docs/projects' },
        },
        {
          name: 'Collections',
          description: 'Retrieve information about Collections',
          externalDocs: { url: 'https://elek.io/docs/collections' },
        },
        {
          name: 'Entries',
          description: 'Retrieve information about Entries',
          externalDocs: { url: 'https://elek.io/docs/entries' },
        },
        {
          name: 'Assets',
          description: 'Retrieve information about Assets',
          externalDocs: { url: 'https://elek.io/docs/assets' },
        },
      ],
    });

    router.get(
      '/',
      Scalar({
        pageTitle: 'elek.io Projects API v1 Reference',
        url: '/dynamic/openapi.json',
        theme: 'kepler',
        layout: 'modern',
        defaultHttpClient: {
          targetKey: 'js',
          clientKey: 'fetch',
        },
      })
    );

    this.api.route('/dynamic', router);
  }
}
