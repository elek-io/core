import Fs from 'fs-extra';
import Path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import core from '../test/setup.js';
import { projectFileSchema } from '../schema/index.js';
import { seedRemoteWithRelease } from '../test/util.js';
import { CoreError } from '../util/shared.js';
import { provisionAction } from './provisionAction.js';
import { configureCore, getCore } from './util.js';

/**
 * Exercises provisionAction in process. The CLI core of this worker
 * resolves its data directory from the worker's ELEK_IO_DATA_DIR, so
 * assertions can use the shared test Core's paths. Error presentation
 * (message and exit code) lives in the binary entry and is covered by
 * the subprocess tests in index.cli.test.ts.
 */
describe('provisionAction', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;

  beforeAll(async function () {
    configureCore({ isReadOnly: true });
    // Constructing the CLI core empties the shared tmp directory, so
    // it must exist before the bare remote is seeded there
    getCore();
    seed = await seedRemoteWithRelease();
  }, 60000);

  afterEach(function () {
    vi.unstubAllEnvs();
  });

  it('provisions a Project at production by default', async function () {
    await provisionAction({ project: seed.projectId, url: seed.remotePath });

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

  it('prefers the ELEK_IO_CHANNEL environment variable over the given ref', async function () {
    vi.stubEnv('ELEK_IO_CHANNEL', 'draft');

    await provisionAction({
      project: seed.projectId,
      url: seed.remotePath,
      ref: 'production',
    });

    // The draft channel follows the work branch
    expect(
      await core.git.branches.current(core.util.pathTo.project(seed.projectId))
    ).toEqual('work');
  }, 30000);

  it('rejects with the typed error instead of exiting the process', async function () {
    let error: unknown = null;
    try {
      await provisionAction({
        project: seed.projectId,
        url: seed.remotePath,
        ref: '9.9.9',
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CoreError);
    expect(error instanceof CoreError && error.type).toEqual('NotFound');
  }, 30000);
});
