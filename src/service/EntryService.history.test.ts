import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import type ElekIoCore from '../index.node.js';
import core, { testUserProps, uuid, type Value } from '../test/setup.js';
import {
  createLocalRemoteRepository,
  createProject,
  createTmpCore,
} from '../test/util.js';

/**
 * An Entry's history names the first Release that included each of its
 * changes. The Release commit touches `project.json` alone, so the Release of
 * a change is git's ancestry rather than anything the Entry's own commits
 * carry.
 */
describe("An Entry's history and its Releases", function () {
  const fieldDefinitionId = uuid();

  /** A Collection with one required text field, slug `title`. */
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

  /** A Project with one Collection and one Entry in it. */
  async function createProjectWithEntry() {
    const project = await createProject();
    onTestFinished(project.destroy);
    const collection = await createTextCollection(core, project.id);
    const entry = await core.entries.create({
      projectId: project.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });

    return { project, collection, entry };
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

  it('should name the Release that first included a change, and none for a change made after it', async function () {
    const { project, collection, entry } = await createProjectWithEntry();
    const first = await core.releases.create({ projectId: project.id });
    await core.entries.update({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
      values: titleValues('Second'),
    });

    const released = await core.entries.history({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(released).toHaveLength(2);
    expect(released[0]?.message.method).toEqual('update');
    expect(released[0]?.release).toBeNull();
    expect(released[1]?.message.method).toEqual('create');
    expect(released[1]?.release?.version).toEqual(first.version);

    // A preview Release tags a snapshot of draft, so it names no change
    await core.releases.createPreview({ projectId: project.id });
    const previewed = await core.entries.history({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(previewed[0]?.release).toBeNull();

    const second = await core.releases.create({ projectId: project.id });
    const history = await core.entries.history({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });
    const releases = await core.releases.list({ projectId: project.id });

    expect(history[0]?.release?.version).toEqual(second.version);
    expect(history[1]?.release?.version).toEqual(first.version);
    // The Release each change names is one of the Project's own
    expect(
      releases.list.find(
        (release) => release.tagId === history[0]?.release?.tagId
      )?.type
    ).toEqual('release');
  });

  it('should keep the fields of a commit and name the Release of a Collection update that rewrote the Entry', async function () {
    const { project, collection, entry } = await createProjectWithEntry();
    await core.collections.update({
      ...collection,
      projectId: project.id,
      fieldDefinitions: [
        { ...collection.fieldDefinitions[0]!, slug: 'headline' },
      ],
    });

    const unreleased = await core.entries.history({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(unreleased).toHaveLength(2);
    expect(unreleased[0]?.message.method).toEqual('update');
    expect(unreleased[0]?.message.reference.objectType).toEqual('collection');
    expect(unreleased[0]?.release).toBeNull();

    const release = await core.releases.create({ projectId: project.id });
    const history = await core.entries.history({
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    });

    // The fields a commit carried before, whether a Release names it or not
    const fields = ['author', 'datetime', 'hash', 'message', 'release', 'tag'];
    expect(Object.keys(unreleased[0]!).toSorted()).toEqual(fields);
    expect(Object.keys(history[0]!).toSorted()).toEqual(fields);
    expect(history[0]?.message.reference.objectType).toEqual('collection');
    expect(history[0]?.release?.version).toEqual(release.version);
    expect(history[1]?.release?.version).toEqual(release.version);
  });

  it('should name the Release on a provisioned copy, whose history is shallow', async function () {
    const remotePath = await createRemote();
    const working = await core.projects.clone({ url: remotePath });
    onTestFinished(async () => {
      await core.projects.delete({ id: working.id, force: true });
    });
    const collection = await createTextCollection(core, working.id);
    const entry = await core.entries.create({
      projectId: working.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });
    // Pushes main, draft and the tag, so the remote holds the Release
    const release = await core.releases.create({ projectId: working.id });

    const { core: readOnly } = createTmpCore({ isReadOnly: true });
    await readOnly.projects.provision({ id: working.id, url: remotePath });
    const history = await readOnly.entries.history({
      projectId: working.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(history).toHaveLength(1);
    expect(history[0]?.release?.version).toEqual(release.version);
  });

  it('should name the next Release for a change a synchronization carried over one', async function () {
    const remotePath = await createRemote();
    const working = await core.projects.clone({ url: remotePath });
    onTestFinished(async () => {
      await core.projects.delete({ id: working.id, force: true });
    });
    const collection = await createTextCollection(core, working.id);
    const entry = await core.entries.create({
      projectId: working.id,
      collectionId: collection.id,
      values: titleValues('First'),
    });
    await core.projects.synchronize({ id: working.id });

    const other = await cloneOnOwnCore(remotePath);

    // The change is committed before the other computer's Release and reaches
    // the remote only afterwards, so its date sits before a Release that
    // cannot hold it
    await core.entries.update({
      projectId: working.id,
      collectionId: collection.id,
      id: entry.id,
      values: titleValues('Second'),
    });
    await other.core.projects.update({
      ...(await other.core.projects.read({ id: other.project.id })),
      name: 'Released elsewhere',
    });
    const elsewhere = await other.core.releases.create({
      projectId: other.project.id,
    });
    await core.projects.synchronize({ id: working.id });

    const integrated = await core.entries.history({
      projectId: working.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(integrated[0]?.message.method).toEqual('update');
    expect(integrated[0]?.release).toBeNull();
    expect(integrated[1]?.release?.version).toEqual(elsewhere.version);
    // The change is older than the Release that does not hold it, so a date
    // would name that Release
    expect(new Date(integrated[0]!.datetime).getTime()).toBeLessThanOrEqual(
      new Date(integrated[1]!.release!.datetime).getTime()
    );

    const next = await core.releases.create({ projectId: working.id });
    const history = await core.entries.history({
      projectId: working.id,
      collectionId: collection.id,
      id: entry.id,
    });

    expect(history[0]?.release?.version).toEqual(next.version);
    expect(history[0]?.release?.version).not.toEqual(elsewhere.version);
    expect(history[1]?.release?.version).toEqual(elsewhere.version);
  });
});
