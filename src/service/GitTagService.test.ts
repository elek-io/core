import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { GitTag } from '../test/setup.js';
import core, { type Project } from '../test/setup.js';
import { createProject, ensureCleanGitStatus } from '../test/util.js';

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

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should be able to create a new tag', async function () {
    tag = await core.git.tags.create({
      path: projectPath,
      message: { type: 'release', version: '1.0.0' },
    });

    expect(tag.message).toEqual({ type: 'release', version: '1.0.0' });
  });

  it('should be able to read a tag', async function () {
    const readTag = await core.git.tags.read({
      path: projectPath,
      id: tag.id,
    });

    expect(readTag.message).toEqual({ type: 'release', version: '1.0.0' });
  });

  it('should return an error when trying to update a tag', function () {
    expect(() => core.git.tags.update()).toThrow(
      expect.objectContaining({
        type: 'BadRequest',
      })
    );
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

  it('should preserve the full author email when listing tags', async function () {
    const tags = await core.git.tags.list({
      path: projectPath,
    });

    const listedTag = tags.list[0];
    expect(listedTag).toBeDefined();
    // The email should not have its last character truncated (double-slice bug)
    expect(listedTag!.author.email).toEqual('john.doe@test.com');
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
      message: { type: 'upgrade', coreVersion: '0.16.0' },
      hash: 'HEAD',
    });

    expect(tag.message).toEqual({ type: 'upgrade', coreVersion: '0.16.0' });
  });
});
