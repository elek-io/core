import Path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, { type Project } from '../test/setup.js';
import {
  createCollection,
  createLocalRemoteRepository,
  ensureCleanGitStatus,
} from '../test/util.js';

describe('ReleaseService push', function () {
  let project: Project;
  let remotePath: string;

  beforeAll(async function () {
    const remoteProject = await createLocalRemoteRepository();
    remotePath = Path.join(core.util.pathTo.tmp, remoteProject.id);
    project = await core.projects.clone({ url: remotePath });
    await createCollection(project.id);
  });

  afterAll(async function () {
    await core.projects.delete({ id: project.id, force: true });
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it('should push the preview tag to origin on preview release', async function () {
    const result = await core.releases.createPreview({
      projectId: project.id,
    });

    const remoteTags = await core.git.tags.list({ path: remotePath });
    const previewTag = remoteTags.list.find(
      (tag) =>
        tag.message.type === 'preview' && tag.message.version === result.version
    );
    expect(previewTag).toBeDefined();
  });

  it('should push production and the release tag to origin on release', async function () {
    const result = await core.releases.create({ projectId: project.id });

    const remoteTags = await core.git.tags.list({ path: remotePath });
    const releaseTag = remoteTags.list.find(
      (tag) =>
        tag.message.type === 'release' && tag.message.version === result.version
    );
    expect(releaseTag).toBeDefined();

    // A fresh clone proves the remote production ref advanced to the release
    await core.projects.delete({ id: project.id, force: true });
    project = await core.projects.clone({ url: remotePath });
    await core.projects.branches.switch({
      id: project.id,
      branch: 'production',
    });
    const clonedProject = await core.projects.read({ id: project.id });
    expect(clonedProject.version).toEqual(result.version);
  }, 30000);
});
