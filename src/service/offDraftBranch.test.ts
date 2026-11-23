import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import core, { uuid, type Collection, type Entry } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createComponent,
  createEntry,
  createLocalRemoteRepository,
  createProject,
  execGit,
  expectCoreError,
} from '../test/util.js';

/**
 * A Project left on `main` used to take every edit and commit it there, and
 * the next synchronization pushed those unreleased edits to the remote's
 * released branch, where the next Release was refused for them.
 *
 * @see ../../docs/git-and-sync.md
 */
describe('A Project off its draft branch', function () {
  let project: Awaited<ReturnType<typeof createProject>>;
  let projectPath = '';
  let collection: Collection;
  let entry: Entry;
  let assetId = '';
  let assetExtension = '';
  let componentId = '';

  /**
   * Awaits the promise and asserts Core refused it for the branch, naming
   * that branch and `not_on_draft` as its cause wherever it is raised.
   */
  async function expectOffDraftError(
    promise: Promise<unknown>,
    branch: string
  ) {
    await expectCoreError(
      promise,
      'PreconditionFailed',
      `is on branch "${branch}" rather than "draft"`,
      'not_on_draft'
    );
  }

  /** Every entry point that writes a Project, its content or its remote. */
  function writes(): [label: string, run: () => Promise<unknown>][] {
    return [
      [
        'collections.create',
        () =>
          core.collections.create({
            projectId: project.id,
            icon: 'home',
            name: {
              singular: { en: 'Never', de: 'Never' },
              plural: { en: 'Nevers', de: 'Nevers' },
            },
            slug: { singular: 'never', plural: 'nevers' },
            description: { en: 'Never created', de: 'Never created' },
            fieldDefinitions: [],
          }),
      ],
      [
        'collections.update',
        () =>
          core.collections.update({
            projectId: project.id,
            id: collection.id,
            icon: 'home',
            name: {
              singular: { en: 'Never', de: 'Never' },
              plural: { en: 'Nevers', de: 'Nevers' },
            },
            slug: { singular: 'never', plural: 'nevers' },
            description: { en: 'Never updated', de: 'Never updated' },
            fieldDefinitions: [],
          }),
      ],
      [
        'collections.delete',
        () => core.collections.delete({ projectId: project.id, id: uuid() }),
      ],
      [
        'components.create',
        () =>
          core.components.create({
            projectId: project.id,
            name: { en: 'Never', de: 'Never' },
            slug: 'never',
            description: { en: 'Never created', de: 'Never created' },
            fieldDefinitions: [],
          }),
      ],
      [
        'components.update',
        () =>
          core.components.update({
            projectId: project.id,
            id: componentId,
            name: { en: 'Never', de: 'Never' },
            slug: 'hero',
            description: { en: 'Never updated', de: 'Never updated' },
            fieldDefinitions: [],
          }),
      ],
      [
        'components.delete',
        () => core.components.delete({ projectId: project.id, id: uuid() }),
      ],
      [
        'entries.create',
        () =>
          core.entries.create({
            projectId: project.id,
            collectionId: collection.id,
            values: {},
          }),
      ],
      [
        'entries.update',
        () =>
          core.entries.update({
            projectId: project.id,
            collectionId: collection.id,
            id: entry.id,
            values: entry.values,
          }),
      ],
      [
        'entries.delete',
        () =>
          core.entries.delete({
            projectId: project.id,
            collectionId: collection.id,
            id: entry.id,
          }),
      ],
      [
        'assets.create',
        () =>
          core.assets.create({
            projectId: project.id,
            filePath: Path.resolve('src/test/data/150x150.png'),
            name: 'Never',
            description: 'Never created',
          }),
      ],
      [
        'assets.update',
        () =>
          core.assets.update({
            projectId: project.id,
            id: assetId,
            name: 'never',
            description: 'Never updated',
          }),
      ],
      [
        'assets.delete',
        () =>
          core.assets.delete({
            projectId: project.id,
            id: assetId,
            extension: assetExtension,
          }),
      ],
      [
        'projects.update',
        () =>
          core.projects.update({
            id: project.id,
            name: 'Never renamed',
            description: project.description,
            settings: project.settings,
          }),
      ],
      [
        'projects.synchronize',
        () => core.projects.synchronize({ id: project.id }),
      ],
      ['projects.upgrade', () => core.projects.upgrade({ id: project.id })],
      [
        'releases.prepare',
        () => core.releases.prepare({ projectId: project.id }),
      ],
      [
        'releases.create',
        () => core.releases.create({ projectId: project.id }),
      ],
      [
        'releases.createPreview',
        () => core.releases.createPreview({ projectId: project.id }),
      ],
    ];
  }

  beforeAll(async function () {
    project = await createProject();
    projectPath = core.util.pathTo.project(project.id);
    collection = await createCollection(project.id);
    componentId = (await createComponent(project.id)).id;
    const asset = await createAsset(project.id);
    assetId = asset.id;
    assetExtension = asset.extension;
    entry = await createEntry(project.id, collection.id, asset.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  describe('on main', function () {
    let tipBefore = '';

    beforeAll(async function () {
      // Switched with git rather than through Core, the way the Project
      // that found this got onto `main`
      await execGit(projectPath, ['switch', 'main']);
      tipBefore = await core.git.revParse(projectPath, 'HEAD');
    });

    afterAll(async function () {
      await core.projects.branches.switch({ id: project.id, branch: 'draft' });
    });

    it.each(writes())('refuses %s', async function (_label, run) {
      await expectOffDraftError(run(), 'main');
    });

    it('reads the released content, which is what main is for', async function () {
      expect((await core.projects.read({ id: project.id })).id).toEqual(
        project.id
      );
      // Nothing of `draft` was released, so `main` holds no Collection
      const { total } = await core.collections.list({
        projectId: project.id,
        limit: 0,
      });
      expect(total).toEqual(0);
    });

    it('wrote nothing while refusing all of them', async function () {
      expect(await core.git.revParse(projectPath, 'HEAD')).toEqual(tipBefore);
      expect((await core.git.status(projectPath)).files).toEqual([]);
    });
  });

  it('refuses a write on a detached HEAD, which has no branch to name', async function () {
    await core.projects.branches.switch({
      id: project.id,
      branch: 'main',
      options: { detach: true },
    });

    await expectCoreError(
      core.entries.update({
        projectId: project.id,
        collectionId: collection.id,
        id: entry.id,
        values: entry.values,
      }),
      'PreconditionFailed',
      'is not on a branch, and every change is committed on "draft"',
      'not_on_draft'
    );

    await core.projects.branches.switch({ id: project.id, branch: 'draft' });
  });

  it('refuses a write on a branch named like an upgrade branch', async function () {
    // An upgrade lets its own branch through while it runs, and nothing
    // else does, so a branch of that name is no way around the guard
    const branch = `upgrade/core-0.0.0-to-${core.coreVersion}`;
    await core.projects.branches.switch({
      id: project.id,
      branch,
      options: { create: true },
    });

    await expectOffDraftError(
      core.projects.update({
        id: project.id,
        name: 'Never renamed',
        description: project.description,
        settings: project.settings,
      }),
      branch
    );

    await core.projects.branches.switch({ id: project.id, branch: 'draft' });
    await core.git.branches.delete(projectPath, branch, true);
  });

  it('writes and releases again once the Project is back on draft', async function () {
    expect(await core.projects.branches.current({ id: project.id })).toEqual(
      'draft'
    );

    const renamed = await core.projects.update({
      id: project.id,
      name: 'Back on draft',
      description: project.description,
      settings: project.settings,
    });
    expect(renamed.name).toEqual('Back on draft');

    const updated = await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: entry.values,
    });
    expect(updated.id).toEqual(entry.id);

    const release = await core.releases.create({ projectId: project.id });
    expect(release.version).not.toEqual('0.0.1');
    expect(await core.projects.branches.current({ id: project.id })).toEqual(
      'draft'
    );
  });

  it('upgrades a Project on draft, which writes on a branch of its own', async function () {
    // `force` runs the whole upgrade over every entity, so every public
    // update method is called while the tree sits on the upgrade branch
    await core.projects.upgrade({ id: project.id, force: true });

    expect(await core.projects.branches.current({ id: project.id })).toEqual(
      'draft'
    );
    expect((await core.git.status(projectPath)).files).toEqual([]);
    const { local } = await core.git.branches.list(projectPath);
    expect(local.filter((name) => name.startsWith('upgrade/'))).toEqual([]);
  });

  it('refuses a write beside an upgrade, whose allowance is its own calls', async function () {
    const nameBefore = (await core.projects.read({ id: project.id })).name;
    let upgradeBranch = '';
    let isParked = false;
    let reachedUpgradeBranch!: () => void;
    let letTheUpgradeGoOn!: () => void;
    const onUpgradeBranch = new Promise<void>(function (resolve) {
      reachedUpgradeBranch = resolve;
    });
    const writeWasRefused = new Promise<void>(function (resolve) {
      letTheUpgradeGoOn = resolve;
    });

    // Holds the upgrade still after its first migrating commit, so the write
    // below runs while the allowance is open. That write is issued out here,
    // beside the upgrade rather than inside its calls, which is what decides
    // whether the allowance reaches it
    const commit = core.git.commit.bind(core.git);
    const spy = vi
      .spyOn(core.git, 'commit')
      .mockImplementation(async function (path, message) {
        await commit(path, message);
        if (isParked || path !== projectPath) {
          return;
        }
        const branch = await core.git.branches.current(path);
        if (!branch.startsWith('upgrade/')) {
          return;
        }
        isParked = true;
        upgradeBranch = branch;
        reachedUpgradeBranch();
        await writeWasRefused;
      });

    const upgrade = core.projects.upgrade({ id: project.id, force: true });
    await onUpgradeBranch;

    await expectOffDraftError(
      core.projects.update({
        id: project.id,
        name: 'Never renamed',
        description: project.description,
        settings: project.settings,
      }),
      upgradeBranch
    );

    letTheUpgradeGoOn();
    await upgrade;
    spy.mockRestore();

    // Nothing of the refused write reached the Project, which an allowance
    // the upgrade branch alone opens would have let onto a branch that is
    // gone by now
    expect((await core.projects.read({ id: project.id })).name).toEqual(
      nameBefore
    );
    expect(await core.projects.branches.current({ id: project.id })).toEqual(
      'draft'
    );
  });

  it('refuses a write again after an upgrade, which takes its allowance back', async function () {
    await core.projects.branches.switch({ id: project.id, branch: 'main' });

    await expectOffDraftError(
      core.projects.update({
        id: project.id,
        name: 'Never renamed',
        description: project.description,
        settings: project.settings,
      }),
      'main'
    );

    await core.projects.branches.switch({ id: project.id, branch: 'draft' });
  });

  it('pushes nothing to the remote while on main', async function () {
    const remoteProject = await createLocalRemoteRepository();
    const remotePath = Path.join(core.util.pathTo.tmp, remoteProject.id);
    const cloned = await core.projects.clone({ url: remotePath });
    const clonedPath = core.util.pathTo.project(cloned.id);
    const mainBefore = await core.git.revParse(remotePath, 'main');

    // The state the defect left behind: a commit on `main` that no Release
    // made, here through the git layer because Core refuses the write
    await core.projects.branches.switch({ id: cloned.id, branch: 'main' });
    const filePath = core.util.pathTo.projectFile(cloned.id);
    await Fs.writeJson(filePath, {
      ...(await Fs.readJson(filePath)),
      name: 'Edited on main',
    });
    await core.git.add(clonedPath, [filePath]);
    await core.git.commit(clonedPath, {
      method: 'update',
      reference: { objectType: 'project', id: cloned.id },
    });

    await expectOffDraftError(
      core.projects.synchronize({ id: cloned.id }),
      'main'
    );

    expect(await core.git.revParse(remotePath, 'main')).toEqual(mainBefore);

    // Switching back is what gets a sync past the refusal
    await core.projects.branches.switch({ id: cloned.id, branch: 'draft' });
    await core.projects.synchronize({ id: cloned.id });

    await core.projects.delete({ id: cloned.id, force: true });
    await Fs.remove(remotePath);
  });

  it('still sets a remote and deletes a Project while on main', async function () {
    const other = await createProject();
    const url = 'https://example.com/acme/content.git';
    await core.projects.branches.switch({ id: other.id, branch: 'main' });

    // Neither writes a commit, and switching is how a Project gets back to
    // `draft`, so the branch guards none of the three
    await core.projects.setRemoteOriginUrl({ id: other.id, url });
    expect(
      (await core.projects.read({ id: other.id })).remoteOriginUrl
    ).toEqual(url);

    await core.projects.delete({ id: other.id, force: true });
    expect(await Fs.pathExists(core.util.pathTo.project(other.id))).toBe(false);
  });

  it('leaves a folder with no repository in it to the read that follows', async function () {
    const missing = uuid();
    expect(await Fs.pathExists(core.util.pathTo.project(missing))).toBe(false);

    // Half a Project, what an interrupted copy or delete leaves behind: a
    // folder that is there and holds no repository, so it has no branch
    const halfAProject = uuid();
    await Fs.ensureDir(core.util.pathTo.project(halfAProject));

    for (const id of [missing, halfAProject]) {
      await expectCoreError(
        core.collections.create({
          projectId: id,
          icon: 'home',
          name: {
            singular: { en: 'Never', de: 'Never' },
            plural: { en: 'Nevers', de: 'Nevers' },
          },
          slug: { singular: 'never', plural: 'nevers' },
          description: { en: 'Never created', de: 'Never created' },
          fieldDefinitions: [],
        }),
        'NotFound'
      );
      await expectCoreError(
        core.projects.update({
          id,
          name: 'Never renamed',
          description: project.description,
          settings: project.settings,
        }),
        'NotFound'
      );
      await expectCoreError(
        core.entries.create({
          projectId: id,
          collectionId: collection.id,
          values: {},
        }),
        'NotFound'
      );
    }

    await Fs.remove(core.util.pathTo.project(halfAProject));
  });
});
