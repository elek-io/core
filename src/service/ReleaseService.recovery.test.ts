import Path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import core, { type Project } from '../test/setup.js';
import {
  createCollection,
  createLocalRemoteRepository,
  ensureCleanGitStatus,
} from '../test/util.js';
import { CoreError } from '../util/shared.js';

/**
 * A release is a transaction the User retries, not a half-finished state
 * they resume: a partly created release cannot be completed through the
 * public API. So a failure has to unwind everything it did.
 */
describe('ReleaseService recovery', function () {
  let project: Project;
  let remotePath: string;
  let projectPath: string;

  let counter = 0;

  /** A change to release, with a slug of its own so it never clashes. */
  async function addACollection() {
    counter += 1;
    await core.collections.create({
      projectId: project.id,
      icon: 'home',
      name: {
        singular: { en: `Thing ${counter}`, de: `Thing ${counter}` },
        plural: { en: `Things ${counter}`, de: `Things ${counter}` },
      },
      description: { en: 'A change', de: 'A change' },
      slug: { singular: `thing-${counter}`, plural: `things-${counter}` },
      fieldDefinitions: [],
    });
  }

  beforeAll(async function () {
    const remoteProject = await createLocalRemoteRepository();
    remotePath = Path.join(core.util.pathTo.tmp, remoteProject.id);
    project = await core.projects.clone({ url: remotePath });
    projectPath = core.util.pathTo.project(project.id);
    await createCollection(project.id);
    // One real release first, so every test below starts from a Project
    // that has a local production branch and a release to bump from
    await core.releases.create({ projectId: project.id });
  }, 60000);

  beforeEach(async function () {
    await addACollection();
  });

  afterAll(async function () {
    await core.projects.delete({ id: project.id, force: true });
  });

  afterEach(async function ({ task }) {
    vi.restoreAllMocks();
    await ensureCleanGitStatus(task, project.id);
  });

  async function snapshot() {
    return {
      work: await core.git.revParse(projectPath, 'work'),
      production: await core.git.revParse(projectPath, 'production'),
      branch: await core.git.branches.current(projectPath),
      tags: (await core.git.tags.list({ path: projectPath })).list.map(
        (tag) => tag.id
      ),
      version: (await core.projects.read({ id: project.id })).version,
    };
  }

  it('should leave nothing behind when a release fails at the tag', async function () {
    const before = await snapshot();

    vi.spyOn(core.git.tags, 'create').mockRejectedValueOnce(
      CoreError.internal('Simulated tag failure')
    );

    await expect(
      core.releases.create({ projectId: project.id })
    ).rejects.toThrow('Simulated tag failure');

    expect(await snapshot()).toEqual(before);
  });

  it('should leave nothing behind when a release fails at the push', async function () {
    const before = await snapshot();

    vi.spyOn(core.git, 'push').mockRejectedValueOnce(
      CoreError.internal('Simulated push failure')
    );

    await expect(
      core.releases.create({ projectId: project.id })
    ).rejects.toThrow('Simulated push failure');

    // The tag was created before the push, so recovery has to remove it
    expect(await snapshot()).toEqual(before);
  });

  it('should leave nothing behind when a preview fails at the push', async function () {
    // createPreview never leaves work, so switching back to work undoes
    // nothing at all and its version commit and tag used to survive
    const before = await snapshot();

    vi.spyOn(core.git, 'push').mockRejectedValueOnce(
      CoreError.internal('Simulated push failure')
    );

    await expect(
      core.releases.createPreview({ projectId: project.id })
    ).rejects.toThrow('Simulated push failure');

    expect(await snapshot()).toEqual(before);
  });

  it('should leave nothing behind when a preview fails at the tag', async function () {
    const before = await snapshot();

    vi.spyOn(core.git.tags, 'create').mockRejectedValueOnce(
      CoreError.internal('Simulated tag failure')
    );

    await expect(
      core.releases.createPreview({ projectId: project.id })
    ).rejects.toThrow('Simulated tag failure');

    expect(await snapshot()).toEqual(before);
  });

  it('should still create a release after a failed one', async function () {
    // The point of unwinding: a retry starts from the state the first
    // attempt started from, so it makes the release that one would have
    const before = await snapshot();

    const result = await core.releases.create({ projectId: project.id });

    expect(result.version).not.toEqual(before.version);
    const after = await snapshot();
    expect(after.branch).toEqual('work');
    expect(after.tags.length).toEqual(before.tags.length + 1);
  });
});
