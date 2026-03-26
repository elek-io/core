import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import core, { projectFileSchema, type Project } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createLocalRemoteRepository,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

describe('ProjectService', function () {
  let project: Project & { destroy: () => Promise<void> };
  let clonedProject: Project;
  let remoteProject: Project;
  let remoteProjectPath: string;

  afterAll(async function () {
    await Fs.remove(remoteProjectPath);
  });

  it('should be able to create a new Project locally', async function ({
    task,
  }) {
    project = await createProject('project #1');

    expect(project.name).toEqual('project #1');
    expect(project.settings, 'settings to default to').to.deep.equal({
      language: {
        supported: ['en', 'de'],
        default: 'en',
      },
    });
    expect(
      Math.floor(new Date(project.created).getTime() / 1000)
    ).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
    expect(project.updated).toBeNull();
    expect(await Fs.pathExists(core.util.pathTo.project(project.id))).toBe(
      true
    );
    const { history, fullHistory } = (await core.projects.history({
      id: project.id,
    }))._unsafeUnwrap();
    expect(history.length).toEqual(1);
    expect(fullHistory.length).toEqual(1);
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to read a Project', async function () {
    const readProject = (await core.projects.read({ id: project.id }))._unsafeUnwrap();

    expect(readProject.name).toEqual('project #1');
  });

  it('should be able to update a Project', async function ({ task }) {
    project.name = 'Project #1';
    (await core.projects.update(project))._unsafeUnwrap();
    const updatedProject = (await core.projects.read({ id: project.id }))._unsafeUnwrap();

    expect(updatedProject.name).toEqual('Project #1');
    expect(
      // @ts-expect-error updated is not allowed to be null
      Math.floor(new Date(updatedProject.updated).getTime() / 1000)
    ).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
    const { history, fullHistory } = (await core.projects.history({
      id: project.id,
    }))._unsafeUnwrap();
    expect(history.length).toEqual(2);
    expect(fullHistory.length).toEqual(2);
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to get the full commit history of the Project', async function ({
    task,
  }) {
    const asset = await createAsset(project.id);
    const collection = await createCollection(project.id);
    await createEntry(project.id, collection.id, asset.id);
    const { history, fullHistory } = (await core.projects.history({
      id: project.id,
    }))._unsafeUnwrap();

    expect(history.length).toEqual(2);
    expect(fullHistory.length).toEqual(6); // Now with new Asset, Collection and Entry
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to get the content of a Project at a specific commit', async function () {
    const { history } = (await core.projects.history({ id: project.id }))._unsafeUnwrap();

    expect(history.length).toEqual(2);

    const projectFromHistory = (await core.projects.read({
      id: project.id,
      commitHash: history.at(-1)?.hash,
    }))._unsafeUnwrap();

    expect(projectFromHistory.name).toEqual('project #1');
  });

  it('should be able to list all Projects', async function () {
    const projects = (await core.projects.list())._unsafeUnwrap();

    expect(projects.list.length).toEqual(1);
    expect(projects.total).toEqual(1);
    expect(projects.list.find((p) => p.id === project.id)?.id).toEqual(
      project.id
    );
  });

  it('should be able to count all Projects', async function () {
    const counted = (await core.projects.count())._unsafeUnwrap();

    expect(counted).toEqual(1);
  });

  it('should be able to identify a Project', function () {
    expect(core.projects.isProject(project)).toBe(true);
    expect(core.projects.isProject({ objectType: 'project' })).toBe(false);
  });

  it('should throw when trying to upgrade a Project to the same version of Core', async function ({
    task,
  }) {
    const upgradeResult = await core.projects.upgrade({ id: project.id });
    expect(upgradeResult.isErr()).toBe(true);
    if (upgradeResult.isErr()) {
      expect(upgradeResult.error.type).toBe('UpgradeFailed');
    }
    await ensureCleanGitStatus(task, project.id);
  });

  it('should upgrade a Project to the same version of Core if forced to do so', async function ({
    task,
  }) {
    (await core.projects.upgrade({ id: project.id, force: true }))._unsafeUnwrap();
    await ensureCleanGitStatus(task, project.id);
  });

  it('should throw when trying to upgrade a Project with a lower version of Core than the Project was created with', async function ({
    task,
  }) {
    const readProject = (await core.projects.read({ id: project.id }))._unsafeUnwrap();
    readProject.coreVersion = '999.0.0';
    await Fs.writeFile(
      core.util.pathTo.projectFile(project.id),
      JSON.stringify(projectFileSchema.parse(readProject))
    );
    (await core.git.add(core.util.pathTo.project(project.id), [
      core.util.pathTo.projectFile(project.id),
    ]))._unsafeUnwrap();
    (await core.git.commit(core.util.pathTo.project(project.id), {
      method: 'update',
      reference: { objectType: 'project', id: project.id },
    }))._unsafeUnwrap();

    const upgradeResult2 = await core.projects.upgrade({ id: project.id });
    expect(upgradeResult2.isErr()).toBe(true);
    if (upgradeResult2.isErr()) {
      expect(upgradeResult2.error.type).toBe('UpgradeFailed');
    }
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to list all outdated Projects', async function () {
    const outdatedProjects = (await core.projects.listOutdated())._unsafeUnwrap();

    expect(outdatedProjects.length).toEqual(1);
  });

  it('should be able to upgrade a Project with a higher version of Core than the Project was created with', async function ({
    task,
  }) {
    const readProject = (await core.projects.read({ id: project.id }))._unsafeUnwrap();
    readProject.coreVersion = '0.0.0';
    await Fs.writeFile(
      core.util.pathTo.projectFile(project.id),
      JSON.stringify(projectFileSchema.parse(readProject))
    );
    (await core.git.add(core.util.pathTo.project(project.id), [
      core.util.pathTo.projectFile(project.id),
    ]))._unsafeUnwrap();
    (await core.git.commit(core.util.pathTo.project(project.id), {
      method: 'update',
      reference: { objectType: 'project', id: project.id },
    }))._unsafeUnwrap();

    (await core.projects.upgrade({ id: project.id }))._unsafeUnwrap();
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to list no outdated Projects anymore', async function () {
    const outdatedProjects = (await core.projects.listOutdated())._unsafeUnwrap();

    expect(outdatedProjects.length).toEqual(0);
  });

  it('should be able to list the branches of a Project', async function () {
    const branches = (await core.projects.branches.list({ id: project.id }))._unsafeUnwrap();

    expect(branches.local).to.include('production', 'work');
  });

  it('should be able to get the current branch of a Project', async function () {
    const currentBranch = (await core.projects.branches.current({
      id: project.id,
    }))._unsafeUnwrap();

    expect(currentBranch).toEqual('work');
  });

  it('should be able to switch the current branch of a Project', async function ({
    task,
  }) {
    (await core.projects.branches.switch({
      id: project.id,
      branch: 'production',
    }))._unsafeUnwrap();
    const currentBranch = (await core.projects.branches.current({
      id: project.id,
    }))._unsafeUnwrap();

    expect(currentBranch).toEqual('production');
    await ensureCleanGitStatus(task, project.id);
  });

  it('should fail to delete a Project without a remote origin', async function () {
    const deleteResult = await core.projects.delete({ id: project.id });
    expect(deleteResult.isErr()).toBe(true);
    if (deleteResult.isErr()) {
      expect(deleteResult.error.type).toBe('PreconditionFailed');
    }
  });

  it('should be able to force delete a Project', async function () {
    (await core.projects.delete({ id: project.id, force: true }))._unsafeUnwrap();
    expect(await Fs.pathExists(core.util.pathTo.project(project.id))).toBe(
      false
    );
  });

  it('should be able to clone an existing Project and verify that the remote origin URL was set', async function ({
    task,
  }) {
    remoteProject = await createLocalRemoteRepository();
    remoteProjectPath = Path.join(core.util.pathTo.tmp, remoteProject.id);

    clonedProject = (await core.projects.clone({ url: remoteProjectPath }))._unsafeUnwrap();
    expect(
      await Fs.pathExists(core.util.pathTo.project(clonedProject.id))
    ).toBe(true);
    expect(clonedProject.remoteOriginUrl).toEqual(remoteProjectPath);
    await ensureCleanGitStatus(task, clonedProject.id);
  });

  it('should be able to update the cloned Project and verify there is a change', async function ({
    task,
  }) {
    (await core.projects.update({ ...clonedProject, name: 'A new name' }))._unsafeUnwrap();
    await createAsset(clonedProject.id);
    const changes = (await core.projects.getChanges({
      id: clonedProject.id,
    }))._unsafeUnwrap();

    expect(changes.ahead.length).toEqual(2);
    await ensureCleanGitStatus(task, clonedProject.id);
  });

  it('should fail to delete a Project with a remote origin but changes to push', async function () {
    const deleteResult = await core.projects.delete({ id: clonedProject.id });
    expect(deleteResult.isErr()).toBe(true);
    if (deleteResult.isErr()) {
      expect(deleteResult.error.type).toBe('Conflict');
    }
  });

  it('should be able to synchronize the cloned Project with its remote', async function ({
    task,
  }) {
    (await core.projects.synchronize({ id: clonedProject.id }))._unsafeUnwrap();
    const changes = (await core.projects.getChanges({
      id: clonedProject.id,
    }))._unsafeUnwrap();

    expect(changes.ahead.length).toEqual(0);
    await ensureCleanGitStatus(task, clonedProject.id);
  });

  it('should fail when trying to clone a Project twice', async function () {
    const cloneResult = await core.projects.clone({ url: remoteProjectPath });
    expect(cloneResult.isErr()).toBe(true);
  });

  it('should be able to delete the cloned Project locally', async function () {
    (await core.projects.delete({ id: clonedProject.id }))._unsafeUnwrap();

    expect(
      await Fs.pathExists(core.util.pathTo.project(clonedProject.id))
    ).toBe(false);
  });
});
