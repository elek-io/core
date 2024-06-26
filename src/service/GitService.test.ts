import type { Project } from '@elek-io/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createProject } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let projectPath = '';
  const gitUrl = 'git@github.com:organisation/repository.git';

  beforeAll(async function () {
    project = await createProject();
    projectPath = core.util.pathTo.project(project.id);
  });

  // afterAll(async function () {
  //   await project.destroy();
  // });

  it.sequential(
    'should be able to get the current Branch name',
    async function () {
      const currentBranch = await core.git.branches.getCurrent(projectPath);

      expect(currentBranch).to.equal('stage');
    }
  );

  it.sequential(
    'should be able to get all available Branch names',
    async function () {
      const branches = await core.git.branches.list(projectPath);

      expect(branches.local).to.contain('main').and.to.contain('stage');
    }
  );

  it.sequential('should be able to get no remotes at first', async function () {
    const remotes = await core.git.remotes.list(projectPath);

    expect(remotes).to.be.empty;
  });

  it.sequential(
    'should be able to tell that there is no remote origin yet',
    async function () {
      const hasOrigin = await core.git.remotes.hasOrigin(projectPath);

      expect(hasOrigin).to.be.false;
    }
  );

  it.sequential(
    'should throw trying to get the current origin URL if no origin is set yet',
    async function () {
      await expect(() =>
        core.git.remotes.getOriginUrl(projectPath)
      ).rejects.toThrow();
    }
  );

  it.sequential(
    'should throw trying to set the current origin URL if no origin is set yet',
    async function () {
      await expect(() =>
        core.git.remotes.setOriginUrl(projectPath, gitUrl)
      ).rejects.toThrow();
    }
  );

  it.sequential(
    'should be able to add the remote origin and verify it is set',
    async function () {
      await core.git.remotes.addOrigin(projectPath, gitUrl);
      const remotes = await core.git.remotes.list(projectPath);
      const hasOrigin = await core.git.remotes.hasOrigin(projectPath);

      expect(remotes).to.contain('origin');
      expect(hasOrigin).to.be.true;
    }
  );

  it.sequential(
    'should be able to get the remote origin URL',
    async function () {
      const remoteOriginUrl = await core.git.remotes.getOriginUrl(projectPath);

      expect(remoteOriginUrl).to.equal(gitUrl);
    }
  );

  it.sequential(
    'should be able to set the remote origin URL',
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
        core.git.remotes.addOrigin(projectPath, gitUrl)
      ).rejects.toThrow();
    }
  );
});
