import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import core, { uuid } from '../test/setup.js';
import { projectFileSchema } from '../schema/index.js';
import {
  createAsset,
  createLocalRemoteRepository,
  getFileHash,
  seedRemoteWithRelease,
} from '../test/util.js';
import { CoreError } from '../util/shared.js';
import ElekIoCore from '../index.node.js';

describe('ProjectService provision', function () {
  let readOnlyCore: ElekIoCore;
  let readOnlyDataDir: string;
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let secondReleaseVersion: string;

  beforeAll(async function () {
    seed = await seedRemoteWithRelease();
    readOnlyDataDir = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    readOnlyCore = new ElekIoCore({
      isReadOnly: true,
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
    const { project, source, warning } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(source).toEqual('remote');
    expect(warning).toBeNull();
    expect(project.id).toEqual(seed.projectId);
    expect(project.version).toEqual(seed.releaseVersion);
    expect(
      await Fs.pathExists(
        readOnlyCore.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);
    // The production channel checks out the latest Release tag,
    // detaching HEAD
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('');

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

  it('should refresh a provisioned copy to the newest Release', async function () {
    // Publish a second Release through a writable Core
    const project = await core.projects.clone({ url: seed.remotePath });
    await createAsset(project.id);
    const secondRelease = await core.releases.create({
      projectId: project.id,
    });
    secondReleaseVersion = secondRelease.version;
    await core.projects.delete({ id: project.id, force: true });

    const { project: provisioned, source } =
      await readOnlyCore.projects.provision({
        id: seed.projectId,
        url: seed.remotePath,
      });

    expect(source).toEqual('remote');
    expect(provisioned.version).toEqual(secondReleaseVersion);
  }, 30000);

  it('should discard local modifications on refresh', async function () {
    const projectFilePath = readOnlyCore.util.pathTo.projectFile(
      seed.projectId
    );
    await Fs.writeFile(projectFilePath, 'not json anymore');

    const { project: provisioned } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(provisioned.version).toEqual(secondReleaseVersion);
  }, 30000);

  it('should provision the draft channel when asked', async function () {
    // The remote work branch was synchronized before the second
    // Release, so it still holds the first released version
    const { project: provisioned } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
      ref: 'draft',
    });

    expect(provisioned.version).toEqual(seed.releaseVersion);
    // The draft channel follows the work branch
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('work');
  }, 30000);

  it('should provision the newest preview on the preview channel', async function () {
    // The only preview so far is the one from the seed
    const { project: provisioned } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
      ref: 'preview',
    });
    expect(provisioned.version).toEqual(seed.previewVersion);

    // A newer preview supersedes it, while production stays put
    const project = await core.projects.clone({ url: seed.remotePath });
    await createAsset(project.id);
    const newerPreview = await core.releases.createPreview({
      projectId: project.id,
    });
    await core.projects.delete({ id: project.id, force: true });

    const { project: refreshed } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
      ref: 'preview',
    });
    expect(refreshed.version).toEqual(newerPreview.version);

    const { project: production } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
      ref: 'production',
    });
    expect(production.version).toEqual(secondReleaseVersion);
  }, 60000);

  it('should provision a pinned Release version with a detached HEAD', async function () {
    const { project: provisioned } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
      ref: seed.releaseVersion,
    });

    expect(provisioned.version).toEqual(seed.releaseVersion);
    // A pinned version checks out the Release tag, detaching HEAD
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('');
  }, 30000);

  it('should provision a preview version', async function () {
    const { project: provisioned } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
      ref: seed.previewVersion,
    });

    expect(provisioned.version).toEqual(seed.previewVersion);
  }, 30000);

  it('should throw NotFound for an unknown version and list the available ones', async function () {
    let error: unknown = null;
    try {
      await readOnlyCore.projects.provision({
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
      await readOnlyCore.projects.provision({
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
    const { project: provisioned } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
    });

    expect(provisioned.version).toEqual(seed.previewVersion);
    expect(
      await readOnlyCore.projects.branches.current({ id: seed.projectId })
    ).toEqual('');
    expect(await Fs.pathExists(markerPath)).toBe(false);

    // Restore the marker for the following tests
    await Fs.writeFile(markerPath, 'Provisioned by @elek-io/core\n');
  }, 30000);

  it('should throw PreconditionFailed when the remote holds no Release', async function () {
    // A remote that never received a Release has no release tags
    const remoteProject = await createLocalRemoteRepository();
    const remotePath = Path.join(core.util.pathTo.tmp, remoteProject.id);

    let error: unknown = null;
    try {
      await readOnlyCore.projects.provision({
        id: remoteProject.id,
        url: remotePath,
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
      await Fs.pathExists(readOnlyCore.util.pathTo.project(remoteProject.id))
    ).toBe(false);
  }, 60000);

  it('should reject a refresh from a remote holding a different Project', async function () {
    const otherSeed = await seedRemoteWithRelease();

    let error: unknown = null;
    try {
      await readOnlyCore.projects.provision({
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
    const { project: healed } = await readOnlyCore.projects.provision({
      id: seed.projectId,
      url: seed.remotePath,
    });
    expect(healed.id).toEqual(seed.projectId);
  }, 60000);

  it('should never write the token into the clone', async function () {
    vi.stubEnv('ELEK_IO_REMOTE_ACCESS_TOKEN', 'secret-token-123');
    const tokenDataDir = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    const tokenCore = new ElekIoCore({
      isReadOnly: true,
      dataDir: tokenDataDir,
    });

    try {
      await tokenCore.projects.provision({
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
    await readOnlyCore.projects.provision({
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
      await readOnlyCore.projects.provision({
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
      await readOnlyCore.projects.provision({
        id: skewSeed.projectId,
        url: skewSeed.remotePath,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('VersionSkew');
    expect(
      await Fs.pathExists(readOnlyCore.util.pathTo.project(skewSeed.projectId))
    ).toBe(false);
  }, 60000);

  // Not covered here: the Unauthorized rethrow. Local remotes skip git's
  // credential machinery entirely, so an auth failure cannot be produced
  // against them, see the credentials limitation in contributing/testing.md.
  describe('offline', function () {
    let offlineSeed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
    let hiddenRemotePath: string;

    beforeAll(async function () {
      offlineSeed = await seedRemoteWithRelease();
      hiddenRemotePath = `${offlineSeed.remotePath}-hidden`;
    }, 60000);

    /**
     * Runs the given function with the remote moved away, so every git
     * command against it fails like an unreachable remote does
     */
    async function whileUnreachable<T>(fn: () => Promise<T>): Promise<T> {
      await Fs.move(offlineSeed.remotePath, hiddenRemotePath);
      try {
        return await fn();
      } finally {
        await Fs.move(hiddenRemotePath, offlineSeed.remotePath);
      }
    }

    it('should build with the copy on disk when the remote is unreachable', async function () {
      const online = await readOnlyCore.projects.provision({
        id: offlineSeed.projectId,
        url: offlineSeed.remotePath,
      });
      expect(online.source).toEqual('remote');

      const { project, source, warning } = await whileUnreachable(() =>
        readOnlyCore.projects.provision({
          id: offlineSeed.projectId,
          url: offlineSeed.remotePath,
        })
      );

      expect(source).toEqual('local-fallback');
      expect(project.version).toEqual(offlineSeed.releaseVersion);
      expect(warning).toContain(offlineSeed.projectId);
      expect(warning).toContain('production');
      expect(warning).toContain(offlineSeed.releaseVersion);

      // The copy is still readable
      const { total } = await readOnlyCore.collections.list({
        projectId: offlineSeed.projectId,
        limit: 0,
      });
      expect(total).toEqual(1);
    }, 60000);

    it('should reject when the remote is unreachable and no copy exists', async function () {
      let error: unknown = null;
      try {
        await whileUnreachable(() =>
          readOnlyCore.projects.provision({
            id: uuid(),
            url: offlineSeed.remotePath,
          })
        );
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(CoreError);
    }, 60000);

    it('should skip the network for a pinned version that is already checked out', async function () {
      // Puts the copy on the pinned Release tag
      const online = await readOnlyCore.projects.provision({
        id: offlineSeed.projectId,
        url: offlineSeed.remotePath,
        ref: offlineSeed.releaseVersion,
      });
      expect(online.warning).toBeNull();

      const { project, source, warning } = await whileUnreachable(() =>
        readOnlyCore.projects.provision({
          id: offlineSeed.projectId,
          url: offlineSeed.remotePath,
          ref: offlineSeed.releaseVersion,
        })
      );

      expect(source).toEqual('local-pin');
      expect(warning).toBeNull();
      expect(project.version).toEqual(offlineSeed.releaseVersion);
    }, 60000);

    it('should reject a pinned version the copy on disk does not hold', async function () {
      let error: unknown = null;
      try {
        await whileUnreachable(() =>
          readOnlyCore.projects.provision({
            id: offlineSeed.projectId,
            url: offlineSeed.remotePath,
            ref: offlineSeed.previewVersion,
          })
        );
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(CoreError);
    }, 60000);

    it('should build with the copy on disk on the draft channel too', async function () {
      const online = await readOnlyCore.projects.provision({
        id: offlineSeed.projectId,
        url: offlineSeed.remotePath,
        ref: 'draft',
      });
      expect(online.source).toEqual('remote');

      const { source, warning } = await whileUnreachable(() =>
        readOnlyCore.projects.provision({
          id: offlineSeed.projectId,
          url: offlineSeed.remotePath,
          ref: 'draft',
        })
      );

      expect(source).toEqual('local-fallback');
      expect(warning).toContain('draft');
    }, 60000);
  });
});
