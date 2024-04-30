import type { Project } from '@elek-io/shared';
import Fs from 'fs-extra';
import { beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createProject } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project;

  beforeAll(async function () {
    // Start clean
    await Fs.emptyDir(core.util.pathTo.projects);
  });

  it.sequential('should be able to create a new Project', async function () {
    project = await createProject('project #1');

    expect(project.name).to.equal('project #1');
    expect(project.settings, 'settings to default to').to.deep.equal({
      language: {
        supported: ['en'],
        default: 'en',
      },
    });
    expect(project.created).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
    expect(project.updated).to.be.undefined;
    expect(
      await Fs.pathExists(core.util.pathTo.project(project.id))
    ).to.be.true;
  });

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
});
