import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import core from '../test/setup.js';
import {
  createCollection,
  createLocalRemoteRepository,
  execGit,
  expectCoreError,
} from '../test/util.js';

/**
 * A git host points `HEAD` at `main`, so a plain `git clone` lands there.
 * A working copy is for editing, which happens on `draft`.
 */
describe('ProjectService clone', function () {
  /** A fixture remote, removed again once the test finishes. */
  async function remote(): Promise<{ id: string; path: string }> {
    const remoteProject = await createLocalRemoteRepository();
    const path = Path.join(core.util.pathTo.tmp, remoteProject.id);
    onTestFinished(async () => {
      await Fs.remove(path);
    });
    return { id: remoteProject.id, path };
  }

  /** Clones and registers the removal of the working copy. */
  async function clone(url: string) {
    const project = await core.projects.clone({ url });
    onTestFinished(async () => {
      await core.projects.delete({ id: project.id, force: true });
    });
    return { project, path: core.util.pathTo.project(project.id) };
  }

  it('should land on draft, tracking the remote draft', async function () {
    const { path: remotePath } = await remote();
    expect(await execGit(remotePath, ['symbolic-ref', 'HEAD'])).toEqual(
      'refs/heads/main'
    );

    const { project, path } = await clone(remotePath);

    expect(await core.projects.branches.current({ id: project.id })).toEqual(
      'draft'
    );
    expect(
      await execGit(path, ['rev-parse', '--abbrev-ref', 'draft@{upstream}'])
    ).toEqual('origin/draft');

    // Edits commit to draft, so synchronize publishes draft and leaves the
    // released main on the remote alone
    const remoteMainBefore = await core.git.revParse(remotePath, 'main');
    await createCollection(project.id);
    await core.projects.synchronize({ id: project.id });

    expect(await core.git.revParse(remotePath, 'draft')).toEqual(
      await core.git.revParse(path, 'draft')
    );
    expect(await core.git.revParse(remotePath, 'main')).toEqual(
      remoteMainBefore
    );
  }, 30000);

  /** Clones a remote that holds no valid Project and expects nothing left. */
  async function expectRefused(id: string, remotePath: string) {
    const tmpBefore = await Fs.readdir(core.util.pathTo.tmp);

    await expectCoreError(
      core.projects.clone({ url: remotePath }),
      'PreconditionFailed',
      'The remote has no "draft" branch'
    );

    expect(await Fs.pathExists(core.util.pathTo.project(id))).toBe(false);
    expect(await Fs.readdir(core.util.pathTo.tmp)).toEqual(tmpBefore);
  }

  it('should refuse a remote without draft and leave nothing behind', async function () {
    const { id, path: remotePath } = await remote();
    await execGit(remotePath, ['branch', '--delete', '--force', 'draft']);

    await expectRefused(id, remotePath);
  });

  it('should refuse a remote with neither draft nor main the same way', async function () {
    const { id, path: remotePath } = await remote();
    await execGit(remotePath, ['branch', '--move', 'main', 'production']);
    await execGit(remotePath, ['branch', '--move', 'draft', 'work']);
    await execGit(remotePath, [
      'symbolic-ref',
      'HEAD',
      'refs/heads/production',
    ]);

    await expectRefused(id, remotePath);
  });
});
