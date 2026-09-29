import { testClient } from 'hono/testing';
import { createTestApi } from './lib/util.js';
import router from './routes/index.js';
import type {
  Asset,
  Collection,
  Component,
  Entry,
  Project,
} from '../index.node.js';
import Os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject,
  createAsset,
  createCollection,
  createComponent,
  createEntry,
} from '../test/util.js';
import core, { testApiPort } from '../test/setup.js';

const externalAddress = externalIpv4();

/** The parts of the served OpenAPI document the tests below assert on */
interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
}

const app = createTestApi(
  router,
  core.logger,
  core.projects,
  core.collections,
  core.components,
  core.entries,
  core.assets
);
const client = testClient(app);

describe('API', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;
  let component: Component;
  let entry: Entry;

  beforeAll(async function () {
    project = await createProject();
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    component = await createComponent(project.id);
    entry = await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('should be able to start the API and verify it is running', async function () {
    const isRunningBefore = core.api.isRunning();
    await core.api.start(testApiPort);

    const isRunningAfter = core.api.isRunning();

    expect(isRunningBefore).toEqual(false);
    expect(isRunningAfter).toEqual(true);
  });

  it('answers on loopback', async function () {
    const response = await fetch(
      `http://127.0.0.1:${testApiPort}/content/v1/projects/count`
    );

    expect(response.status).toEqual(200);
  });

  it.skipIf(externalAddress === null)(
    'does not answer on any other address of this machine',
    async function () {
      // Without a hostname node listens on every interface, so a read API
      // over every local Project is on the network while the log line and
      // docs/local-api.md both say localhost
      await expect(
        fetch(
          `http://${externalAddress}:${testApiPort}/content/v1/projects/count`,
          {
            signal: AbortSignal.timeout(5000),
          }
        )
      ).rejects.toThrow();
    }
  );

  it('serves the OpenAPI document', async function () {
    // Only a real server reaches `.doc()`, the in-process client below is
    // typed off the routes and never requests this path
    const response = await fetch(
      `http://127.0.0.1:${testApiPort}/openapi.json`
    );

    expect(response.status).toEqual(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const document = (await response.json()) as OpenApiDocument;

    expect(document.openapi).toEqual('3.0.0');
    expect(document.info.title).toEqual('elek.io local API');
    expect(document.info.version).toBeDefined();
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
  });

  it('documents every route the reference UI lists', async function () {
    const response = await fetch(
      `http://127.0.0.1:${testApiPort}/openapi.json`
    );
    const document = (await response.json()) as OpenApiDocument;

    // The paths docs/local-api.md promises, in the OpenAPI `{param}` form
    const documented = [
      '/content/v1/projects',
      '/content/v1/projects/count',
      '/content/v1/projects/{projectId}',
      '/content/v1/projects/{projectId}/collections',
      '/content/v1/projects/{projectId}/collections/count',
      '/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}',
      '/content/v1/projects/{projectId}/components',
      '/content/v1/projects/{projectId}/components/count',
      '/content/v1/projects/{projectId}/components/{componentIdOrSlug}',
      '/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries',
      '/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/count',
      '/content/v1/projects/{projectId}/collections/{collectionIdOrSlug}/entries/{entryId}',
      '/content/v1/projects/{projectId}/assets',
      '/content/v1/projects/{projectId}/assets/count',
      '/content/v1/projects/{projectId}/assets/{assetId}',
    ];

    expect(Object.keys(document.paths).toSorted()).toEqual(
      documented.toSorted()
    );
  });

  it('resolves every $ref in the OpenAPI document', async function () {
    // A recursive schema without a component name makes the generator
    // inline itself until the stack runs out, so the whole document fails
    const response = await fetch(
      `http://127.0.0.1:${testApiPort}/openapi.json`
    );
    const document = (await response.json()) as OpenApiDocument;
    const components = Object.keys(document.components?.schemas ?? {});

    expect(components).toContain('MdAstBlockNode');
    expect(components).toContain('MdAstPhrasingNode');

    const dangling = refsIn(document).filter(
      (ref) => components.includes(ref) === false
    );
    expect(dangling).toEqual([]);
  });

  it('serves the reference UI pointing at the OpenAPI document', async function () {
    const response = await fetch(`http://127.0.0.1:${testApiPort}/`);

    expect(response.status).toEqual(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('/openapi.json');
  });

  // Projects

  it('should be able to list all Projects via API', async function () {
    const res = await client.content.v1.projects.$get({ query: {} });

    expect(res.status).toEqual(200);
    const projects = await res.json();
    expect(projects.list.length).toEqual(1);
    expect(projects.total).toEqual(1);
    expect(projects.list.find((p) => p.id === project.id)?.id).toEqual(
      project.id
    );
  });

  it('should be able to read a Project via API', async function () {
    const res = await client.content.v1.projects[':projectId'].$get({
      param: { projectId: project.id },
    });

    expect(res.status).toEqual(200);
    const readProject = await res.json();
    expect(core.projects.isProject(readProject)).toEqual(true);
    expect(readProject.id).toEqual(project.id);
  });

  it('should be able to count all Projects via API', async function () {
    const res = await client.content.v1.projects.count.$get();

    expect(res.status).toEqual(200);
    const count = await res.json();
    expect(count).toEqual(1);
  });

  // Collections

  it('should be able to list all Collections via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections.$get(
      {
        param: { projectId: project.id },
        query: {},
      }
    );

    expect(res.status).toEqual(200);
    const collections = await res.json();
    expect(collections.list.length).toEqual(1);
    expect(collections.total).toEqual(1);
    expect(collections.list.find((p) => p.id === collection.id)?.id).toEqual(
      collection.id
    );
  });

  it('should be able to read a Collection via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionIdOrSlug'
    ].$get({
      param: { projectId: project.id, collectionIdOrSlug: collection.id },
    });

    expect(res.status).toEqual(200);
    const readCollection = await res.json();
    expect(core.collections.isCollection(readCollection)).toEqual(true);
    expect(readCollection.id).toEqual(collection.id);
  });

  it('should be able to read a Collection by slug via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionIdOrSlug'
    ].$get({
      param: {
        projectId: project.id,
        collectionIdOrSlug: collection.slug.plural,
      },
    });

    expect(res.status).toEqual(200);
    const readCollection = await res.json();
    expect(core.collections.isCollection(readCollection)).toEqual(true);
    expect(readCollection.id).toEqual(collection.id);
  });

  it('should be able to count all Collections via API', async function () {
    const res = await client.content.v1.projects[
      ':projectId'
    ].collections.count.$get({
      param: { projectId: project.id },
    });

    expect(res.status).toEqual(200);
    const count = await res.json();
    expect(count).toEqual(1);
  });

  // Components

  it('should be able to list all Components via API', async function () {
    const res = await client.content.v1.projects[':projectId'].components.$get({
      param: { projectId: project.id },
      query: {},
    });

    expect(res.status).toEqual(200);
    const components = await res.json();
    expect(components.list.length).toEqual(1);
    expect(components.total).toEqual(1);
    expect(components.list.find((p) => p.id === component.id)?.id).toEqual(
      component.id
    );
  });

  it('should be able to read a Component via API', async function () {
    const res = await client.content.v1.projects[':projectId'].components[
      ':componentIdOrSlug'
    ].$get({
      param: { projectId: project.id, componentIdOrSlug: component.id },
    });

    expect(res.status).toEqual(200);
    const readComponent = await res.json();
    expect(core.components.isComponent(readComponent)).toEqual(true);
    expect(readComponent.id).toEqual(component.id);
  });

  it('should be able to read a Component by slug via API', async function () {
    const res = await client.content.v1.projects[':projectId'].components[
      ':componentIdOrSlug'
    ].$get({
      param: {
        projectId: project.id,
        componentIdOrSlug: component.slug,
      },
    });

    expect(res.status).toEqual(200);
    const readComponent = await res.json();
    expect(core.components.isComponent(readComponent)).toEqual(true);
    expect(readComponent.id).toEqual(component.id);
  });

  it('should be able to count all Components via API', async function () {
    const res = await client.content.v1.projects[
      ':projectId'
    ].components.count.$get({
      param: { projectId: project.id },
    });

    expect(res.status).toEqual(200);
    const count = await res.json();
    expect(count).toEqual(1);
  });

  // // Entries

  it('should be able to list all Entries via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionIdOrSlug'
    ].entries.$get({
      param: { projectId: project.id, collectionIdOrSlug: collection.id },
      query: {},
    });

    expect(res.status).toEqual(200);
    const entries = await res.json();
    expect(entries.list.length).toEqual(1);
    expect(entries.total).toEqual(1);
    expect(entries.list.find((p) => p.id === entry.id)?.id).toEqual(entry.id);
  });

  it('should be able to list all Entries by collection slug via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionIdOrSlug'
    ].entries.$get({
      param: {
        projectId: project.id,
        collectionIdOrSlug: collection.slug.plural,
      },
      query: {},
    });

    expect(res.status).toEqual(200);
    const entries = await res.json();
    expect(entries.list.length).toEqual(1);
    expect(entries.list.find((p) => p.id === entry.id)?.id).toEqual(entry.id);
  });

  it('should be able to read an Entry via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionIdOrSlug'
    ].entries[':entryId'].$get({
      param: {
        projectId: project.id,
        collectionIdOrSlug: collection.id,
        entryId: entry.id,
      },
    });

    expect(res.status).toEqual(200);
    const readEntry = await res.json();
    expect(core.entries.isEntry(readEntry)).toEqual(true);
    expect(readEntry.id).toEqual(entry.id);
  });

  it('should be able to count all Entries via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionIdOrSlug'
    ].entries.count.$get({
      param: { projectId: project.id, collectionIdOrSlug: collection.id },
    });

    expect(res.status).toEqual(200);
    const count = await res.json();
    expect(count).toEqual(1);
  });

  // // Assets

  it('should be able to list all Assets via API', async function () {
    const res = await client.content.v1.projects[':projectId'].assets.$get({
      param: { projectId: project.id },
      query: {},
    });

    expect(res.status).toEqual(200);
    const assets = await res.json();
    expect(assets.list.length).toEqual(1);
    expect(assets.total).toEqual(1);
    expect(assets.list.find((p) => p.id === asset.id)?.id).toEqual(asset.id);
  });

  it('should be able to read an Asset via API', async function () {
    const res = await client.content.v1.projects[':projectId'].assets[
      ':assetId'
    ].$get({
      param: { projectId: project.id, assetId: asset.id },
    });

    expect(res.status).toEqual(200);
    const readAsset = await res.json();
    expect(core.assets.isAsset(readAsset)).toEqual(true);
    expect(readAsset.id).toEqual(asset.id);
  });

  it('should be able to count all Assets via API', async function () {
    const res = await client.content.v1.projects[
      ':projectId'
    ].assets.count.$get({
      param: { projectId: project.id },
    });

    expect(res.status).toEqual(200);
    const count = await res.json();
    expect(count).toEqual(1);
  });

  // Error handling

  it('should return 422 for invalid request parameters', async function () {
    const res = await app.request('/content/v1/projects/not-a-uuid');

    expect(res.status).toEqual(422);
    const body = (await res.json()) as {
      success: boolean;
      error: { name: string; issues: unknown[] };
    };
    expect(body.success).toEqual(false);
    expect(body.error.name).toEqual('ZodError');
    expect(body.error.issues).toBeDefined();
  });

  it('should return 404 for unknown routes', async function () {
    const res = await app.request('/this-does-not-exist');

    expect(res.status).toEqual(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toEqual('Not Found - /this-does-not-exist');
  });

  it('should return 404 in the CoreError envelope for an entity that does not exist', async function () {
    const res = await app.request(
      `/content/v1/projects/${crypto.randomUUID()}`
    );

    expect(res.status).toEqual(404);
    const body = (await res.json()) as {
      error: { type: string; message: string; statusCode: number };
    };
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('NotFound');
    expect(body.error.statusCode).toBe(404);
    expect(body.error.message).toBeDefined();
  });

  it('should be able to stop the API and verify it is not running anymore', async function () {
    const isRunningBefore = core.api.isRunning();
    await core.api.stop();

    const isRunningAfter = core.api.isRunning();

    expect(isRunningBefore).toEqual(true);
    expect(isRunningAfter).toEqual(false);
  });
});

/**
 * Names of every `#/components/schemas/<name>` a document references, so a
 * schema the generator failed to emit shows up as a dangling reference.
 */
function refsIn(document: OpenApiDocument): string[] {
  const refs = new Set<string>();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        refs.add(value.replace('#/components/schemas/', ''));
      } else {
        walk(value);
      }
    }
  };

  walk(document);
  return [...refs];
}

/**
 * An IPv4 address of this machine that is not loopback, or null when it
 * has none, which is what a sandboxed runner looks like.
 */
function externalIpv4(): string | null {
  for (const addresses of Object.values(Os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && address.internal === false) {
        return address.address;
      }
    }
  }
  return null;
}
