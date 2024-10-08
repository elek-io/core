import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, { type Collection, type Project } from '../test/setup.js';
import {
  createCollection,
  createProject,
  ensureCleanGitStatus,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it.sequential('should be able to create a new Collection', async function () {
    collection = await createCollection(project.id);

    expect(collection.id).to.not.be.undefined;
  });

  it.sequential('should be able to read an Collection', async function () {
    const readCollection = await core.collections.read({
      projectId: project.id,
      id: collection.id,
    });

    expect(readCollection.name.singular.en).to.equal(
      collection.name.singular.en
    );
  });

  it.sequential('should be able to update an Collection', async function () {
    collection.description.en =
      'The title should be short and catchy, to grab the users attention.';
    collection = await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    expect(collection.description.en).to.equal(
      'The title should be short and catchy, to grab the users attention.'
    );
  });

  it.sequential(
    'should be able to get a Collection of a specific commit',
    async function () {
      const collectionFromHistory = await core.collections.read({
        projectId: project.id,
        id: collection.id,
        commitHash: collection.history.pop()?.hash,
      });

      expect(collectionFromHistory.description.en).to.equal(
        'A Collection that contains our Products'
      );
    }
  );

  it.sequential('should be able to list all Collections', async function () {
    const collections = await core.collections.list({ projectId: project.id });

    expect(collections.list.length).to.equal(1);
    expect(collections.total).to.equal(1);
    expect(collections.list.find((a) => a.id === collection.id)?.id).to.equal(
      collection.id
    );
  });

  it.sequential('should be able to count all Collections', async function () {
    const counted = await core.collections.count({ projectId: project.id });

    expect(counted).to.equal(1);
  });

  it.sequential('should be able to identify an Collection', async function () {
    expect(core.collections.isCollection(collection)).to.be.true;
    expect(
      core.collections.isCollection({ objectType: 'collection' })
    ).to.be.false;
  });

  it.sequential('should be able to delete an Collection', async function () {
    await core.collections.delete({ projectId: project.id, id: collection.id });

    expect(
      await Fs.pathExists(
        core.util.pathTo.collection(project.id, collection.id)
      )
    ).to.be.false;
    expect(
      await Fs.pathExists(
        core.util.pathTo.collectionFile(project.id, collection.id)
      )
    ).to.be.false;
  });
});
