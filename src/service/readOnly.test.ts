import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { uuid, type Project } from '../test/setup.js';
import { createLocalRemoteRepository } from '../test/util.js';
import { CoreError } from '../util/shared.js';
import ElekIoCore from '../index.node.js';

/**
 * Awaits the given promise and asserts it rejects with the
 * typed read-only error
 */
async function expectReadOnlyError(promise: Promise<unknown>) {
  let error: unknown = null;
  try {
    await promise;
  } catch (e) {
    error = e;
  }

  expect(error).toBeInstanceOf(CoreError);
  expect(error instanceof CoreError && error.type).toEqual(
    'PreconditionFailed'
  );
  expect(error instanceof CoreError && error.message).toContain('read-only');
}

describe('Read-only mode', function () {
  let readOnlyCore: ElekIoCore;
  let readOnlyDataDir: string;
  let remotePath: string;
  let project: Project;

  beforeAll(async function () {
    // The remote is seeded by the shared, writable Core
    const remoteProject = await createLocalRemoteRepository();
    remotePath = Path.join(core.util.pathTo.tmp, remoteProject.id);

    readOnlyDataDir = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    readOnlyCore = new ElekIoCore({
      readOnly: true,
      dataDir: readOnlyDataDir,
    });
  });

  afterAll(async function () {
    await readOnlyCore.dispose();
    await Fs.remove(readOnlyDataDir);
  });

  it('should clone a Project without a User set', async function () {
    expect(await readOnlyCore.user.get()).toBeNull();

    project = await readOnlyCore.projects.clone({ url: remotePath });

    const readProject = await readOnlyCore.projects.read({ id: project.id });
    expect(readProject.id).toEqual(project.id);

    const status = await readOnlyCore.git.status(
      readOnlyCore.util.pathTo.project(project.id)
    );
    expect(status.length).toEqual(0);
  });

  it('should allow switching branches', async function () {
    await readOnlyCore.projects.branches.switch({
      id: project.id,
      branch: 'production',
    });

    const branch = await readOnlyCore.projects.branches.current({
      id: project.id,
    });
    expect(branch).toEqual('production');

    await readOnlyCore.projects.branches.switch({
      id: project.id,
      branch: 'work',
    });
  });

  it('should reject Project mutations', async function () {
    await expectReadOnlyError(
      readOnlyCore.projects.create({
        name: 'Read-only',
        description: 'Should never be created',
        settings: { language: { default: 'en', supported: ['en'] } },
      })
    );
    await expectReadOnlyError(
      readOnlyCore.projects.update({ ...project, name: 'New name' })
    );
    await expectReadOnlyError(readOnlyCore.projects.delete({ id: project.id }));
    await expectReadOnlyError(
      readOnlyCore.projects.synchronize({ id: project.id })
    );
    await expectReadOnlyError(
      readOnlyCore.projects.setRemoteOriginUrl({
        id: project.id,
        url: remotePath,
      })
    );
    await expectReadOnlyError(readOnlyCore.projects.upgrade({ id: project.id }));
  });

  it('should reject content mutations', async function () {
    await expectReadOnlyError(
      readOnlyCore.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Product' },
          plural: { en: 'Products' },
        },
        slug: { singular: 'product', plural: 'products' },
        description: { en: 'Should never be created' },
        fieldDefinitions: [],
      })
    );
    await expectReadOnlyError(
      readOnlyCore.components.create({
        projectId: project.id,
        name: { en: 'Hero' },
        slug: 'hero',
        description: { en: 'Should never be created' },
        fieldDefinitions: [],
      })
    );
    await expectReadOnlyError(
      readOnlyCore.entries.create({
        projectId: project.id,
        collectionId: uuid(),
        values: {},
      })
    );
    await expectReadOnlyError(
      readOnlyCore.assets.create({
        projectId: project.id,
        filePath: Path.resolve('src/test/data/150x150.png'),
        name: 'Read-only',
        description: 'Should never be created',
      })
    );
  });

  it('should reject Releases', async function () {
    await expectReadOnlyError(
      readOnlyCore.releases.create({ projectId: project.id })
    );
    await expectReadOnlyError(
      readOnlyCore.releases.createPreview({ projectId: project.id })
    );
  });

  it('should allow read operations', async function () {
    const { total } = await readOnlyCore.collections.list({
      projectId: project.id,
      limit: 0,
    });
    expect(total).toEqual(0);

    const { list } = await readOnlyCore.projects.list();
    expect(list.some((p) => p.id === project.id)).toBe(true);
  });
});
