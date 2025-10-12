import { testClient } from 'hono/testing';
import { createTestApi } from './lib/util.js';
import router from './routes/index.js';
import { Asset, Collection, Entry, Project } from '../index.node.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createProject,
  createAsset,
  createCollection,
  createEntry,
} from '../test/util.js';
import core from '../test/setup.js';

const client = testClient(
  createTestApi(
    router,
    core.logger,
    core.projects,
    core.collections,
    core.entries,
    core.assets
  )
);

describe('API', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;
  let entry: Entry;

  beforeAll(async function () {
    project = await createProject();
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    entry = await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('should be able to start the API and verify it is running', async function () {
    const isRunningBefore = await core.api.isRunning();
    await core.api.start(31310);

    await vi.waitFor(
      async () => {
        const isCurrentlyRunning = await core.api.isRunning();
        if (isCurrentlyRunning === false) {
          throw new Error('Server not started yet');
        }
      },
      {
        timeout: 500,
        interval: 20,
      }
    );

    const isRunningAfter = await core.api.isRunning();

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

  it('should be able to read an Collection via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionId'
    ].$get({
      param: { projectId: project.id, collectionId: collection.id },
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

  // // Entries

  it('should be able to list all Entries via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionId'
    ].entries.$get({
      param: { projectId: project.id, collectionId: collection.id },
      query: {},
    });

    expect(res.status).toEqual(200);
    const entries = await res.json();
    expect(entries.list.length).toEqual(1);
    expect(entries.total).toEqual(1);
    expect(entries.list.find((p) => p.id === entry.id)?.id).toEqual(entry.id);
  });

  it('should be able to read an Entry via API', async function () {
    const res = await client.content.v1.projects[':projectId'].collections[
      ':collectionId'
    ].entries[':entryId'].$get({
      param: {
        projectId: project.id,
        collectionId: collection.id,
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
      ':collectionId'
    ].entries.count.$get({
      param: { projectId: project.id, collectionId: collection.id },
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

  it('should be able to stop the API and verify it is not running anymore', async function () {
    const isRunningBefore = await core.api.isRunning();
    await core.api.stop();

    await vi.waitFor(
      async () => {
        const isCurrentlyRunning = await core.api.isRunning();
        if (isCurrentlyRunning === true) {
          throw new Error('Server is still running');
        }
      },
      {
        timeout: 500,
        interval: 20,
      }
    );

    const isRunningAfter = await core.api.isRunning();

    expect(isRunningBefore).toEqual(true);
    expect(isRunningAfter).toEqual(false);
  });
});
