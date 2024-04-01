import type { Project, Value } from '@elek-io/shared';
import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createProject, createValue } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let value: Value;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential('should be able to create a new Value', async function () {
    value = await createValue(project.id);

    expect(value.id).to.not.be.undefined;
  });

  it.sequential('should be able to read an Value', async function () {
    const readValue = await core.sharedValues.read({
      projectId: project.id,
      id: value.id,
      language: value.language,
    });

    expect(readValue.id).to.equal(value.id);
  });

  it.sequential('should be able to update an Value', async function () {
    value.content = 'Hello World!';
    const updatedCollection = await core.sharedValues.update({
      projectId: project.id,
      ...value,
    });
    expect(updatedCollection.content).to.equal('Hello World!');
  });

  it.sequential('should be able to list all Values', async function () {
    const values = await core.sharedValues.list({ projectId: project.id });
    expect(values.list.length).to.equal(1);
    expect(values.total).to.equal(1);
    expect(values.list.find((a) => a.id === value.id)?.id).to.equal(value.id);
  });

  it.sequential('should be able to count all Values', async function () {
    const counted = await core.sharedValues.count({ projectId: project.id });
    expect(counted).to.equal(1);
  });

  it.sequential('should be able to identify an Value', async function () {
    expect(core.sharedValues.isValue(value)).to.be.true;
    expect(core.sharedValues.isValue({ fileType: 'value' })).to.be.false;
  });

  it.sequential('should be able to delete an Value', async function () {
    await core.sharedValues.delete({
      projectId: project.id,
      id: value.id,
      language: value.language,
    });

    expect(
      await Fs.pathExists(
        core.util.pathTo.sharedValueFile(project.id, value.id, value.language)
      )
    ).to.be.false;
  });
});
