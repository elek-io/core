import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import core, { testUserProps, uuid, type Value } from '../test/setup.js';
import {
  createAsset,
  createComponent,
  createLocalRemoteRepository,
  createProject,
  createTmpCore,
  expectCoreError,
} from '../test/util.js';

/**
 * Every Release of a Project says who made it and what it moved in the
 * version, and one call says what one of them changed. The Release commit
 * carries `project.json` alone, so what a Release changed is the two commits
 * compared rather than anything that commit holds.
 */
describe('Reading what each Release changed', function () {
  const fieldDefinitionId = uuid();

  /** A Collection with one text field, slug `title`. */
  async function createTextCollection(on: ElekIoCore, projectId: string) {
    return on.collections.create({
      projectId,
      icon: 'home',
      name: {
        singular: { en: 'Page', de: 'Seite' },
        plural: { en: 'Pages', de: 'Seiten' },
      },
      slug: { singular: 'page', plural: 'pages' },
      description: { en: 'The pages', de: 'Die Seiten' },
      fieldDefinitions: [
        {
          id: fieldDefinitionId,
          slug: 'title',
          valueType: 'string',
          label: { en: 'Title', de: 'Titel' },
          description: { en: 'The title', de: 'Der Titel' },
          fieldType: 'text',
          inputWidth: '12',
          isDisabled: false,
          isRequired: true,
          isUnique: false,
          min: null,
          max: 70,
          defaultValue: null,
        },
      ],
    });
  }

  /** The one Value such a Collection's Entry holds. */
  function titleValues(title: string) {
    const values: Record<string, Value> = {
      title: {
        objectType: 'value',
        valueType: 'string',
        content: { en: title, de: title },
      },
    };
    return values;
  }

  /** A fixture remote, removed again once the test finishes. */
  async function createRemote(): Promise<string> {
    const remoteProject = await createLocalRemoteRepository();
    const path = Path.join(core.util.pathTo.tmp, remoteProject.id);
    onTestFinished(async () => {
      await Fs.remove(path);
    });
    return path;
  }

  /**
   * A second working copy of the same remote, on a Core of its own, because
   * one data directory holds a Project id only once.
   */
  async function cloneOnOwnCore(url: string) {
    const { core: other } = createTmpCore();
    await other.user.set(testUserProps);
    const project = await other.projects.clone({ url });
    return { core: other, project };
  }

  /** The Release of a version, as `list()` returns it. */
  async function releaseOf(on: ElekIoCore, projectId: string, version: string) {
    const { list } = await on.releases.list({ projectId });
    const release = list.find((candidate) => candidate.version === version);
    expect(release).toBeDefined();
    return release!;
  }

  /**
   * A Project with four Releases and two previews, one of each bump:
   *
   * | Version | What it carried |
   * | --- | --- |
   * | `0.1.0-preview.1` | the first Collection, before it was released |
   * | `0.1.0` | the first Collection |
   * | `0.2.0` | an Entry in it |
   * | `0.2.1-preview.1` | the Project's new name |
   * | `0.2.1` | the Project's new name |
   * | `1.0.0` | the Collection's plural slug renamed |
   */
  async function createReleasedProject() {
    const project = await createProject('Released Project');
    onTestFinished(project.destroy);
    const collection = await createTextCollection(core, project.id);

    await core.releases.createPreview({ projectId: project.id });
    await core.releases.create({ projectId: project.id });

    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });
    await core.releases.create({ projectId: project.id });

    await core.projects.update({
      ...(await core.projects.read({ id: project.id })),
      name: 'Renamed Project',
    });
    await core.releases.createPreview({ projectId: project.id });
    await core.releases.create({ projectId: project.id });

    await core.collections.update({
      projectId: project.id,
      ...collection,
      slug: { singular: 'page', plural: 'documents' },
    });
    await core.releases.create({ projectId: project.id });

    return { project, collection, entry };
  }

  it('should name who made each Release and the bump it carried', async function () {
    const { project } = await createReleasedProject();

    const { list } = await core.releases.list({ projectId: project.id });

    expect(
      list.map(({ version, type, bump }) => ({ version, type, bump }))
    ).toEqual(
      expect.arrayContaining([
        { version: '0.1.0-preview.1', type: 'preview', bump: 'minor' },
        { version: '0.1.0', type: 'release', bump: 'minor' },
        { version: '0.2.0', type: 'release', bump: 'minor' },
        { version: '0.2.1-preview.1', type: 'preview', bump: 'patch' },
        { version: '0.2.1', type: 'release', bump: 'patch' },
        { version: '1.0.0', type: 'release', bump: 'major' },
      ])
    );
    for (const release of list) {
      expect(release.author).toEqual({
        name: testUserProps.name,
        email: testUserProps.email,
      });
    }
  });

  it('should read a Release without reading anything but the tags', async function () {
    const { project } = await createReleasedProject();
    const reads = [
      vi.spyOn(core.git, 'getFileContentAtCommit'),
      vi.spyOn(core.git, 'listTreeAtCommit'),
      vi.spyOn(core.git, 'log'),
      vi.spyOn(core.git, 'rootCommit'),
      vi.spyOn(core.git, 'revParse'),
    ];
    const tagList = vi.spyOn(core.git.tags, 'list');
    onTestFinished(() => {
      vi.restoreAllMocks();
    });

    await core.releases.list({ projectId: project.id });

    expect(tagList).toHaveBeenCalledTimes(1);
    for (const read of reads) {
      expect(read).not.toHaveBeenCalled();
    }

    // What one Release changed is worked out for that Release alone, so it
    // reads the trees of its own two commits and of no other Release
    const release = await releaseOf(core, project.id, '0.2.1');
    const trees = vi.spyOn(core.git, 'listTreeAtCommit');
    await core.releases.changes({
      projectId: project.id,
      tagId: release.tagId,
    });

    const refs = new Set(trees.mock.calls.map(([, , ref]) => ref));
    expect(refs.size).toEqual(2);
  });

  it('should compare a first Release against the Project it was created as', async function () {
    const { project, collection } = await createReleasedProject();
    const first = await releaseOf(core, project.id, '0.1.0');

    const changes = await core.releases.changes({
      projectId: project.id,
      tagId: first.tagId,
    });

    expect(changes.currentVersion).toEqual('0.0.1');
    expect(changes.nextVersion).toEqual('0.1.0');
    expect(changes.bump).toEqual('minor');
    expect(changes.collectionChanges).toEqual([
      { collectionId: collection.id, changeType: 'added', bump: 'minor' },
    ]);
    expect(changes.entryChanges).toEqual([]);
    // The Project as that Release holds it, not as it is named now
    expect(changes.project.name).toEqual('Released Project');
  });

  it('should compare a Release against the full Release it built on', async function () {
    const { project, collection, entry } = await createReleasedProject();
    const second = await releaseOf(core, project.id, '0.2.0');

    const changes = await core.releases.changes({
      projectId: project.id,
      tagId: second.tagId,
    });

    expect(changes.currentVersion).toEqual('0.1.0');
    expect(changes.nextVersion).toEqual('0.2.0');
    expect(changes.bump).toEqual('minor');
    expect(changes.entryChanges).toEqual([
      {
        collectionId: collection.id,
        entryId: entry.id,
        changeType: 'added',
        bump: 'minor',
      },
    ]);
    expect(changes.collectionChanges).toEqual([]);
    expect(changes.projectChanges).toEqual([]);

    // A major Release reports what broke, and nothing of the Releases before
    const major = await releaseOf(core, project.id, '1.0.0');
    const majorChanges = await core.releases.changes({
      projectId: project.id,
      tagId: major.tagId,
    });

    expect(majorChanges.currentVersion).toEqual('0.2.1');
    expect(majorChanges.bump).toEqual('major');
    expect(majorChanges.collectionChanges).toEqual([
      { collectionId: collection.id, changeType: 'slugChanged', bump: 'major' },
    ]);
    expect(majorChanges.entryChanges).toEqual([]);
  });

  it('should compare a preview Release against the last full Release before it', async function () {
    const { project } = await createReleasedProject();
    const preview = await releaseOf(core, project.id, '0.2.1-preview.1');

    const changes = await core.releases.changes({
      projectId: project.id,
      tagId: preview.tagId,
    });

    expect(changes.currentVersion).toEqual('0.2.0');
    expect(changes.nextVersion).toEqual('0.2.1-preview.1');
    expect(changes.bump).toEqual('patch');
    expect(changes.projectChanges).toEqual([
      { changeType: 'nameChanged', bump: 'patch' },
    ]);
  });

  it('should report a Release in the shape prepare reports', async function () {
    const { project, collection } = await createReleasedProject();
    const latest = await releaseOf(core, project.id, '1.0.0');
    await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: titleValues('Unreleased'),
    });

    const changes = await core.releases.changes({
      projectId: project.id,
      tagId: latest.tagId,
    });
    const prepared = await core.releases.prepare({ projectId: project.id });

    expect(Object.keys(changes).toSorted()).toEqual(
      Object.keys(prepared).toSorted()
    );
  });

  it('should refuse a tag that is no Release of the Project', async function () {
    const { project } = await createReleasedProject();

    await expectCoreError(
      core.releases.changes({ projectId: project.id, tagId: uuid() }),
      'NotFound',
      'did not match any Release'
    );
  });

  it('should report what a Release made by another Core changed, not that its shape moved', async function () {
    const project = await createProject('Older shapes');
    onTestFinished(project.destroy);
    const collection = await createTextCollection(core, project.id);
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });
    const projectPath = core.util.pathTo.project(project.id);
    const entryFilePath = core.util.pathTo.entryFile(
      project.id,
      collection.id,
      entry.id
    );

    /** Writes an Entry file as it is and commits it, as another Core would. */
    async function commitEntryFile(file: unknown) {
      await Fs.writeJson(entryFilePath, file);
      await core.git.add(projectPath, [entryFilePath]);
      await core.git.commit(projectPath, {
        method: 'update',
        reference: {
          objectType: 'entry',
          id: entry.id,
          collectionId: collection.id,
        },
      });
    }

    // An Entry as a Core that wrote another shape left it. The strict schema
    // of this Core rejects it and no migration carries it forward, which is
    // the state a Project an upgrade has not run on sits in
    await commitEntryFile({
      ...entry,
      coreVersion: '0.1.0',
      values: [{ fieldDefinitionId, content: { en: 'First', de: 'First' } }],
    });
    const first = await core.releases.create({ projectId: project.id });

    // The Release holds the Entry in its tree, so it added it
    const firstChanges = await core.releases.changes({
      projectId: project.id,
      tagId: (await releaseOf(core, project.id, first.version)).tagId,
    });

    expect(firstChanges.entryChanges).toEqual([
      {
        collectionId: collection.id,
        entryId: entry.id,
        changeType: 'added',
        bump: 'minor',
      },
    ]);

    // A later Release rewrites the Entry in the shape this Core reads. It
    // changed, it was not added, and the Release it is compared against is
    // the one holding the older shape
    await commitEntryFile(entry);
    const second = await core.releases.create({ projectId: project.id });
    const secondChanges = await core.releases.changes({
      projectId: project.id,
      tagId: (await releaseOf(core, project.id, second.version)).tagId,
    });

    expect(second.version).toEqual('0.1.1');
    expect(secondChanges.bump).toEqual('patch');
    expect(secondChanges.entryChanges).toEqual([
      {
        collectionId: collection.id,
        entryId: entry.id,
        changeType: 'modified',
        bump: 'patch',
      },
    ]);
  });

  it('should report a Collection whose file this Core cannot read as present, without what changed inside it', async function () {
    const project = await createProject('Older Collection');
    onTestFinished(project.destroy);
    const collection = await createTextCollection(core, project.id);
    await core.releases.create({ projectId: project.id });

    const projectPath = core.util.pathTo.project(project.id);
    const collectionFilePath = core.util.pathTo.collectionFile(
      project.id,
      collection.id
    );
    await Fs.writeJson(collectionFilePath, {
      ...collection,
      coreVersion: '0.1.0',
      fieldDefinitions: { title: { valueType: 'string' } },
    });
    await core.git.add(projectPath, [collectionFilePath]);
    await core.git.commit(projectPath, {
      method: 'update',
      reference: { objectType: 'collection', id: collection.id },
    });
    const second = await core.releases.create({ projectId: project.id });

    // Which part of a Collection changed cannot be read, so the Release
    // reports no change inside it, and never that it was deleted
    const changes = await core.releases.changes({
      projectId: project.id,
      tagId: (await releaseOf(core, project.id, second.version)).tagId,
    });

    expect(second.version).toEqual('0.1.1');
    expect(changes.collectionChanges).toEqual([]);
    expect(changes.fieldChanges).toEqual([]);
    expect(changes.bump).toEqual('patch');
  });

  it('should report an Asset and a Component whose files this Core cannot read as present, without what changed inside them', async function () {
    const project = await createProject('Older Asset and Component');
    onTestFinished(project.destroy);
    const component = await createComponent(project.id);
    const asset = await createAsset(project.id);
    await core.releases.create({ projectId: project.id });

    const projectPath = core.util.pathTo.project(project.id);
    const componentFilePath = core.util.pathTo.componentFile(
      project.id,
      component.id
    );
    const assetFilePath = core.util.pathTo.assetFile(project.id, asset.id);

    // Both files as a Core that wrote another shape left them: the loose
    // migration schema takes them and this Core's own schema does not
    await Fs.writeJson(componentFilePath, {
      ...(await Fs.readJson(componentFilePath)),
      coreVersion: '0.1.0',
      fieldDefinitions: { title: { valueType: 'string' } },
    });
    await Fs.writeJson(assetFilePath, {
      ...(await Fs.readJson(assetFilePath)),
      coreVersion: '0.1.0',
      size: 'a few bytes',
    });
    await core.git.add(projectPath, [componentFilePath, assetFilePath]);
    await core.git.commit(projectPath, {
      method: 'update',
      reference: { objectType: 'project', id: project.id },
    });
    const second = await core.releases.create({ projectId: project.id });

    // Which part of an Asset or a Component changed cannot be read, so the
    // Release reports no change inside either, and never that it was deleted
    const changes = await core.releases.changes({
      projectId: project.id,
      tagId: (await releaseOf(core, project.id, second.version)).tagId,
    });

    expect(second.version).toEqual('0.1.1');
    expect(changes.componentChanges).toEqual([]);
    expect(changes.componentFieldChanges).toEqual([]);
    expect(changes.assetChanges).toEqual([]);
    expect(changes.bump).toEqual('patch');
  });

  it('should hold on a clone and for a Release a synchronization brought in', async function () {
    const remotePath = await createRemote();
    const creator = await cloneOnOwnCore(remotePath);
    const collection = await createTextCollection(
      creator.core,
      creator.project.id
    );
    await creator.core.releases.create({ projectId: creator.project.id });
    await creator.core.entries.create({
      projectId: creator.project.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });
    const second = await creator.core.releases.create({
      projectId: creator.project.id,
    });

    // A clone holds every Release tag, so it reads both of them
    const reader = await cloneOnOwnCore(remotePath);
    const cloned = await releaseOf(
      reader.core,
      reader.project.id,
      second.version
    );

    expect(cloned.author).toEqual({
      name: testUserProps.name,
      email: testUserProps.email,
    });
    expect(cloned.bump).toEqual('minor');
    const clonedChanges = await reader.core.releases.changes({
      projectId: reader.project.id,
      tagId: cloned.tagId,
    });
    expect(clonedChanges.currentVersion).toEqual('0.1.0');
    expect(clonedChanges.entryChanges).toHaveLength(1);

    // A Release made on another computer arrives with a synchronization
    await creator.core.projects.update({
      ...(await creator.core.projects.read({ id: creator.project.id })),
      name: 'Renamed by the other computer',
    });
    const third = await creator.core.releases.create({
      projectId: creator.project.id,
    });
    await reader.core.projects.synchronize({ id: reader.project.id });

    const synced = await releaseOf(
      reader.core,
      reader.project.id,
      third.version
    );
    const syncedChanges = await reader.core.releases.changes({
      projectId: reader.project.id,
      tagId: synced.tagId,
    });

    expect(synced.bump).toEqual('patch');
    expect(syncedChanges.currentVersion).toEqual(second.version);
    expect(syncedChanges.projectChanges).toEqual([
      { changeType: 'nameChanged', bump: 'patch' },
    ]);
  });

  it('should hold on a provisioned copy once its tags are fetched', async function () {
    const remotePath = await createRemote();
    const creator = await cloneOnOwnCore(remotePath);
    const collection = await createTextCollection(
      creator.core,
      creator.project.id
    );
    await creator.core.releases.create({ projectId: creator.project.id });
    await creator.core.entries.create({
      projectId: creator.project.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });
    const second = await creator.core.releases.create({
      projectId: creator.project.id,
    });

    const { core: reader } = createTmpCore();
    await reader.user.set(testUserProps);
    await reader.projects.provision({
      id: creator.project.id,
      url: remotePath,
    });

    const provisioned = await releaseOf(
      reader,
      creator.project.id,
      second.version
    );
    expect(provisioned.bump).toEqual('minor');

    const changes = await reader.releases.changes({
      projectId: creator.project.id,
      tagId: provisioned.tagId,
    });
    expect(changes.currentVersion).toEqual('0.1.0');
    expect(changes.entryChanges).toHaveLength(1);

    // Its history is truncated, so the first Release has no side to compare
    // against and says so rather than reporting no change at all
    const first = await releaseOf(reader, creator.project.id, '0.1.0');
    await expectCoreError(
      reader.releases.changes({
        projectId: creator.project.id,
        tagId: first.tagId,
      }),
      'PreconditionFailed',
      'is not in this copy'
    );
  });
});
