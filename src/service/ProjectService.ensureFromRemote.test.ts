import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import core, { uuid } from '../test/setup.js';
import { projectFileSchema } from '../schema/index.js';
import {
  createAsset,
  getFileHash,
  seedRemoteWithRelease,
} from '../test/util.js';
import { CoreError } from '../util/shared.js';
import ElekIoCore from '../index.node.js';

describe('ProjectService ensureFromRemote', function () {
  let readOnlyCore: ElekIoCore;
  let readOnlyDataDir: string;
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let secondReleaseVersion: string;

  beforeAll(async function () {
    seed = await seedRemoteWithRelease();
    readOnlyDataDir = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    readOnlyCore = new ElekIoCore({
      readOnly: true,
      dataDir: readOnlyDataDir,
    });
  }, 60000);

  afterAll(async function () {
    await readOnlyCore.dispose();
    await Fs.remove(readOnlyDataDir);
  });

  afterEach(function () {
    vi.unstubAllEnvs();
  });

  it('should provision a missing Project from the remote at production', async function () {
    const project = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(project.id).toEqual(seed.projectId);
    expect(project.version).toEqual(seed.releaseVersion);
    expect(
      await Fs.pathExists(
        readOnlyCore.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('production');

    const { total } = await readOnlyCore.collections.list({
      projectId: seed.projectId,
      limit: 0,
    });
    expect(total).toEqual(1);

    // The Asset binary is materialized, not left as an LFS pointer
    const assetPath = Path.join(
      readOnlyCore.util.pathTo.lfs(seed.projectId),
      `${seed.assetId}.${seed.assetExtension}`
    );
    expect(await getFileHash(assetPath)).toEqual(
      await getFileHash(Path.resolve('src/test/data/150x150.png'))
    );
  }, 30000);

  it('should refresh a provisioned Project to the newest Release', async function () {
    // Publish a second Release through a writable Core
    const project = await core.projects.clone({ url: seed.remotePath });
    await createAsset(project.id);
    const secondRelease = await core.releases.create({
      projectId: project.id,
    });
    secondReleaseVersion = secondRelease.version;
    await core.projects.delete({ id: project.id, force: true });

    const ensured = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(ensured.version).toEqual(secondReleaseVersion);
  }, 30000);

  it('should discard local modifications on refresh', async function () {
    const projectFilePath = readOnlyCore.util.pathTo.projectFile(
      seed.projectId
    );
    await Fs.writeFile(projectFilePath, 'not json anymore');

    const ensured = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(ensured.version).toEqual(secondReleaseVersion);
  }, 30000);

  it('should provision the work branch when asked', async function () {
    // The remote work branch was synchronized before the second
    // Release, so it still holds the first released version
    const ensured = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
      ref: 'work',
    });

    expect(ensured.version).toEqual(seed.releaseVersion);
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('work');
  }, 30000);

  it('should provision a pinned Release version with a detached HEAD', async function () {
    const ensured = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
      ref: seed.releaseVersion,
    });

    expect(ensured.version).toEqual(seed.releaseVersion);
    // A pinned version checks out the Release tag, detaching HEAD
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('');
  }, 30000);

  it('should provision a preview version', async function () {
    const ensured = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
      ref: seed.previewVersion,
    });

    expect(ensured.version).toEqual(seed.previewVersion);
  }, 30000);

  it('should throw NotFound for an unknown version and list the available ones', async function () {
    let error: unknown = null;
    try {
      await readOnlyCore.projects.ensureFromRemote({
        id: seed.projectId,
        url: seed.remotePath,
        ref: '9.9.9',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('NotFound');
    expect(error instanceof CoreError && error.message).toContain(
      seed.releaseVersion
    );
  }, 30000);

  it('should throw BadRequest for an invalid ref', async function () {
    let error: unknown = null;
    try {
      await readOnlyCore.projects.ensureFromRemote({
        id: seed.projectId,
        url: seed.remotePath,
        ref: 'not a valid ref',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('BadRequest');
  });

  it('should leave a copy without the marker untouched', async function () {
    const markerPath = readOnlyCore.util.pathTo.projectProvisionedMarker(
      seed.projectId
    );
    await Fs.remove(markerPath);

    // The copy is detached at the preview version from the previous
    // test. Without the marker it belongs to another application, so
    // asking for production must not touch it
    const ensured = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(ensured.version).toEqual(seed.previewVersion);
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('');
    expect(await Fs.pathExists(markerPath)).toBe(false);

    // Restore the marker for the following tests
    await Fs.writeFile(markerPath, 'Provisioned by @elek-io/core\n');
  }, 30000);

  it('should throw PreconditionFailed when the remote has no production branch', async function () {
    const remoteProject = await seedRemoteWithRelease();
    // Simulate a remote that never received a Release
    await core.git.branches.delete(remoteProject.remotePath, 'production');

    let error: unknown = null;
    try {
      await readOnlyCore.projects.ensureFromRemote({
        id: remoteProject.projectId,
        url: remoteProject.remotePath,
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual(
      'PreconditionFailed'
    );
    expect(error instanceof CoreError && error.message).toContain('Release');
    // A failed fresh provision leaves nothing behind
    expect(
      await Fs.pathExists(
        readOnlyCore.util.pathTo.project(remoteProject.projectId)
      )
    ).toBe(false);
  }, 60000);

  it('should reject a refresh from a remote holding a different Project', async function () {
    const otherSeed = await seedRemoteWithRelease();

    let error: unknown = null;
    try {
      await readOnlyCore.projects.ensureFromRemote({
        id: seed.projectId,
        url: otherSeed.remotePath,
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('BadRequest');
    expect(error instanceof CoreError && error.message).toContain(
      otherSeed.projectId
    );
    // The copy keeps pointing at the remote it was provisioned from
    expect(
      await readOnlyCore.git.remotes.getOriginUrl(
        readOnlyCore.util.pathTo.project(seed.projectId)
      )
    ).toEqual(seed.remotePath);

    // A corrected rerun heals the copy
    const healed = await readOnlyCore.projects.ensureFromRemote({
      id: seed.projectId,
      url: seed.remotePath,
    });
    expect(healed.id).toEqual(seed.projectId);
  }, 60000);

  it('should never write the token into the clone', async function () {
    vi.stubEnv('ELEK_IO_TOKEN', 'secret-token-123');
    const tokenDataDir = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    const tokenCore = new ElekIoCore({
      readOnly: true,
      dataDir: tokenDataDir,
    });

    try {
      await tokenCore.projects.ensureFromRemote({
        id: seed.projectId,
        url: seed.remotePath,
      });

      const gitConfig = await Fs.readFile(
        Path.join(
          tokenCore.util.pathTo.project(seed.projectId),
          '.git',
          'config'
        ),
        'utf-8'
      );
      expect(gitConfig).not.toContain('secret-token-123');
      expect(
        await tokenCore.git.remotes.getOriginUrl(
          tokenCore.util.pathTo.project(seed.projectId)
        )
      ).toEqual(seed.remotePath);
    } finally {
      await tokenCore.dispose();
      await Fs.remove(tokenDataDir);
    }
  }, 30000);

  it('should throw VersionSkew when the remote Project is newer than Core', async function () {
    // An own remote, so the corrupted state cannot leak into other tests
    const skewSeed = await seedRemoteWithRelease();
    await readOnlyCore.projects.ensureFromRemote({
      id: skewSeed.projectId,
      url: skewSeed.remotePath,
    });

    // Publish a Release whose project.json claims a newer Core
    const project = await core.projects.clone({ url: skewSeed.remotePath });
    const readProject = await core.projects.read({ id: project.id });
    readProject.coreVersion = '999.0.0';
    await Fs.writeFile(
      core.util.pathTo.projectFile(project.id),
      JSON.stringify(projectFileSchema.parse(readProject))
    );
    await core.git.add(core.util.pathTo.project(project.id), [
      core.util.pathTo.projectFile(project.id),
    ]);
    await core.git.commit(core.util.pathTo.project(project.id), {
      method: 'update',
      reference: { objectType: 'project', id: project.id },
    });
    // The raw write above bypassed the file cache, a hard reset onto
    // HEAD changes nothing on disk but drops the stale cache entry
    await core.git.reset(core.util.pathTo.project(project.id), 'hard', 'HEAD');
    await core.releases.create({ projectId: project.id });
    await core.projects.delete({ id: project.id, force: true });

    let error: unknown = null;
    try {
      await readOnlyCore.projects.ensureFromRemote({
        id: skewSeed.projectId,
        url: skewSeed.remotePath,
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('VersionSkew');

    // A fresh provision hits the same skew and leaves nothing behind
    await Fs.remove(readOnlyCore.util.pathTo.project(skewSeed.projectId));
    error = null;
    try {
      await readOnlyCore.projects.ensureFromRemote({
        id: skewSeed.projectId,
        url: skewSeed.remotePath,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('VersionSkew');
    expect(
      await Fs.pathExists(
        readOnlyCore.util.pathTo.project(skewSeed.projectId)
      )
    ).toBe(false);
  }, 60000);
});
