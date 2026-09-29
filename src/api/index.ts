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
import { CoreError } from '../util/shared.js';
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
  /** Set while `start()` waits for the bind, so `stop()` can wait for it */
  private starting: Promise<void> | null = null;

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
   * Resolves once the server is listening. Rejects with `PreconditionFailed`
   * while an API is running or still starting, and with `Conflict` when
   * something else holds the port.
   *
   * @see ../../docs/local-api.md
   */
  public async start(port: number): Promise<void> {
    if (this.server) {
      throw CoreError.preconditionFailed(
        'The local API is already running, stop it first'
      );
    }
    // Claimed before the first await, so a second call is refused
    const server = serve(
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
    this.server = server;
    this.starting = new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', () => {
        server.off('error', reject);
        resolve();
      });
    });

    try {
      await this.starting;
    } catch (error) {
      this.server = null;
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'EADDRINUSE') {
          throw CoreError.conflict(`Port ${port} is already in use`, error);
        }
      }
      throw CoreError.internal('The local API could not start', error);
    } finally {
      this.starting = null;
    }
  }

  /**
   * Stops the local API and resolves once the port is released, so a restart
   * on it right away works. Waits for a start still in progress, and does
   * nothing when no API was started.
   */
  public async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const server = this.server;
    if (!server) {
      return;
    }
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    this.logService.info({ source: 'core', message: 'Stopped local API' });
  }

  /**
   * Whether the API is listening. True once `start()` has resolved, false
   * again from the moment `stop()` is called.
   */
  public isRunning() {
    if (this.server?.listening) {
      return true;
    }
    return false;
  }
}
