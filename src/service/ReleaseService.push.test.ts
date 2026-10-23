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

  it('should push draft and the preview tag to origin on preview release', async function () {
    const result = await core.releases.createPreview({
      projectId: project.id,
    });

    const remoteTags = await core.git.tags.list({ path: remotePath });
    const previewTag = remoteTags.list.find(
      (tag) =>
        tag.message.type === 'preview' && tag.message.version === result.version
    );
    expect(previewTag).toBeDefined();
    // The Collection was never synchronized, the preview pushed it
    expect(await core.git.revParse(remotePath, 'draft')).toEqual(
      await core.git.revParse(core.util.pathTo.project(project.id), 'draft')
    );
  });

  it('should push main, draft and the release tag to origin on release', async function () {
    const result = await core.releases.create({ projectId: project.id });

    const remoteTags = await core.git.tags.list({ path: remotePath });
    const releaseTag = remoteTags.list.find(
      (tag) =>
        tag.message.type === 'release' && tag.message.version === result.version
    );
    expect(releaseTag).toBeDefined();
    // A Release never leaves main and draft apart on the remote
    for (const branch of ['main', 'draft']) {
      expect(await core.git.revParse(remotePath, branch)).toEqual(
        await core.git.revParse(core.util.pathTo.project(project.id), branch)
      );
    }

    // A fresh clone lands on draft, which holds the Release
    await core.projects.delete({ id: project.id, force: true });
    project = await core.projects.clone({ url: remotePath });
    const clonedProject = await core.projects.read({ id: project.id });
    expect(clonedProject.version).toEqual(result.version);
  });
});
