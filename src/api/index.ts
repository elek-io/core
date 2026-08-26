import { serve } from '@hono/node-server';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Server } from 'node:http';
import type { Http2SecureServer, Http2Server } from 'node:http2';
import type {
  AssetService,
  CollectionService,
  ComponentService,
  EntryService,
  LogService,
  ProjectService,
} from '../service/index.js';
import createApi from './lib/util.js';
import routes from './routes/index.js';
import type { ApiEnv } from './lib/types.js';
import { Scalar } from '@scalar/hono-api-reference';

// The only address the local API binds, see docs/local-api.md. Passed
// explicitly because without a `hostname` `@hono/node-server` hands
// `undefined` to `server.listen`, which answers on every interface.
const LOOPBACK = '127.0.0.1';

/**
 * The local, read-only REST API. Constructing it assembles the whole Hono app,
 * the content routes, `/openapi.json` and the Scalar reference UI on `/`, but
 * binds no port. Nothing listens until `start()`.
 *
 * CORS admits `http://localhost` and nothing else.
 *
 * @see ../../docs/local-api.md
 */
export class LocalApi {
  private logService: LogService;
  private projectService: ProjectService;
  private collectionService: CollectionService;
  private componentService: ComponentService;
  private entryService: EntryService;
  private assetService: AssetService;
  private api: OpenAPIHono<ApiEnv>;
  private server: Server | Http2Server | Http2SecureServer | null = null;

  constructor(
    logService: LogService,
    projectService: ProjectService,
    collectionService: CollectionService,
    componentService: ComponentService,
    entryService: EntryService,
    assetService: AssetService
  ) {
    this.logService = logService;
    this.projectService = projectService;
    this.collectionService = collectionService;
    this.componentService = componentService;
    this.entryService = entryService;
    this.assetService = assetService;
    this.api = createApi(
      this.logService,
      this.projectService,
      this.collectionService,
      this.componentService,
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
              'Version 1 of the elek.io content API lets you read Projects, Collections, Components, Entries and Assets. \n### Resources\n - [Projects](https://elek.io/docs/projects)\n - [Collections](https://elek.io/docs/collections)\n - [Components](https://elek.io/docs/components)\n - [Entries](https://elek.io/docs/entries)\n - [Assets](https://elek.io/docs/assets)',
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
   * Starts the local API on the given port, bound to loopback. The bind
   * address is deliberately not an option.
   *
   * Returns before the server is listening, so `isRunning()` is still false on
   * the next line. Calling it again while one runs replaces the tracked server,
   * leaving the first impossible to stop and the failed listen surfacing as an
   * unhandled `EADDRINUSE` error event.
   *
   * @see ../../docs/local-api.md
   */
  public start(port: number) {
    this.server = serve(
      {
        fetch: this.api.fetch,
        port,
        hostname: LOOPBACK,
      },
      (info) => {
        this.logService.info({
          source: 'core',
          message: `Started local API on http://${info.address}:${info.port}`,
        });
      }
    );
  }

  /**
   * Stops the local API, and does nothing when it was never started.
   *
   * Returns immediately while `close()` goes on waiting for open connections,
   * so the port is released later than this call. Restarting on the same port
   * right away can still fail.
   */
  public stop() {
    this.server?.close(() => {
      this.logService.info({ source: 'core', message: 'Stopped local API' });
    });
  }

  /**
   * Reports the HTTP server's own `listening` flag, so it is false in the tick
   * after `start()` returns. A caller needing certainty has to poll it, which
   * is what the API test does.
   */
  public isRunning() {
    if (this.server?.listening) {
      return true;
    }
    return false;
  }
}
