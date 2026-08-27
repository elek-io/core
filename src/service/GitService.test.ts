import Fs from 'fs-extra';
import Path from 'node:path';
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

  // Reading a blob must not let git interpret `<commit>:<path>` as a filename.
  // git's revision commands stat that argument against the working directory to
  // tell revisions and filenames apart, which made long Project paths fail on
  // Windows once the stat exceeded the 260 char limit. Reading through
  // `git cat-file` avoids the stat entirely.
  // Skipped on Windows, where a colon cannot be part of a filename, so the
  // ambiguity this proves cannot be set up there.
  it.skipIf(process.platform === 'win32')(
    'should be able to get the content of a file at a commit, even if the working tree holds a file named like the argument',
    async function () {
      const commitHash = (await core.git.log(projectPath, { limit: 1 }))[0]
        ?.hash;
      if (!commitHash) {
        throw new Error('No commit hash found');
      }
      const decoyPath = Path.join(projectPath, `${commitHash}:project.json`);
      await Fs.writeFile(decoyPath, 'decoy');

      const content = await core.git.getFileContentAtCommit(
        projectPath,
        core.util.pathTo.projectFile(project.id),
        commitHash
      );

      const projectFile: unknown = JSON.parse(content);
      expect(projectFile).toMatchObject({ id: project.id });

      await Fs.remove(decoyPath);
    }
  );

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
    await expect(
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

  it('should reject pushing all branches and named refs at once', async function () {
    // Both reach git as arguments that contradict each other, so the
    // caller is told rather than left with whatever git makes of it
    await expect(
      core.git.push(projectPath, { all: true, refs: ['work'] })
    ).rejects.toThrow(/mutually exclusive/);
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

  it('should report the tag on a tagged tip in the log', async function () {
    // A tagged tip is decorated `HEAD -> master, tag: <uuid>`, which is
    // exactly the commit a Release just made, so the whole point of
    // resolving a tag at all is the one case that has to work
    const tag = await core.git.tags.create({
      path: projectPath,
      message: { type: 'release', version: '1.0.0' },
    });

    const commits = await core.git.log(projectPath, { limit: 1 });

    expect(commits[0]?.tag?.id).toEqual(tag.id);

    await core.git.tags.delete({ path: projectPath, id: tag.id });
  });
});

describe('GitService.status', function () {
  let statusProject: Project & { destroy: () => Promise<void> };
  let statusProjectPath = '';
  // A space in the name, because porcelain v2 puts the path last and a
  // parse splitting the line on spaces truncates it at the first one
  const trackedName = 'a tracked file.txt';
  let trackedPath = '';

  beforeAll(async function () {
    statusProject = await createProject('GitService Status Test');
    statusProjectPath = core.util.pathTo.project(statusProject.id);
    trackedPath = Path.join(statusProjectPath, trackedName);

    await Fs.writeFile(trackedPath, 'first');
    await core.git.add(statusProjectPath, [trackedPath]);
    await core.git.commit(statusProjectPath, {
      method: 'update',
      reference: { objectType: 'project', id: statusProject.id },
    });
  });

  afterAll(async function () {
    await statusProject.destroy();
  });

  it('reports a committed tree as clean', async function () {
    const status = await core.git.status(statusProjectPath);

    expect(status.isClean).toBe(true);
    expect(status.files).toEqual([]);
  });

  it('names an untracked file', async function () {
    const untrackedPath = Path.join(statusProjectPath, 'an untracked one.txt');
    await Fs.writeFile(untrackedPath, 'x');

    const status = await core.git.status(statusProjectPath);

    expect(status.isClean).toBe(false);
    expect(status.files).toEqual([
      { path: 'an untracked one.txt', status: 'untracked', isStaged: false },
    ]);

    await Fs.remove(untrackedPath);
  });

  it('names a file modified in the working tree', async function () {
    await Fs.writeFile(trackedPath, 'second');

    const status = await core.git.status(statusProjectPath);

    expect(status.files).toEqual([
      { path: trackedName, status: 'modified', isStaged: false },
    ]);

    await Fs.writeFile(trackedPath, 'first');
  });

  it('says when the same change is staged', async function () {
    await Fs.writeFile(trackedPath, 'second');
    await core.git.add(statusProjectPath, [trackedPath]);

    const status = await core.git.status(statusProjectPath);

    expect(status.files).toEqual([
      { path: trackedName, status: 'modified', isStaged: true },
    ]);

    await Fs.writeFile(trackedPath, 'first');
    await core.git.add(statusProjectPath, [trackedPath]);
  });

  it('names a deleted file', async function () {
    await Fs.remove(trackedPath);

    const status = await core.git.status(statusProjectPath);

    expect(status.files).toEqual([
      { path: trackedName, status: 'deleted', isStaged: false },
    ]);

    await Fs.writeFile(trackedPath, 'first');
  });

  it('names a renamed file by its new path', async function () {
    const renamedName = 'a renamed file.txt';
    const renamedPath = Path.join(statusProjectPath, renamedName);
    await Fs.move(trackedPath, renamedPath);
    await core.git.add(statusProjectPath, [trackedPath, renamedPath]);

    const status = await core.git.status(statusProjectPath);

    // A rename entry carries new and old path in one field, and only the
    // new one describes what is on disk now
    expect(status.files).toEqual([
      { path: renamedName, status: 'renamed', isStaged: true },
    ]);

    await Fs.move(renamedPath, trackedPath);
    await core.git.add(statusProjectPath, [trackedPath, renamedPath]);
  });

  it('lists every dirty file at once', async function () {
    const untrackedPath = Path.join(statusProjectPath, 'another one.txt');
    await Fs.writeFile(untrackedPath, 'x');
    await Fs.writeFile(trackedPath, 'second');

    const status = await core.git.status(statusProjectPath);

    expect(status.isClean).toBe(false);
    expect(status.files).toHaveLength(2);
    expect(status.files.map((file) => file.status).toSorted()).toEqual([
      'modified',
      'untracked',
    ]);

    await Fs.remove(untrackedPath);
    await Fs.writeFile(trackedPath, 'first');
  });
});

describe('GitService.refNameToTagName', function () {
  it.each([
    ['tag: 550e8400-e29b-41d4-a716-446655440000', 'a bare decoration'],
    [
      'HEAD -> master, tag: 550e8400-e29b-41d4-a716-446655440000',
      'the decoration of a tagged tip',
    ],
    [
      'tag: 550e8400-e29b-41d4-a716-446655440000, origin/master',
      'a tag next to a remote branch',
    ],
  ])('reads the tag out of %j, %s', function (refName) {
    expect(core.git.refNameToTagName(refName)).toEqual(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it.each([
    ['', 'no decoration at all'],
    ['HEAD -> master', 'a decoration carrying no tag'],
    ['tag: v1.0.0', 'a tag not named with a UUID'],
    ['HEAD -> master, origin/master', 'branches only'],
  ])('returns null for %j, %s', function (refName) {
    expect(core.git.refNameToTagName(refName)).toBeNull();
  });
});
