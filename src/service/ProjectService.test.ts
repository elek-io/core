import Fs from 'fs-extra';
import { beforeAll, describe, expect, it } from 'vitest';
import core, { type Project } from '../test/setup.js';
import { createProject } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project;
  let clonedProject: Project;
  const isGithubAction = process.env?.['GITHUB_ACTIONS'];
  const gitUrl = 'git@github.com:elek-io/project-test-1.git';

  beforeAll(async function () {
    // Start clean
    await Fs.emptyDir(core.util.pathTo.projects);
  });

  it.sequential(
    'should be able to create a new Project locally',
    async function () {
      project = await createProject('project #1');

      expect(project.name).to.equal('project #1');
      expect(project.settings, 'settings to default to').to.deep.equal({
        language: {
          supported: ['en'],
          default: 'en',
        },
      });
      expect(project.created).to.approximately(
        Math.floor(Date.now() / 1000),
        5
      ); // 5 seconds of delta allowed
      expect(project.updated).to.be.null;
      expect(await Fs.pathExists(core.util.pathTo.project(project.id))).to.be
        .true;
    }
  );

  it.sequential('should be able to read a Project', async function () {
    const readProject = await core.projects.read({ id: project.id });

    expect(readProject.name).to.equal('project #1');
  });

  it.sequential('should be able to update a Project', async function () {
    project.name = 'Project #1';
    await core.projects.update(project);
    const updatedProject = await core.projects.read({ id: project.id });

    expect(updatedProject.name).to.equal('Project #1');
    expect(updatedProject.updated).to.approximately(
      Math.floor(Date.now() / 1000),
      5
    ); // 5 seconds of delta allowed
  });

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
      async function () {
        clonedProject = await core.projects.clone({ url: gitUrl });
        expect(await Fs.pathExists(core.util.pathTo.project(clonedProject.id)))
          .to.be.true;
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
      async function () {
        await core.projects.update({ ...clonedProject, name: 'A new name' });
        const changes = await core.projects.getChanges({
          id: clonedProject.id,
        });

        expect(changes.ahead.length).to.equal(1);
      }
    );

    it.sequential(
      'should be able to synchronize the cloned Project with its remote',
      { timeout: 20000 },
      async function () {
        await core.projects.synchronize({ id: clonedProject.id });
        const changes = await core.projects.getChanges({
          id: clonedProject.id,
        });

        expect(changes.ahead.length).to.equal(0);
      }
    );
  }
});
