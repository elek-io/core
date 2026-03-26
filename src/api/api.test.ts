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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createProject,
  createAsset,
  createCollection,
  createComponent,
  createEntry,
} from '../test/util.js';
import core from '../test/setup.js';

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
    core.api.start(31310);

    await vi.waitFor(
      () => {
        const isCurrentlyRunning = core.api.isRunning();
        if (isCurrentlyRunning === false) {
          throw new Error('Server not started yet');
        }
      },
      {
        timeout: 500,
        interval: 20,
      }
    );

    const isRunningAfter = core.api.isRunning();

    expect(isRunningBefore).toEqual(false);
    expect(isRunningAfter).toEqual(true);
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

  it('should return 500 for internal errors', async function () {
    const res = await app.request(
      `/content/v1/projects/${crypto.randomUUID()}`
    );

    expect(res.status).toEqual(500);
    const body = (await res.json()) as {
      error: { type: string; message: string };
    };
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('Internal');
    expect(body.error.message).toBeDefined();
  });

  it('should be able to stop the API and verify it is not running anymore', async function () {
    const isRunningBefore = core.api.isRunning();
    core.api.stop();

    await vi.waitFor(
      () => {
        const isCurrentlyRunning = core.api.isRunning();
        if (isCurrentlyRunning === true) {
          throw new Error('Server is still running');
        }
      },
      {
        timeout: 500,
        interval: 20,
      }
    );

    const isRunningAfter = core.api.isRunning();

    expect(isRunningBefore).toEqual(true);
    expect(isRunningAfter).toEqual(false);
  });
});
