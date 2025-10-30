import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GitTag} from '../test/setup.js';
import core, { type Project } from '../test/setup.js';
import { createProject } from '../test/util.js';

describe('GitTagService', function () {
  let project: Project & { destroy: () => Promise<void> };
  let tag: GitTag;
  let projectPath = '';

  beforeAll(async function () {
    project = await createProject();
    projectPath = core.util.pathTo.project(project.id);
  });

  afterAll(async function () {
    await project.destroy();
  });

  it('should be able to create a new tag', async function () {
    tag = await core.git.tags.create({
      path: projectPath,
      message: 'Initial tag',
    });

    expect(tag.message).toEqual('Initial tag');
  });

  it('should be able to read a tag', async function () {
    const readTag = await core.git.tags.read({
      path: projectPath,
      id: tag.id,
    });

    expect(readTag.message).toEqual('Initial tag');
  });

  it('should throw when trying to update a tag', async function () {
    await expect(core.git.tags.update()).rejects.toThrow();
  });

  it('should be able to count all tags', async function () {
    const numberOfTags = await core.git.tags.count({
      path: projectPath,
    });

    expect(numberOfTags).toEqual(1);
  });

  it('should be able to list all tags', async function () {
    const tags = await core.git.tags.list({
      path: projectPath,
    });

    expect(tags.list.length).toEqual(1);
  });

  it('should be able to delete the tag', async function () {
    await core.git.tags.delete({
      path: projectPath,
      id: tag.id,
    });

    const numberOfTags = await core.git.tags.count({ path: projectPath });

    expect(numberOfTags).toEqual(0);
  });

  it('should be able to create a new tag at specific commit hash', async function () {
    tag = await core.git.tags.create({
      path: projectPath,
      message: 'Tagged HEAD',
      hash: 'HEAD',
    });

    expect(tag.message).toEqual('Tagged HEAD');
  });
});
