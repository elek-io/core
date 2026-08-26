import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env, Schema } from 'hono';
import type { Uuid } from '../../schema/index.js';
import type {
  AssetService,
  CollectionService,
  ComponentService,
  EntryService,
  LogService,
  ProjectService,
} from '../../service/index.js';

/**
 * What a route puts in context (`c.var`) for the middleware around it.
 *
 * The services are injected once by `createApi`, so a handler reaches them
 * without importing a Core instance. The two ids are written by the routes
 * that accept a slug: the request logger runs before the slug is resolved
 * and may not write it down, so the handler that did resolve it leaves the
 * id behind for the response record. See ../../../contributing/logging.md.
 *
 * @see https://hono.dev/docs/api/hono#generics
 */
export type Variables = {
  logService: LogService;
  projectService: ProjectService;
  collectionService: CollectionService;
  componentService: ComponentService;
  entryService: EntryService;
  assetService: AssetService;
  collectionId?: Uuid;
  componentId?: Uuid;
};

export interface ApiEnv extends Env {
  Variables: Variables;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Api<S extends Schema = {}> = OpenAPIHono<ApiEnv, S>;
