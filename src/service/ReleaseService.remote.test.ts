import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import core, { projectFileSchema, testUserProps } from '../test/setup.js';
import {
  createBareRemoteOf,
  createCollection,
  createLocalRemoteRepository,
  createProject,
  createTmpCore,
  execGit,
  expectCoreError,
} from '../test/util.js';

/**
 * With a remote, the released state is the remote's `main`, and a Release
 * pushes `main`, `draft` and its tag in one atomic push. A working copy's
 * local `main` can be missing, after a clone, or behind, after another
 * working copy released, and neither may change the bump.
 */
describe('ReleaseService against a remote', function () {
  let counter = 0;

  /** A minor change, with a slug of its own so it never clashes. */
  async function addCollection(on: ElekIoCore, projectId: string) {
    counter += 1;
    return on.collections.create({
      projectId,
      icon: 'home',
      name: {
        singular: { en: `Thing ${counter}`, de: `Thing ${counter}` },
        plural: { en: `Things ${counter}`, de: `Things ${counter}` },
      },
      description: { en: 'A change', de: 'A change' },
      slug: { singular: `thing-${counter}`, plural: `things-${counter}` },
      fieldDefinitions: [],
    });
  }

  /** A patch change. */
  async function rename(on: ElekIoCore, id: string, name: string) {
    const project = await on.projects.read({ id });
    await on.projects.update({ ...project, name });
  }

  /** The Project version committed on a ref of a repository. */
  async function versionAt(repositoryPath: string, ref: string) {
    const content = await core.git.getFileContentAtCommit(
      repositoryPath,
      'project.json',
      ref
    );
    return projectFileSchema.parse(JSON.parse(content)).version;
  }

  /** Every branch and tag of a repository with the commit it points at. */
  function refsOf(repositoryPath: string, ...patterns: string[]) {
    return execGit(repositoryPath, [
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      ...patterns,
    ]);
  }

  /**
   * What a refused or unwound Release must leave as it was. Tags are left
   * out, because the fetch a Release starts with brings the remote's in.
   */
  async function stateOf(projectPath: string) {
    return {
      branches: await refsOf(projectPath, 'refs/heads'),
      branch: await core.git.branches.current(projectPath),
      isClean: (await core.git.status(projectPath)).isClean,
    };
  }

  /** A fixture remote, removed again once the test finishes. */
  async function remote(): Promise<string> {
    const remoteProject = await createLocalRemoteRepository();
    const path = Path.join(core.util.pathTo.tmp, remoteProject.id);
    onTestFinished(async () => {
      await Fs.remove(path);
    });
    return path;
  }

  /** A clone on the shared Core, removed again once the test finishes. */
  async function clone(url: string) {
    const project = await core.projects.clone({ url });
    onTestFinished(async () => {
      await core.projects.delete({ id: project.id, force: true });
    });
    return { project, path: core.util.pathTo.project(project.id) };
  }

  /**
   * A clone on a Core of its own, because one data directory holds a
   * Project id only once.
   */
  async function otherWorkingCopy(url: string) {
    const { core: other } = createTmpCore();
    await other.user.set(testUserProps);
    const project = await other.projects.clone({ url });
    return {
      core: other,
      project,
      path: other.util.pathTo.project(project.id),
    };
  }

  it('should release a clone without a local main with the bump of the working copy that created the Project', async function () {
    const creator = await createProject();
    onTestFinished(creator.destroy);
    const creatorPath = core.util.pathTo.project(creator.id);
    await createCollection(creator.id);
    await core.releases.create({ projectId: creator.id });
    await rename(core, creator.id, 'Renamed');

    const remotePath = await createBareRemoteOf(creator.id);
    onTestFinished(async () => {
      await Fs.remove(remotePath);
    });
    await core.projects.setRemoteOriginUrl({
      id: creator.id,
      url: remotePath,
    });
    await core.git.fetch(creatorPath);
    const expected = await core.releases.prepare({ projectId: creator.id });
    expect(expected.bump).toEqual('patch');

    const other = await otherWorkingCopy(remotePath);
    expect((await other.core.git.branches.list(other.path)).local).toEqual([
      'draft',
    ]);

    expect(
      await other.core.releases.prepare({ projectId: other.project.id })
    ).toEqual(expected);
    const result = await other.core.releases.create({
      projectId: other.project.id,
    });
    expect(result.version).toEqual(expected.nextVersion);
    expect(await versionAt(remotePath, 'main')).toEqual(expected.nextVersion);
  });

  it('should push main, draft and the tag, so a working copy that synchronizes holds the Release', async function () {
    const remotePath = await remote();

    // B releases first, so it holds a local main that goes stale below
    const b = await clone(remotePath);
    await createCollection(b.project.id);
    await core.releases.create({ projectId: b.project.id });

    // A releases a change it never synchronized
    const a = await otherWorkingCopy(remotePath);
    const aCollection = await addCollection(a.core, a.project.id);
    const released = await a.core.releases.create({
      projectId: a.project.id,
    });
    expect(released.diff.bump).toEqual('minor');

    for (const branch of ['main', 'draft']) {
      expect(await core.git.revParse(remotePath, branch)).toEqual(
        await a.core.git.revParse(a.path, branch)
      );
    }
    const { list: remoteTags } = await core.git.tags.list({
      path: remotePath,
    });
    expect(
      remoteTags.some(
        (tag) =>
          tag.message.type === 'release' &&
          tag.message.version === released.version
      )
    ).toBe(true);

    // B synchronizes and holds the released content on draft, while its
    // local main stays on B's own Release
    await core.projects.synchronize({ id: b.project.id });
    expect((await core.projects.read({ id: b.project.id })).version).toEqual(
      released.version
    );
    expect(
      await core.collections.read({
        projectId: b.project.id,
        id: aCollection.id,
      })
    ).toMatchObject({ id: aCollection.id });
    expect(await core.git.revParse(b.path, 'main')).not.toEqual(
      await core.git.revParse(b.path, 'origin/main')
    );

    await rename(core, b.project.id, 'Renamed by B');
    const diff = await core.releases.prepare({ projectId: b.project.id });

    expect(diff.currentVersion).toEqual(released.version);
    expect(diff.bump).toEqual('patch');
    expect(diff.projectChanges).toEqual([
      { changeType: 'nameChanged', bump: 'patch' },
    ]);
    expect(diff.collectionChanges).toEqual([]);
    expect(diff.fieldChanges).toEqual([]);
    expect(diff.componentChanges).toEqual([]);
    expect(diff.assetChanges).toEqual([]);
    expect(diff.entryChanges).toEqual([]);

    // B's Release builds on the remote's main, so its push fast-forwards it
    const result = await core.releases.create({ projectId: b.project.id });
    expect(result.version).toEqual(diff.nextVersion);
    for (const branch of ['main', 'draft']) {
      expect(await core.git.revParse(remotePath, branch)).toEqual(
        await core.git.revParse(b.path, branch)
      );
    }
    expect(await versionAt(remotePath, 'main')).toEqual(diff.nextVersion);
  });

  it('should refuse a Release whose draft is behind the remote draft before changing anything', async function () {
    const remotePath = await remote();
    const b = await clone(remotePath);
    // B's own change, outside project.json so the later rebase onto A's
    // version commit applies cleanly
    const own = await addCollection(core, b.project.id);
    const ownChanges = [
      { collectionId: own.id, changeType: 'added', bump: 'minor' },
    ];

    const a = await otherWorkingCopy(remotePath);
    await addCollection(a.core, a.project.id);
    await a.core.releases.create({ projectId: a.project.id });

    const fetch = vi.spyOn(core.git, 'fetch');
    onTestFinished(() => fetch.mockRestore());

    // prepare() reads the remote as B last fetched it, before A's Release
    const diff = await core.releases.prepare({ projectId: b.project.id });
    expect(fetch).not.toHaveBeenCalled();
    expect(diff.collectionChanges).toEqual(ownChanges);

    // create() fetches A's Release and refuses before it changes anything
    const behind = 'Synchronize first';
    const localBefore = await stateOf(b.path);
    const remoteBefore = await refsOf(remotePath);
    await expectCoreError(
      core.releases.create({ projectId: b.project.id }),
      'PreconditionFailed',
      behind
    );
    expect(fetch).toHaveBeenCalled();
    expect(await stateOf(b.path)).toEqual(localBefore);
    expect(await refsOf(b.path, 'refs/tags')).toEqual(
      await refsOf(remotePath, 'refs/tags')
    );
    expect(await refsOf(remotePath)).toEqual(remoteBefore);

    // prepare() and createPreview() agree, against the draft just fetched
    await expectCoreError(
      core.releases.prepare({ projectId: b.project.id }),
      'PreconditionFailed',
      behind
    );
    await expectCoreError(
      core.releases.createPreview({ projectId: b.project.id }),
      'PreconditionFailed',
      behind
    );
    expect(await refsOf(remotePath)).toEqual(remoteBefore);

    // Once B synchronizes, it releases its own change alone
    await core.projects.synchronize({ id: b.project.id });
    const result = await core.releases.create({ projectId: b.project.id });
    expect(result.diff.collectionChanges).toEqual(ownChanges);
  });

  it('should refuse when the remote main holds a Release its draft lacks', async function () {
    const remotePath = await remote();

    // A Release made by hand, pushing main alone
    const a = await clone(remotePath);
    await addCollection(core, a.project.id);
    await core.git.branches.switch(a.path, 'main');
    await core.git.merge(a.path, 'draft');
    await core.git.push(a.path, { refs: ['main'] });
    await core.git.branches.switch(a.path, 'draft');

    const b = await otherWorkingCopy(remotePath);
    const lacksMain = `lacks commits of the remote's "main"`;
    await expectCoreError(
      b.core.releases.prepare({ projectId: b.project.id }),
      'PreconditionFailed',
      lacksMain
    );
    await expectCoreError(
      b.core.releases.create({ projectId: b.project.id }),
      'PreconditionFailed',
      lacksMain
    );
  });

  it('should refuse when the local main holds commits the remote main lacks', async function () {
    const remotePath = await remote();
    const { project, path } = await clone(remotePath);
    await createCollection(project.id);

    // A commit on main that was never pushed
    await core.projects.branches.switch({ id: project.id, branch: 'main' });
    await rename(core, project.id, 'Edited on main');
    await core.projects.branches.switch({ id: project.id, branch: 'draft' });
    const mainBefore = await core.git.revParse(path, 'main');

    await expectCoreError(
      core.releases.prepare({ projectId: project.id }),
      'PreconditionFailed',
      `The local "main" holds commits`
    );
    await expect(
      core.releases.create({ projectId: project.id })
    ).rejects.toMatchObject({ type: 'PreconditionFailed' });
    await expect(
      core.releases.createPreview({ projectId: project.id })
    ).rejects.toMatchObject({ type: 'PreconditionFailed' });

    expect(await core.git.revParse(path, 'main')).toEqual(mainBefore);
    expect(await core.git.revParse(remotePath, 'main')).not.toEqual(mainBefore);
  });

  it('should create the remote draft when releasing onto a remote without one', async function () {
    const creator = await createProject();
    onTestFinished(creator.destroy);
    const creatorPath = core.util.pathTo.project(creator.id);
    const remotePath = await createBareRemoteOf(creator.id);
    onTestFinished(async () => {
      await Fs.remove(remotePath);
    });
    await execGit(remotePath, ['branch', '--delete', '--force', 'draft']);
    await core.projects.setRemoteOriginUrl({
      id: creator.id,
      url: remotePath,
    });
    await createCollection(creator.id);

    const result = await core.releases.create({ projectId: creator.id });

    expect(await core.git.revParse(remotePath, 'draft')).toEqual(
      await core.git.revParse(creatorPath, 'draft')
    );
    expect(await versionAt(remotePath, 'main')).toEqual(result.version);

    const other = await otherWorkingCopy(remotePath);
    expect(
      await other.core.projects.branches.current({ id: other.project.id })
    ).toEqual('draft');
    expect(other.project.version).toEqual(result.version);
  });

  // A shell hook needs a POSIX shell, which git on a Windows runner is not
  // guaranteed to have. The race below covers the unwind on every platform
  it.skipIf(process.platform === 'win32')(
    'should land nothing and unwind when the remote declines one ref of the push',
    async function () {
      const remotePath = await remote();
      const { project, path } = await clone(remotePath);
      await createCollection(project.id);
      await Fs.writeFile(
        Path.join(remotePath, 'hooks', 'update'),
        '#!/bin/sh\nif [ "$1" = "refs/heads/draft" ]; then exit 1; fi\n',
        { mode: 0o755 }
      );

      const localBefore = await stateOf(path);
      const tagsBefore = await refsOf(path, 'refs/tags');
      const remoteBefore = await refsOf(remotePath);
      await expect(
        core.releases.create({ projectId: project.id })
      ).rejects.toMatchObject({ type: 'Internal' });

      expect(await refsOf(remotePath)).toEqual(remoteBefore);
      expect(await stateOf(path)).toEqual(localBefore);
      expect(await refsOf(path, 'refs/tags')).toEqual(tagsBefore);
    }
  );

  it('should land nothing and unwind when the remote draft advances during the Release', async function () {
    const remotePath = await remote();
    const b = await clone(remotePath);
    await createCollection(b.project.id);
    const a = await otherWorkingCopy(remotePath);
    await addCollection(a.core, a.project.id);

    const remoteMainBefore = await core.git.revParse(remotePath, 'main');
    const remoteTagsBefore = await refsOf(remotePath, 'refs/tags');
    const localBefore = await stateOf(b.path);
    const tagsBefore = await refsOf(b.path, 'refs/tags');

    // A synchronizes between the fetch the Release starts with and its push
    const push = core.git.push.bind(core.git);
    const spy = vi
      .spyOn(core.git, 'push')
      .mockImplementationOnce(async (...args) => {
        await a.core.projects.synchronize({ id: a.project.id });
        return push(...args);
      });
    onTestFinished(() => spy.mockRestore());

    await expectCoreError(
      core.releases.create({ projectId: b.project.id }),
      'PreconditionFailed',
      'remote advanced'
    );

    expect(await core.git.revParse(remotePath, 'main')).toEqual(
      remoteMainBefore
    );
    expect(await refsOf(remotePath, 'refs/tags')).toEqual(remoteTagsBefore);
    expect(await core.git.revParse(remotePath, 'draft')).toEqual(
      await a.core.git.revParse(a.path, 'draft')
    );
    expect(await stateOf(b.path)).toEqual(localBefore);
    expect(await refsOf(b.path, 'refs/tags')).toEqual(tagsBefore);
  });

  it('should refuse a remote without atomic push support and land nothing', async function () {
    const remotePath = await remote();
    await execGit(remotePath, ['config', 'receive.advertiseAtomic', 'false']);
    const { project, path } = await clone(remotePath);
    await createCollection(project.id);

    const localBefore = await stateOf(path);
    const tagsBefore = await refsOf(path, 'refs/tags');
    const remoteBefore = await refsOf(remotePath);
    const noAtomic = 'does not support atomic pushes';
    await expectCoreError(
      core.releases.create({ projectId: project.id }),
      'PreconditionFailed',
      noAtomic
    );
    await expectCoreError(
      core.releases.createPreview({ projectId: project.id }),
      'PreconditionFailed',
      noAtomic
    );

    expect(await refsOf(remotePath)).toEqual(remoteBefore);
    expect(await stateOf(path)).toEqual(localBefore);
    expect(await refsOf(path, 'refs/tags')).toEqual(tagsBefore);
  });

  it('should release a Project without a remote against its local main, without fetching', async function () {
    const project = await createProject();
    onTestFinished(project.destroy);
    const projectPath = core.util.pathTo.project(project.id);
    const fetch = vi.spyOn(core.git, 'fetch');
    onTestFinished(() => fetch.mockRestore());

    await createCollection(project.id);
    const first = await core.releases.create({ projectId: project.id });
    expect(first.version).toEqual('0.1.0');

    await rename(core, project.id, 'Renamed');
    const diff = await core.releases.prepare({ projectId: project.id });
    expect(diff.bump).toEqual('patch');
    expect(diff.projectChanges).toEqual([
      { changeType: 'nameChanged', bump: 'patch' },
    ]);
    expect(diff.collectionChanges).toEqual([]);

    const second = await core.releases.create({ projectId: project.id });
    expect(second.version).toEqual('0.1.1');
    expect(await versionAt(projectPath, 'main')).toEqual('0.1.1');
    expect(fetch).not.toHaveBeenCalled();
  });
});
