import Fs from 'fs-extra';
import Path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { uuid, type Asset, type Project } from '../test/setup.js';
import {
  createAsset,
  createLocalRemoteRepository,
  createProject,
} from '../test/util.js';

describe('GitService', function () {
  let project: Project & { destroy: () => Promise<void> };
  let projectPath = '';
  let remoteProject: Project;
  let remoteProjectPath: string;
  let createdAsset: Asset;

  beforeAll(async function () {
    project = await createProject();
    projectPath = core.util.pathTo.project(project.id);
    remoteProject = await createLocalRemoteRepository();
    remoteProjectPath = Path.join(core.util.pathTo.tmp, remoteProject.id);
  });

  afterAll(async function () {
    await project.destroy();
    await Fs.remove(remoteProjectPath);
  });

  it('should be able to get the current Branch name', async function () {
    const currentBranch = await core.git.branches.current(projectPath);

    expect(currentBranch).toEqual('work');
  });

  it('should be able to get all available Branch names', async function () {
    const branches = await core.git.branches.list(projectPath);

    expect(branches.local).to.contain('production').and.to.contain('work');
  });

  it('should be able to tell that there is no remote origin yet', async function () {
    const hasOrigin = await core.git.remotes.hasOrigin(projectPath);

    expect(hasOrigin).toBe(false);
  });

  it('should be able to set the remote origin', async function () {
    await core.git.remotes.addOrigin(projectPath, remoteProjectPath);
  });

  it('should be able to tell that there is a remote origin now', async function () {
    const hasOrigin = await core.git.remotes.hasOrigin(projectPath);

    expect(hasOrigin).toBe(true);
  });

  it('should be able to get the current remote origin URL', async function () {
    const remoteOriginUrl = await core.git.remotes.getOriginUrl(projectPath);

    expect(remoteOriginUrl).toEqual(remoteProjectPath);
  });

  it('should be able to set a new remote origin URL', async function () {
    const newGitUrl = 'git@elek.io:organisation/repository.git';
    await core.git.remotes.setOriginUrl(projectPath, newGitUrl);
    const remoteOriginUrl = await core.git.remotes.getOriginUrl(projectPath);

    expect(remoteOriginUrl).toEqual(newGitUrl);
  });

  it('should throw trying to add the remote origin if origin is added already', async function () {
    await expect(() =>
      core.git.remotes.addOrigin(projectPath, remoteProjectPath)
    ).rejects.toThrow();
  });

  // Pushing to a remote repository

  it('should be able to force push an existing Project to a new remote', async function () {
    await core.git.remotes.setOriginUrl(projectPath, remoteProjectPath);
    await core.git.push(projectPath, { all: true, force: true }); // Force all branches because remote origin is not the same as local origin
  });

  it('should be able to make a local change and see the difference between local and remote', async function () {
    createdAsset = await createAsset(project.id);

    const changes = await core.projects.getChanges({ id: project.id });

    expect(changes.ahead).to.have.lengthOf(1);
    expect(changes.ahead[0]?.message.method).toEqual('create');
    expect(changes.ahead[0]?.message.reference.objectType).toEqual('asset');
    expect(changes.ahead[0]?.message.reference.id).toEqual(createdAsset.id);
    expect(changes.behind).to.have.lengthOf(0);
  });

  it('should be able to push the change to remote', async function () {
    await core.git.push(projectPath);
  });

  it('should be able to see there is no difference between local and remote anymore', async function () {
    const changes = await core.projects.getChanges({ id: project.id });

    expect(changes.ahead).to.have.lengthOf(0);
    expect(changes.behind).to.have.lengthOf(0);
  });

  // Pulling from a remote repository

  it('should be able to make a change on the remote and see the difference', async function () {
    // To make a change on the remote, we first need to copy the local project
    // then make changes to the copy and then push those changes to the remote.
    // This is needed because the remote repository is a bare repository and cannot be modified directly.
    const newProjectId = uuid();
    const newProjectPath = core.util.pathTo.project(newProjectId);
    await Fs.copy(projectPath, newProjectPath);
    const anotherCreatedAsset = await createAsset(newProjectId);
    await core.git.push(newProjectPath);

    const changes = await core.projects.getChanges({ id: project.id });

    expect(changes.ahead).to.have.lengthOf(0);
    expect(changes.behind).to.have.lengthOf(1);
    expect(changes.behind[0]?.message.method).toEqual('create');
    expect(changes.behind[0]?.message.reference.objectType).toEqual('asset');
    expect(changes.behind[0]?.message.reference.id).toEqual(
      anotherCreatedAsset.id
    );

    await Fs.remove(newProjectPath);
  });

  it('should be able to pull the change from remote', async function () {
    await core.git.pull(projectPath);
  });

  it('should be able to see there is no difference between local and remote anymore', async function () {
    const changes = await core.projects.getChanges({ id: project.id });

    expect(changes.ahead).to.have.lengthOf(0);
    expect(changes.behind).to.have.lengthOf(0);
  });
});
