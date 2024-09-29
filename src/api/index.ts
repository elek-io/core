import { serve } from '@hono/node-server';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { Server } from 'node:http';
import { Http2SecureServer, Http2Server } from 'node:http2';
import {
  CollectionService,
  EntryService,
  LogService,
  ProjectService,
} from '../service/index.js';
import { CollectionApiV1 } from './v1/collection.js';
import { EntryApiV1 } from './v1/entry.js';
import { ProjectApiV1 } from './v1/project.js';

export class LocalApi {
  private logService: LogService;
  private projectService: ProjectService;
  private collectionService: CollectionService;
  private entryService: EntryService;
  private api: OpenAPIHono;
  private server: Server | Http2Server | Http2SecureServer | null = null;

  constructor(
    logService: LogService,
    projectService: ProjectService,
    collectionService: CollectionService,
    entryService: EntryService
  ) {
    this.logService = logService;
    this.projectService = projectService;
    this.collectionService = collectionService;
    this.entryService = entryService;
    this.api = new OpenAPIHono();

    this.registerRoutesV1();
  }

  /**
   * Starts the local API on given port
   */
  public start(port: number): void {
    this.server = serve(
      {
        fetch: this.api.fetch,
        port,
      },
      (info) => {
        this.logService.info(
          `Started local API on ${info.address}:${info.port} (${info.family})`
        );
      }
    );
  }

  /**
   * Stops the local API
   */
  public stop(): void {
    this.server?.close(() => {
      this.logService.info('Stopped local API');
    });
  }

  /**
   * Returns true if the local API is running
   */
  public isRunning(): boolean {
    if (this.server?.listening) {
      return true;
    }
    return false;
  }

  private registerRoutesV1(): void {
    const apiV1 = new OpenAPIHono();

    apiV1.use(
      cors({
        origin: ['http://localhost'],
      })
    );

    apiV1.doc('/openapi.json', {
      openapi: '3.0.0',
      externalDocs: { url: 'https://elek.io/docs' },
      info: {
        version: '0.1.0',
        title: 'elek.io Project API',
        description: 'This API allows reading data from elek.io Projects',
      },
      servers: [
        {
          url: 'http://localhost:{port}/v1/',
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
          url: 'https://api.elek.io/v1/',
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

    apiV1.get('/ui', swaggerUI({ url: '/v1/openapi.json' }));

    apiV1.route('/projects', new ProjectApiV1(this.projectService).api);
    apiV1.route(
      '/projects/{projectId}/collections',
      new CollectionApiV1(this.collectionService).api
    );
    apiV1.route(
      '/projects/{projectId}/collections/{collectionId}/entries',
      new EntryApiV1(this.entryService).api
    );

    this.api.route('/v1', apiV1);
  }
}
