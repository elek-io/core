import Fs from 'fs-extra';
import Path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import core from '../test/setup.js';
import { projectFileSchema } from '../schema/index.js';
import { seedRemoteWithRelease } from '../test/util.js';
import { pullAction } from './pullAction.js';
import { configureCore, getCore } from './util.js';

/**
 * Exercises the happy paths of pullAction in process. The CLI core of
 * this worker resolves its data directory from the worker's
 * ELEK_IO_DATA_DIR, so assertions can use the shared test Core's
 * paths. Failure paths call process.exit and are covered by the
 * subprocess tests in index.cli.test.ts.
 */
describe('pullAction', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;

  beforeAll(async function () {
    configureCore({ readOnly: true });
    // Constructing the CLI core empties the shared tmp directory, so
    // it must exist before the bare remote is seeded there
    getCore();
    seed = await seedRemoteWithRelease();
  }, 60000);

  afterEach(function () {
    vi.unstubAllEnvs();
  });

  it('provisions a Project at production by default', async function () {
    await pullAction({ project: seed.projectId, url: seed.remotePath });

    const projectPath = core.util.pathTo.project(seed.projectId);
    expect(await Fs.pathExists(projectPath)).toBe(true);
    expect(
      await Fs.pathExists(
        core.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);

    const projectFile = projectFileSchema.parse(
      await Fs.readJson(Path.join(projectPath, 'project.json'))
    );
    expect(projectFile.version).toEqual(seed.releaseVersion);
  }, 30000);

  it('prefers ELEK_IO_REF over the given ref', async function () {
    vi.stubEnv('ELEK_IO_REF', seed.previewVersion);

    await pullAction({
      project: seed.projectId,
      url: seed.remotePath,
      ref: 'production',
    });

    const projectFile = projectFileSchema.parse(
      await Fs.readJson(
        Path.join(core.util.pathTo.project(seed.projectId), 'project.json')
      )
    );
    expect(projectFile.version).toEqual(seed.previewVersion);
  }, 30000);
});
