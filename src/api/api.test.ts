import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ElekIoCore, {
  Asset,
  Collection,
  Entry,
  PaginatedList,
} from '../index.node.js';
import { type Project } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from '../test/util.js';

const core = new ElekIoCore({
  log: {
    level: 'debug',
  },
});

await core.user.set({
  userType: 'local',
  name: 'John Doe',
  email: 'john.doe@test.com',
  language: 'en',
  // The localApi object is actually ignored by Core
  // and used by Client to instruct Core how and when to start the API
  localApi: {
    isEnabled: true,
    port: 31310,
  },
});

async function betterFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(
      `Request failed to request "${response.url}" with status "${
        response.status
      }" and body: ${await response.text()}`
    );
  }

  return await response.json();
}

describe.sequential('Integration', function () {
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

  it.sequential(
    'should be able to start the API and verify it is running',
    async function () {
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

      expect(isRunningBefore).to.equal(false);
      expect(isRunningAfter).to.equal(true);
    }
  );

  // Projects

  it.sequential(
    'should be able to list all Projects via API',
    async function () {
      const projects = (await betterFetch(
        'http://localhost:31310/v1/projects'
      )) as PaginatedList<Project>;

      expect(projects.list.length).to.equal(1);
      expect(projects.total).to.equal(1);
      expect(projects.list.find((p) => p.id === project.id)?.id).to.equal(
        project.id
      );
    }
  );

  it.sequential('should be able to read a Project via API', async function () {
    const readProject = (await betterFetch(
      `http://localhost:31310/v1/projects/${project.id}`
    )) as Project;

    expect(core.projects.isProject(readProject)).to.equal(true);
    expect(readProject.id).to.equal(project.id);
  });

  it.sequential(
    'should be able to count all Projects via API',
    async function () {
      const count = (await betterFetch(
        'http://localhost:31310/v1/projects/count'
      )) as number;

      expect(count).to.equal(1);
    }
  );

  // Collections

  it.sequential(
    'should be able to list all Collections via API',
    async function () {
      const collections = (await betterFetch(
        `http://localhost:31310/v1/projects/${project.id}/collections`
      )) as PaginatedList<Collection>;

      expect(collections.list.length).to.equal(1);
      expect(collections.total).to.equal(1);
      expect(collections.list.find((p) => p.id === collection.id)?.id).to.equal(
        collection.id
      );
    }
  );

  it.sequential(
    'should be able to read an Collection via API',
    async function () {
      const readCollection = (await betterFetch(
        `http://localhost:31310/v1/projects/${project.id}/collections/${collection.id}`
      )) as Collection;

      expect(core.collections.isCollection(readCollection)).to.equal(true);
      expect(readCollection.id).to.equal(collection.id);
    }
  );

  it.sequential(
    'should be able to count all Collections via API',
    async function () {
      const count = (await betterFetch(
        `http://localhost:31310/v1/projects/${project.id}/collections/count`
      )) as number;

      expect(count).to.equal(1);
    }
  );

  // Entries

  it.sequential(
    'should be able to list all Entries via API',
    async function () {
      const entries = (await betterFetch(
        `http://localhost:31310/v1/projects/${project.id}/collections/${collection.id}/entries`
      )) as PaginatedList<Entry>;

      expect(entries.list.length).to.equal(1);
      expect(entries.total).to.equal(1);
      expect(entries.list.find((p) => p.id === entry.id)?.id).to.equal(
        entry.id
      );
    }
  );

  it.sequential('should be able to read an Entry via API', async function () {
    const readEntry = (await betterFetch(
      `http://localhost:31310/v1/projects/${project.id}/collections/${collection.id}/entries/${entry.id}`
    )) as Entry;

    expect(core.entries.isEntry(readEntry)).to.equal(true);
    expect(readEntry.id).to.equal(entry.id);
  });

  it.sequential(
    'should be able to count all Entries via API',
    async function () {
      const count = (await betterFetch(
        `http://localhost:31310/v1/projects/${project.id}/collections/${collection.id}/entries/count`
      )) as number;

      expect(count).to.equal(1);
    }
  );

  // Assets

  it.sequential('should be able to list all Assets via API', async function () {
    const assets = (await betterFetch(
      `http://localhost:31310/v1/projects/${project.id}/assets`
    )) as PaginatedList<Asset>;

    expect(assets.list.length).to.equal(1);
    expect(assets.total).to.equal(1);
    expect(assets.list.find((p) => p.id === asset.id)?.id).to.equal(asset.id);
  });

  it.sequential('should be able to read an Asset via API', async function () {
    const readAsset = (await betterFetch(
      `http://localhost:31310/v1/projects/${project.id}/assets/${asset.id}`
    )) as Asset;

    expect(core.assets.isAsset(readAsset)).to.equal(true);
    expect(readAsset.id).to.equal(asset.id);
  });

  it.sequential(
    'should be able to count all Assets via API',
    async function () {
      const count = (await betterFetch(
        `http://localhost:31310/v1/projects/${project.id}/assets/count`
      )) as number;

      expect(count).to.equal(1);
    }
  );

  it.sequential(
    'should be able to stop the API and verify it is not running anymore',
    async function () {
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

      expect(isRunningBefore).to.equal(true);
      expect(isRunningAfter).to.equal(false);
    }
  );
});
