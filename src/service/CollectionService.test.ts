import type { Collection, Project } from '@elek-io/shared';
import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createCollection, createProject } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collection: Collection;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
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
    const updatedCollection = await core.collections.update({
      projectId: project.id,
      ...collection,
    });

    expect(updatedCollection.description.en).to.equal(
      'The title should be short and catchy, to grab the users attention.'
    );
  });

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
    expect(core.collections.isCollection({ fileType: 'collection' })).to.be
      .false;
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
