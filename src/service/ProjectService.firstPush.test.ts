import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import type ElekIoCore from '../index.node.js';
import core, { testUserProps, uuid } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createLocalRemoteRepository,
  createProject,
  createTmpCore,
  execGit,
  expectCoreError,
  getFileHash,
  tmpDirPath,
} from '../test/util.js';

const originalAssetPath = Path.resolve('src/test/data/150x150.png');

/**
 * A Project gets a remote through `setRemoteOriginUrl()`, usually a new and
 * empty repository at a git host. The first `synchronize()` pushes `main`,
 * `draft` and the Release tags together, and refuses a remote that holds
 * anything other than this Project.
 */
describe('ProjectService first push', function () {
  /**
   * An empty bare remote, removed again once the test finishes. Its `HEAD`
   * names an unborn `main`, as the one of a new repository at a git host.
   */
  async function emptyRemote(): Promise<string> {
    const path = Path.join(core.util.pathTo.tmp, uuid());
    await Fs.ensureDir(path);
    onTestFinished(async () => {
      await Fs.remove(path);
    });
    await execGit(path, ['init', '--bare', '--initial-branch=main']);
    return path;
  }

  /**
   * A remote as a git host creates it when asked to add a README, whose
   * `main` holds a history of its own.
   */
  async function hostRepositoryWithReadme(): Promise<string> {
    const remotePath = await emptyRemote();
    const seedPath = tmpDirPath();
    await Fs.ensureDir(seedPath);
    await execGit(seedPath, ['init', '--initial-branch=main']);
    await Fs.writeFile(Path.join(seedPath, 'README.md'), '# Content\n');
    await execGit(seedPath, ['add', 'README.md']);
    await execGit(seedPath, [
      '-c',
      'user.name=Host',
      '-c',
      'user.email=host@example.com',
      'commit',
      '--message',
      'Initial commit',
    ]);
    await execGit(seedPath, ['push', remotePath, 'main']);
    return remotePath;
  }

  /** The remote of another Project, holding its `main` and `draft`. */
  async function anotherProjectsRemote(): Promise<string> {
    const remoteProject = await createLocalRemoteRepository();
    const path = Path.join(core.util.pathTo.tmp, remoteProject.id);
    onTestFinished(async () => {
      await Fs.remove(path);
    });
    return path;
  }

  /** A new Project on the shared Core, removed again once the test finishes. */
  async function newProject() {
    const project = await createProject();
    onTestFinished(project.destroy);
    return { project, path: core.util.pathTo.project(project.id) };
  }

  /** A Collection with a slug of its own, so it never clashes. */
  async function addCollection(
    on: ElekIoCore,
    projectId: string,
    slug: string
  ) {
    return on.collections.create({
      projectId,
      icon: 'home',
      name: {
        singular: { en: slug, de: slug },
        plural: { en: `${slug}s`, de: `${slug}s` },
      },
      description: { en: 'A change', de: 'A change' },
      slug: { singular: slug, plural: `${slug}s` },
      fieldDefinitions: [],
    });
  }

  async function connect(projectId: string, url: string) {
    await core.projects.setRemoteOriginUrl({ id: projectId, url });
  }

  /**
   * A clone on a Core of its own, because one data directory holds a
   * Project id only once.
   */
  async function otherWorkingCopy(url: string) {
    const { core: other } = createTmpCore();
    await other.user.set(testUserProps);
    const project = await other.projects.clone({ url });
    return { core: other, project };
  }

  /** Every ref of a repository with the object it points at. */
  function refsOf(repositoryPath: string, ...patterns: string[]) {
    return execGit(repositoryPath, [
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      ...patterns,
    ]);
  }

  function upstreamOf(projectPath: string, branch: string) {
    return execGit(projectPath, [
      'rev-parse',
      '--abbrev-ref',
      `${branch}@{upstream}`,
    ]);
  }

  it('should push main and draft with their Assets to an empty remote, leaving its HEAD on main', async function () {
    const remotePath = await emptyRemote();
    const { project, path } = await newProject();
    await createCollection(project.id);
    const asset = await createAsset(project.id);
    await connect(project.id, remotePath);

    await core.projects.synchronize({ id: project.id });

    expect(await refsOf(remotePath, 'refs/heads')).toEqual(
      await refsOf(path, 'refs/heads')
    );
    expect(await execGit(remotePath, ['symbolic-ref', 'HEAD'])).toEqual(
      'refs/heads/main'
    );
    expect(await upstreamOf(path, 'main')).toEqual('origin/main');
    expect(await upstreamOf(path, 'draft')).toEqual('origin/draft');

    // Only the LFS upload of the first push can have delivered the bytes
    const other = await otherWorkingCopy(remotePath);
    expect(
      await other.core.projects.branches.current({ id: other.project.id })
    ).toEqual('draft');
    const clonedAsset = await other.core.assets.read({
      projectId: other.project.id,
      id: asset.id,
    });
    expect(
      core.git.lfs.isPointer(
        await Fs.readFile(clonedAsset.absolutePath, 'utf8')
      )
    ).toBe(false);
    expect(await getFileHash(clonedAsset.absolutePath)).toEqual(
      await getFileHash(originalAssetPath)
    );
  }, 60000);

  it('should push the Release and preview tags of a Project released before it had a remote, but no upgrade tag', async function () {
    const remotePath = await emptyRemote();
    const { project, path } = await newProject();
    await createCollection(project.id);
    const preview = await core.releases.createPreview({
      projectId: project.id,
    });
    const release = await core.releases.create({ projectId: project.id });
    const upgradeTag = await core.git.tags.create({
      path,
      message: { type: 'upgrade', coreVersion: '0.25.0' },
    });
    await connect(project.id, remotePath);

    await core.projects.synchronize({ id: project.id });

    const releases = await core.releases.list({ projectId: project.id });
    const remoteTags = await core.git.tags.list({ path: remotePath });
    expect(remoteTags.list.map((tag) => tag.id).toSorted()).toEqual(
      releases.list.map((item) => item.tagId).toSorted()
    );
    expect(remoteTags.list.map((tag) => tag.id)).not.toContain(upgradeTag.id);

    // A build reads the channels from the tags the remote advertises
    const { core: readOnlyCore } = createTmpCore({ isReadOnly: true });
    const released = await readOnlyCore.projects.provision({
      id: project.id,
      url: remotePath,
      ref: 'release',
    });
    expect(released.project.version).toEqual(release.version);
    const previewed = await readOnlyCore.projects.provision({
      id: project.id,
      url: remotePath,
      ref: 'preview',
    });
    expect(previewed.project.version).toEqual(preview.version);
  }, 60000);

  it('should synchronize the next change the usual way after the first push', async function () {
    const remotePath = await emptyRemote();
    const { project, path } = await newProject();
    await connect(project.id, remotePath);
    await core.projects.synchronize({ id: project.id });
    expect(await core.projects.getChanges({ id: project.id })).toEqual({
      behind: [],
      ahead: [],
    });
    const remoteMain = await core.git.revParse(remotePath, 'main');

    // Another working copy publishes first, so this one has to integrate it
    const other = await otherWorkingCopy(remotePath);
    await addCollection(other.core, other.project.id, 'other');
    await other.core.projects.synchronize({ id: other.project.id });
    await addCollection(core, project.id, 'local');

    await core.projects.synchronize({ id: project.id });

    expect(await core.git.revParse(remotePath, 'draft')).toEqual(
      await core.git.revParse(path, 'draft')
    );
    expect(await core.git.revParse(remotePath, 'main')).toEqual(remoteMain);
    const collections = await core.collections.list({ projectId: project.id });
    expect(collections.list.map((item) => item.slug.plural).toSorted()).toEqual(
      ['locals', 'others']
    );
  }, 60000);

  it('should report every local commit as not synchronized before the first push', async function () {
    const remotePath = await emptyRemote();
    const { project, path } = await newProject();
    await createCollection(project.id);
    await connect(project.id, remotePath);

    const { ahead, behind } = await core.projects.getChanges({
      id: project.id,
    });

    expect(behind).toEqual([]);
    expect(ahead.length).toBeGreaterThan(1);
    expect(ahead.map((commit) => commit.hash)).toEqual(
      (await core.git.log(path)).map((commit) => commit.hash)
    );
    // The guarded delete reads the same answer
    await expectCoreError(
      core.projects.delete({ id: project.id }),
      'Conflict',
      'not pushed'
    );
  }, 30000);

  it.each([
    ['a repository a git host created with a README', hostRepositoryWithReadme],
    ['the remote of another Project', anotherProjectsRemote],
  ])(
    'should refuse %s and leave both sides as they were',
    async function (_, remote) {
      const remotePath = await remote();
      const { project, path } = await newProject();
      await createCollection(project.id);
      await connect(project.id, remotePath);
      const remoteBefore = await refsOf(remotePath);
      const localBefore = await refsOf(path, 'refs/heads');

      await expectCoreError(
        core.projects.synchronize({ id: project.id }),
        'PreconditionFailed',
        'empty repository'
      );

      expect(await refsOf(remotePath)).toEqual(remoteBefore);
      expect(await refsOf(path, 'refs/heads')).toEqual(localBefore);
      expect(await core.git.status(path)).toMatchObject({ isClean: true });
    },
    30000
  );

  it('should push draft and the Release tags to a remote that holds the main of the Project alone', async function () {
    const remotePath = await emptyRemote();
    const { project, path } = await newProject();
    await createCollection(project.id);
    await core.releases.create({ projectId: project.id });
    await connect(project.id, remotePath);
    // What a git host suggests for an existing repository
    await execGit(path, ['push', '--no-verify', 'origin', 'main']);
    await addCollection(core, project.id, 'later');
    const remoteMain = await core.git.revParse(remotePath, 'main');

    await core.projects.synchronize({ id: project.id });

    expect(await core.git.revParse(remotePath, 'main')).toEqual(remoteMain);
    expect(await core.git.revParse(remotePath, 'draft')).toEqual(
      await core.git.revParse(path, 'draft')
    );
    const releases = await core.releases.list({ projectId: project.id });
    const remoteTags = await core.git.tags.list({ path: remotePath });
    expect(remoteTags.list.map((tag) => tag.id).toSorted()).toEqual(
      releases.list.map((item) => item.tagId).toSorted()
    );
    expect(await upstreamOf(path, 'draft')).toEqual('origin/draft');

    const other = await otherWorkingCopy(remotePath);
    expect(
      await other.core.projects.branches.current({ id: other.project.id })
    ).toEqual('draft');
  }, 60000);

  it('should refuse a remote whose main holds commits the local main lacks and no draft', async function () {
    const remotePath = await emptyRemote();
    const { project, path } = await newProject();
    await connect(project.id, remotePath);
    const ahead = await execGit(path, [
      '-c',
      'user.name=Someone',
      '-c',
      'user.email=someone@example.com',
      'commit-tree',
      'main^{tree}',
      '-p',
      'main',
      '-m',
      'Pushed by hand',
    ]);
    await execGit(path, [
      'push',
      '--no-verify',
      'origin',
      `${ahead}:refs/heads/main`,
    ]);
    const remoteBefore = await refsOf(remotePath);
    const localBefore = await refsOf(path, 'refs/heads');

    await expectCoreError(
      core.projects.synchronize({ id: project.id }),
      'PreconditionFailed',
      'the local "main" lacks'
    );

    expect(await refsOf(remotePath)).toEqual(remoteBefore);
    expect(await refsOf(path, 'refs/heads')).toEqual(localBefore);
  }, 30000);

  // A shell hook needs a POSIX shell, which git on a Windows runner is not
  // guaranteed to have
  it.skipIf(process.platform === 'win32')(
    'should land nothing when the remote declines one ref of the first push',
    async function () {
      const remotePath = await emptyRemote();
      await Fs.writeFile(
        Path.join(remotePath, 'hooks', 'update'),
        '#!/bin/sh\nif [ "$1" = "refs/heads/draft" ]; then exit 1; fi\n',
        { mode: 0o755 }
      );
      const { project, path } = await newProject();
      await createCollection(project.id);
      await core.releases.create({ projectId: project.id });
      await connect(project.id, remotePath);
      const localBefore = await refsOf(path, 'refs/heads');

      await expectCoreError(
        core.projects.synchronize({ id: project.id }),
        'Internal',
        'Git push to origin failed'
      );

      expect(await refsOf(remotePath)).toEqual('');
      expect(await refsOf(path, 'refs/heads')).toEqual(localBefore);
      await expect(upstreamOf(path, 'draft')).rejects.toThrow();
    },
    30000
  );

  it('should refuse an empty remote without atomic push support and land nothing', async function () {
    const remotePath = await emptyRemote();
    await execGit(remotePath, ['config', 'receive.advertiseAtomic', 'false']);
    const { project } = await newProject();
    await connect(project.id, remotePath);

    await expectCoreError(
      core.projects.synchronize({ id: project.id }),
      'PreconditionFailed',
      'does not support atomic pushes'
    );

    expect(await refsOf(remotePath)).toEqual('');
  }, 30000);
});
