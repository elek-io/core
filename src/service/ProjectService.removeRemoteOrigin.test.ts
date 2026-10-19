import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import core from '../test/setup.js';
import {
  createLocalRemoteRepository,
  createProject,
  ensureCleanGitStatus,
  execGit,
  expectCoreError,
} from '../test/util.js';

/**
 * Removing `origin` turns a Project back into one that exists only on this
 * computer, which is what deleting it from elek.io Cloud leaves behind. What
 * is asserted is git's own state, since `remoteOriginUrl` alone would not
 * show a remote-tracking branch or an upstream left over.
 */

/** A clone of a fresh local remote, synchronized, and the remote's path */
async function clonedProject(): Promise<{ id: string; remotePath: string }> {
  const remote = await createLocalRemoteRepository();
  const remotePath = Path.join(core.util.pathTo.tmp, remote.id);
  const project = await core.projects.clone({ url: remotePath });
  onTestFinished(async function () {
    await core.projects.delete({ id: project.id, force: true });
    await Fs.remove(remotePath);
  });
  return { id: project.id, remotePath };
}

describe('removing the remote origin', function () {
  it('leaves the Project with no remote, no remote-tracking branch and no upstream', async function ({
    task,
  }) {
    const { id, remotePath } = await clonedProject();
    const projectPath = core.util.pathTo.project(id);
    const historyBefore = await core.projects.history({ id });

    await core.projects.removeRemoteOrigin({ id });

    expect((await core.projects.read({ id })).remoteOriginUrl).toBeNull();
    expect(await execGit(projectPath, ['remote'])).toBe('');
    expect(await core.projects.branches.list({ id })).toMatchObject({
      remote: [],
    });
    const upstream = await gitExec(
      ['config', '--get', 'branch.draft.remote'],
      projectPath
    );
    expect(upstream.exitCode).toBe(1);
    expect(await core.projects.history({ id })).toEqual(historyBefore);
    // The remote is left as it was
    expect(await core.git.lsRemote(remotePath)).toContain('refs/heads/draft');
    await ensureCleanGitStatus(task, id);
  });

  it('makes the Project one that exists only here again', async function () {
    const { id } = await clonedProject();

    await core.projects.removeRemoteOrigin({ id });

    await expectCoreError(
      core.projects.getChanges({ id }),
      'PreconditionFailed'
    );
    await expectCoreError(core.projects.delete({ id }), 'PreconditionFailed');
  });

  it('can be called again, and on a Project that never had a remote', async function () {
    const { id } = await clonedProject();
    const local = await createProject();
    onTestFinished(local.destroy);

    await core.projects.removeRemoteOrigin({ id });
    await core.projects.removeRemoteOrigin({ id });
    await core.projects.removeRemoteOrigin({ id: local.id });

    expect((await core.projects.read({ id })).remoteOriginUrl).toBeNull();
    expect(
      (await core.projects.read({ id: local.id })).remoteOriginUrl
    ).toBeNull();
  });

  it('lets a new remote be set afterwards', async function () {
    const { id, remotePath } = await clonedProject();

    await core.projects.removeRemoteOrigin({ id });
    await core.projects.setRemoteOriginUrl({ id, url: remotePath });

    expect((await core.projects.read({ id })).remoteOriginUrl).toBe(remotePath);
    expect(await core.projects.getChanges({ id })).toMatchObject({
      ahead: [],
      behind: [],
    });
  });
});
