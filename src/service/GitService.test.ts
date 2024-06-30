import type { Project } from '@elek-io/shared';
import Fs from 'fs-extra';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createProject } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let projectPath = '';
  const isGithubAction = process.env.GITHUB_ACTIONS;
  const gitUrl = 'git@github.com:organisation/repository.git';

  beforeAll(async function () {
    project = await createProject();
    projectPath = core.util.pathTo.project(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential(
    'should be able to get the current Branch name',
    async function () {
      const currentBranch = await core.git.branches.current(projectPath);

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

  // @todo make this work inside Github Action - ideally we can add an SSH key to the Action that can read / write to the test repository
  if (isGithubAction) {
    console.warn('Running inside a Github Action - some tests are skipped');
  } else {
    it.sequential(
      'should be able to push an existing Project to a new remote',
      { timeout: 20000 },
      async function () {
        await core.git.remotes.setOriginUrl(
          projectPath,
          'git@github.com:elek-io/project-test-1.git'
        );
        await core.git.push(projectPath, { all: true, force: true }); // Force all branches because remote origin is probably not empty
      }
    );

    it.sequential(
      'should be able to make a local change and see the difference between local and remote',
      async function () {
        await Fs.writeFile(path.join(projectPath, 'README.md'), 'Hello World!');
        await core.git.add(projectPath, ['README.md']);
        await core.git.commit(projectPath, 'Added a README');

        const changes = await core.projects.getChanges({ id: project.id });

        expect(changes.ahead).to.have.lengthOf(1);
        expect(changes.behind).to.have.lengthOf(0);
      }
    );

    it.sequential(
      'should be able to push the change to remote',
      { timeout: 20000 },
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
  }
});
