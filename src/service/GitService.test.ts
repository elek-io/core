import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { type Project } from '../test/setup.js';
import {
  createAsset,
  createLocalRemoteRepository,
  createProject,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let projectPath = '';
  let remoteProjectPath: string;

  beforeAll(async function () {
    project = await createProject();
    projectPath = core.util.pathTo.project(project.id);
    remoteProjectPath = await createLocalRemoteRepository();
  });

  afterAll(async function () {
    await project.destroy();
    await Fs.remove(remoteProjectPath);
  });

  it.sequential(
    'should be able to get the current Branch name',
    async function () {
      const currentBranch = await core.git.branches.current(projectPath);

      expect(currentBranch).to.equal('work');
    }
  );

  it.sequential(
    'should be able to get all available Branch names',
    async function () {
      const branches = await core.git.branches.list(projectPath);

      expect(branches.local).to.contain('production').and.to.contain('work');
    }
  );

  it.sequential(
    'should be able to tell that there is no remote origin yet',
    async function () {
      const hasOrigin = await core.git.remotes.hasOrigin(projectPath);

      expect(hasOrigin).to.be.false;
    }
  );

  it.sequential('should be able to set the remote origin', async function () {
    await core.git.remotes.addOrigin(projectPath, remoteProjectPath);
  });

  it.sequential(
    'should be able to tell that there is a remote origin now',
    async function () {
      const hasOrigin = await core.git.remotes.hasOrigin(projectPath);

      expect(hasOrigin).to.be.true;
    }
  );

  it.sequential(
    'should be able to get the current remote origin URL',
    async function () {
      const remoteOriginUrl = await core.git.remotes.getOriginUrl(projectPath);

      expect(remoteOriginUrl).to.equal(remoteProjectPath);
    }
  );

  it.sequential(
    'should be able to set a new remote origin URL',
    async function () {
      const newGitUrl = 'git@elek.io:organisation/repository.git';
      await core.git.remotes.setOriginUrl(projectPath, newGitUrl);
      const remoteOriginUrl = await core.git.remotes.getOriginUrl(projectPath);

      expect(remoteOriginUrl).to.equal(newGitUrl);
    }
  );

  it.sequential(
    'should throw trying to add the remote origin if origin is added already',
    async function () {
      await expect(() =>
        core.git.remotes.addOrigin(projectPath, remoteProjectPath)
      ).rejects.toThrow();
    }
  );

  it.sequential(
    'should be able to force push an existing Project to a new remote',
    async function () {
      await core.git.remotes.setOriginUrl(projectPath, remoteProjectPath);
      await core.git.push(projectPath, { all: true, force: true }); // Force all branches because remote origin is not the same as local origin
    }
  );

  it.sequential(
    'should be able to make a local change and see the difference between local and remote',
    async function () {
      await createAsset(project.id);

      const changes = await core.projects.getChanges({ id: project.id });

      expect(changes.ahead).to.have.lengthOf(1);
      expect(changes.behind).to.have.lengthOf(0);
    }
  );

  it.sequential(
    'should be able to push the change to remote',
    async function () {
      await core.git.push(projectPath);
    }
  );

  it.sequential(
    'should be able to see there is no difference between local and remote anymore',
    async function () {
      const changes = await core.projects.getChanges({ id: project.id });

      expect(changes.ahead).to.have.lengthOf(0);
      expect(changes.behind).to.have.lengthOf(0);
    }
  );
});
