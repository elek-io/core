import { serve } from '@hono/node-server';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Server } from 'node:http';
import type { Http2SecureServer, Http2Server } from 'node:http2';
import type {
  AssetService,
  CollectionService,
  EntryService,
  LogService,
  ProjectService,
} from '../service/index.js';
import createApi from './lib/util.js';
import routes from './routes/index.js';
import type { ApiEnv } from './lib/types.js';
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
  public start(port: number) {
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
  public stop() {
    this.server?.close(() => {
      this.logService.info('Stopped local API');
    });
  }

  /**
   * Returns true if the local API is running
   */
  public isRunning() {
    if (this.server?.listening) {
      return true;
    }
    return false;
  }
}
