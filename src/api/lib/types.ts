import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env, Schema } from 'hono';
import type {
  AssetService,
  CollectionService,
  EntryService,
  LogService,
  ProjectService,
} from '../../service/index.js';

/**
 * Services available in context (c.var)
 * @see https://hono.dev/docs/api/hono#generics
 */
export type Variables = {
  logService: LogService;
  projectService: ProjectService;
  collectionService: CollectionService;
  entryService: EntryService;
  assetService: AssetService;
};

export interface ApiEnv extends Env {
  Variables: Variables;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Api<S extends Schema = {}> = OpenAPIHono<ApiEnv, S>;
