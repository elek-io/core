import Fs from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectUpgradeError } from '../error/ProjectUpgradeError.js';
import core, { projectFileSchema, type Project } from '../test/setup.js';
import {
  createAsset,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let clonedProject: Project;
  const isGithubAction = process.env?.['GITHUB_ACTIONS'];
  const gitUrl = 'git@github.com:elek-io/project-test-1.git';

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential(
    'should be able to create a new Project locally',
    async function ({ task }) {
      project = await createProject('project #1');

      expect(project.name).to.equal('project #1');
      expect(project.settings, 'settings to default to').to.deep.equal({
        language: {
          supported: ['en'],
          default: 'en',
        },
      });
      expect(
        Math.floor(new Date(project.created).getTime() / 1000)
      ).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
      expect(project.updated).to.be.null;
      expect(await Fs.pathExists(core.util.pathTo.project(project.id))).to.be
        .true;
      expect(project.history.length).to.equal(1);
      expect(project.fullHistory.length).to.equal(1);
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential('should be able to read a Project', async function () {
    const readProject = await core.projects.read({ id: project.id });

    expect(readProject.name).to.equal('project #1');
  });

  it.sequential(
    'should be able to update a Project',
    async function ({ task }) {
      project.name = 'Project #1';
      await core.projects.update(project);
      const updatedProject = await core.projects.read({ id: project.id });

      expect(updatedProject.name).to.equal('Project #1');
      expect(
        // @ts-expect-error updated is not allowed to be null
        Math.floor(new Date(updatedProject.updated).getTime() / 1000)
      ).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
      expect(updatedProject.history.length).to.equal(2);
      expect(updatedProject.fullHistory.length).to.equal(2);
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential(
    'should be able to get the full commit history of the Project',
    async function ({ task }) {
      await createAsset(project.id);
      const readProject = await core.projects.read({ id: project.id });

      expect(readProject.history.length).to.equal(2);
      expect(readProject.fullHistory.length).to.equal(3); // Now with new Asset
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential(
    'should be able to get the content of a Project at a specific commit',
    async function () {
      const readProject = await core.projects.read({ id: project.id });

      expect(readProject.history.length).to.equal(2);

      const projectFromHistory = await core.projects.read({
        id: project.id,
        commitHash: readProject.history.pop()?.hash,
      });

      expect(projectFromHistory.name).to.equal('project #1');
    }
  );

  it.sequential('should be able to list all Projects', async function () {
    const projects = await core.projects.list();

    expect(projects.list.length).to.equal(1);
    expect(projects.total).to.equal(1);
    expect(projects.list.find((p) => p.id === project.id)?.id).to.equal(
      project.id
    );
  });

  it.sequential('should be able to count all Projects', async function () {
    const counted = await core.projects.count();

    expect(counted).to.equal(1);
  });

  it.sequential('should be able to identify a Project', async function () {
    expect(core.projects.isProject(project)).to.be.true;
    expect(core.projects.isProject({ objectType: 'project' })).to.be.false;
  });

  it.sequential(
    'should throw when trying to upgrade a Project to the same version of Core',
    async function ({ task }) {
      await expect(
        core.projects.upgrade({ id: project.id })
      ).rejects.toThrowError(ProjectUpgradeError);
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential(
    'should upgrade a Project to the same version of Core if forced to do so',
    async function ({ task }) {
      await core.projects.upgrade({ id: project.id, force: true });
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential(
    'should throw when trying to upgrade a Project with a lower version of Core than the Project was created with',
    async function ({ task }) {
      const readProject = await core.projects.read({ id: project.id });
      readProject.coreVersion = '999.0.0';
      await Fs.writeFile(
        core.util.pathTo.projectFile(project.id),
        JSON.stringify(projectFileSchema.parse(readProject))
      );
      await core.git.add(core.util.pathTo.project(project.id), [
        core.util.pathTo.projectFile(project.id),
      ]);
      await core.git.commit(
        core.util.pathTo.project(project.id),
        'TEST: Modified core version'
      );

      await expect(
        core.projects.upgrade({ id: project.id })
      ).rejects.toThrowError(ProjectUpgradeError);
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential(
    'should be able to list all outdated Projects',
    async function () {
      const outdatedProjects = await core.projects.listOutdated();

      expect(outdatedProjects.length).to.equal(1);
    }
  );

  it.sequential(
    'should be able to upgrade a Project with a higher version of Core than the Project was created with',
    async function ({ task }) {
      const readProject = await core.projects.read({ id: project.id });
      readProject.coreVersion = '0.0.0';
      await Fs.writeFile(
        core.util.pathTo.projectFile(project.id),
        JSON.stringify(projectFileSchema.parse(readProject))
      );
      await core.git.add(core.util.pathTo.project(project.id), [
        core.util.pathTo.projectFile(project.id),
      ]);
      await core.git.commit(
        core.util.pathTo.project(project.id),
        'TEST: Modified core version'
      );

      await core.projects.upgrade({ id: project.id });
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential(
    'should be able to list no outdated Projects anymore',
    async function () {
      const outdatedProjects = await core.projects.listOutdated();

      expect(outdatedProjects.length).to.equal(0);
    }
  );

  it.sequential(
    'should be able to list the branches of a Project',
    async function () {
      const branches = await core.projects.branches.list({ id: project.id });

      expect(branches.local).to.include('main', 'stage');
    }
  );

  it.sequential(
    'should be able to get the current branch of a Project',
    async function () {
      const currentBranch = await core.projects.branches.current({
        id: project.id,
      });

      expect(currentBranch).to.equal('stage');
    }
  );

  it.sequential(
    'should be able to switch the current branch of a Project',
    async function ({ task }) {
      await core.projects.branches.switch({
        id: project.id,
        branch: 'main',
      });
      const currentBranch = await core.projects.branches.current({
        id: project.id,
      });

      expect(currentBranch).to.equal('main');
      await ensureCleanGitStatus(task, project.id);
    }
  );

  it.sequential('should be able to delete a Project', async function () {
    await core.projects.delete({ id: project.id });
    expect(
      await Fs.pathExists(core.util.pathTo.project(project.id))
    ).to.be.false;
  });

  // @todo make this work inside Github Action - ideally we can add an SSH key to the Action that can read / write to the test repository
  if (isGithubAction) {
    console.warn('Running inside a Github Action - some tests are skipped');
  } else {
    it.sequential(
      'should be able to clone an existing Project',
      { timeout: 20000 },
      async function ({ task }) {
        clonedProject = await core.projects.clone({ url: gitUrl });
        expect(await Fs.pathExists(core.util.pathTo.project(clonedProject.id)))
          .to.be.true;
        await ensureCleanGitStatus(task, clonedProject.id);
      }
    );

    it.sequential(
      'should be able to get the origin URL of the cloned Project',
      async function () {
        const originUrl = await core.projects.remotes.getOriginUrl({
          id: clonedProject.id,
        });
        expect(originUrl).to.equal(gitUrl);
      }
    );

    it.sequential(
      'should be able to update the cloned Project and verify there is a change',
      async function ({ task }) {
        await core.projects.update({ ...clonedProject, name: 'A new name' });
        await createAsset(clonedProject.id);
        const changes = await core.projects.getChanges({
          id: clonedProject.id,
        });

        expect(changes.ahead.length).to.equal(2);
        await ensureCleanGitStatus(task, clonedProject.id);
      }
    );

    it.sequential(
      'should be able to synchronize the cloned Project with its remote',
      { timeout: 20000, retry: 3 }, // Sometimes git fetch fails with "ssh: connect to host github.com port 22: Cannot allocate memory"
      async function ({ task }) {
        await core.projects.synchronize({ id: clonedProject.id });
        const changes = await core.projects.getChanges({
          id: clonedProject.id,
        });

        expect(changes.ahead.length).to.equal(0);
        await ensureCleanGitStatus(task, clonedProject.id);
      }
    );

    it.sequential(
      'should fail when trying to clone a Project twice',
      { timeout: 20000 },
      async function () {
        await expect(
          core.projects.clone({ url: gitUrl })
        ).rejects.toThrowError();
      }
    );

    it.sequential(
      'should be able to delete the cloned Project locally',
      async function () {
        await core.projects.delete({ id: clonedProject.id });

        expect(await Fs.pathExists(core.util.pathTo.project(clonedProject.id)))
          .to.be.false;
      }
    );
  }
});
