import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ElekIoCore, { PaginatedList } from '../index.node.js';
import { type Project } from '../test/setup.js';
import { createProject } from '../test/util.js';

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
  window: null,
  // The localApi object is actually ignored by Core
  // and used by Client to instruct Core how and when to start the API
  localApi: {
    isEnabled: true,
    port: 31310,
  },
});

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential(
    'should be able to start the API and verify it is running',
    async function () {
      const isRunningBefore = core.api.isRunning();
      core.api.start(31310);

      await vi.waitFor(
        () => {
          if (core.api.isRunning() === false) {
            throw new Error('Server not started yet');
          }
        },
        {
          timeout: 500,
          interval: 20,
        }
      );

      const isRunningAfter = core.api.isRunning();

      expect(isRunningBefore).to.equal(false);
      expect(isRunningAfter).to.equal(true);
    }
  );

  it.sequential(
    'should be able to list all Projects via API',
    async function () {
      const response = await fetch('http://localhost:31310/v1/projects');
      const projects = (await response.json()) as PaginatedList<Project>;

      expect(projects.list.length).to.equal(1);
      expect(projects.total).to.equal(1);
      expect(projects.list.find((p) => p.id === project.id)?.id).to.equal(
        project.id
      );
    }
  );

  it.sequential('should be able to read a Project via API', async function () {
    const response = await fetch(
      `http://localhost:31310/v1/projects/${project.id}`
    );
    const readProject = (await response.json()) as Project;

    expect(core.projects.isProject(readProject)).to.equal(true);
    expect(readProject.id).to.equal(readProject.id);
  });

  it.sequential(
    'should be able to count all Projects via API',
    async function () {
      const response = await fetch('http://localhost:31310/v1/projects/count');
      const count = (await response.json()) as number;

      expect(count).to.equal(1);
    }
  );

  it.sequential(
    'should be able to stop the API and verify it is not running anymore',
    async function () {
      const isRunningBefore = core.api.isRunning();
      core.api.stop();

      await vi.waitFor(
        () => {
          if (core.api.isRunning() === true) {
            throw new Error('Server is still running');
          }
        },
        {
          timeout: 500,
          interval: 20,
        }
      );

      const isRunningAfter = core.api.isRunning();

      expect(isRunningBefore).to.equal(true);
      expect(isRunningAfter).to.equal(false);
    }
  );
});
