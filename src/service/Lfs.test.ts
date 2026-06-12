import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { type Asset, type Project } from '../test/setup.js';
import {
  createAsset,
  createLocalRemoteRepository,
  createProject,
  getFileHash,
} from '../test/util.js';

const originalAssetPath = Path.resolve('src/test/data/150x150.png');

describe('Git LFS', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;

  beforeAll(async function () {
    project = await createProject();
    asset = await createAsset(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('writes a .gitattributes that tracks the lfs folder', async function () {
    const gitattributes = await Fs.readFile(
      Path.join(core.util.pathTo.project(project.id), '.gitattributes'),
      'utf8'
    );

    expect(gitattributes).toContain('lfs/** filter=lfs diff=lfs merge=lfs');
  });

  it('stores the Asset binary as an LFS pointer while keeping the working tree real', async function () {
    const history = await core.assets.history({
      projectId: project.id,
      id: asset.id,
    });
    const commitHash = history[0]?.hash;
    if (!commitHash) {
      throw new Error('No commit hash found');
    }

    // What git stores at this commit is the pointer, not the binary.
    const committed = await core.git.getFileContentAtCommit(
      core.util.pathTo.project(project.id),
      core.util.pathTo.asset(project.id, asset.id, asset.extension),
      commitHash
    );
    expect(core.git.lfs.isPointer(committed)).toBe(true);

    // The working tree file is the real, materialized binary.
    expect(await getFileHash(asset.absolutePath)).toEqual(
      await getFileHash(originalAssetPath)
    );
  });

  it('materializes all Asset binaries and history when cloning from a remote with LFS objects', async function () {
    const remote = await createLocalRemoteRepository();
    const remotePath = Path.join(core.util.pathTo.tmp, remote.id);

    // Seed the remote with an LFS object by cloning, adding an Asset and pushing.
    const seeded = await core.projects.clone({ url: remotePath });
    const seededAsset = await createAsset(seeded.id);
    await core.projects.synchronize({ id: seeded.id });
    const seededHistory = await core.assets.history({
      projectId: seeded.id,
      id: seededAsset.id,
    });
    const createCommitHash = seededHistory.at(-1)?.hash;
    await core.projects.delete({ id: seeded.id, force: true });

    // Re-clone fresh. The binary must be materialized without any network.
    const cloned = await core.projects.clone({ url: remotePath });
    const clonedAsset = await core.assets.read({
      projectId: cloned.id,
      id: seededAsset.id,
    });
    expect(await getFileHash(clonedAsset.absolutePath)).toEqual(
      await getFileHash(originalAssetPath)
    );

    // The whole history is present locally, so reading an older commit works offline.
    if (!createCommitHash) {
      throw new Error('No commit hash found');
    }
    const clonedFromHistory = await core.assets.read({
      projectId: cloned.id,
      id: seededAsset.id,
      commitHash: createCommitHash,
    });
    expect(await getFileHash(clonedFromHistory.absolutePath)).toEqual(
      await getFileHash(originalAssetPath)
    );

    await core.projects.delete({ id: cloned.id, force: true });
    await Fs.remove(remotePath);
  });

  it('throws a descriptive PreconditionFailed when the remote does not support LFS', async function () {
    const remote = await createLocalRemoteRepository();
    const remotePath = Path.join(core.util.pathTo.tmp, remote.id);

    const local = await createProject();
    await core.projects.setRemoteOriginUrl({ id: local.id, url: remotePath });
    // A fresh Asset whose object is not on the remote yet, so the LFS push must
    // actually attempt an upload.
    await createAsset(local.id);

    // Point the LFS endpoint at an unreachable address while git transport (the
    // bare repo on disk) stays reachable - this is the "git works, LFS broken" case.
    await gitExec(
      ['config', '--local', 'lfs.url', 'http://127.0.0.1:9/nope'],
      core.util.pathTo.project(local.id)
    );

    await expect(
      core.git.push(core.util.pathTo.project(local.id))
    ).rejects.toMatchObject({ type: 'PreconditionFailed' });

    await local.destroy();
    await Fs.remove(remotePath);
  });
});
