import { serve } from '@hono/node-server';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { Server } from 'node:http';
import { Http2SecureServer, Http2Server } from 'node:http2';
import {
  AssetService,
  CollectionService,
  EntryService,
  LogService,
  ProjectService,
} from '../service/index.js';
import { LoggerMiddleware } from './middleware/logger.js';
import {
  AssetApiV1,
  CollectionApiV1,
  EntryApiV1,
  ProjectApiV1,
} from './v1/index.js';

export class LocalApi {
  private logService: LogService;
  private projectService: ProjectService;
  private collectionService: CollectionService;
  private entryService: EntryService;
  private assetService: AssetService;
  private api: OpenAPIHono;
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
    this.api = new OpenAPIHono();

    // Register middleware
    this.api.use(
      cors({
        origin: ['http://localhost'],
      })
    );
    this.api.use(new LoggerMiddleware(logService).handler);

    this.registerRoutesV1();
  }

  /**
   * Starts the local API on given port
   */
  public async start(port: number) {
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

  private registerRoutesV1(): void {
    const apiV1 = new OpenAPIHono();

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

    apiV1.route('/', new ProjectApiV1(this.projectService).api);
    apiV1.route('/', new CollectionApiV1(this.collectionService).api);
    apiV1.route('/', new EntryApiV1(this.entryService).api);
    apiV1.route('/', new AssetApiV1(this.assetService).api);

    this.api.route('/v1', apiV1);
  }
}
