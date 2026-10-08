import Fs from 'fs-extra';
import Path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import core, { uuid, type Project } from '../test/setup.js';
import { createProject, seedRemoteWithRelease } from '../test/util.js';
import { CoreError } from '../util/shared.js';

/**
 * Awaits the given promise and asserts it rejects with the typed
 * provisioned copy error
 */
async function expectProvisionedError(promise: Promise<unknown>) {
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
  expect(error instanceof CoreError && error.message).toContain(
    'provisioned copy'
  );
}

describe('Provisioned copy', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let provisioned: Project;
  let workingCopy: Awaited<ReturnType<typeof createProject>>;

  beforeAll(async function () {
    seed = await seedRemoteWithRelease();
    // Provisioning also works on a writable Core, so the marked copy
    // lands in the shared data directory of this worker
    provisioned = (
      await core.projects.provision({
        id: seed.projectId,
        url: seed.remotePath,
      })
    ).project;
    workingCopy = await createProject();
  }, 90000);

  it('should expose isProvisioned on the Project', async function () {
    expect(provisioned.isProvisioned).toBe(true);

    const read = await core.projects.read({ id: seed.projectId });
    expect(read.isProvisioned).toBe(true);

    const { list } = await core.projects.list();
    expect(list.find((p) => p.id === seed.projectId)?.isProvisioned).toBe(true);
    expect(list.find((p) => p.id === workingCopy.id)?.isProvisioned).toBe(
      false
    );
  });

  it('should reject Project mutations on a provisioned copy', async function () {
    await expectProvisionedError(
      core.projects.update({ ...provisioned, name: 'New name' })
    );
    await expectProvisionedError(
      core.projects.synchronize({ id: seed.projectId })
    );
    await expectProvisionedError(
      core.projects.setRemoteOriginUrl({
        id: seed.projectId,
        url: seed.remotePath,
      })
    );
    await expectProvisionedError(core.projects.upgrade({ id: seed.projectId }));
  });

  it('should reject content mutations on a provisioned copy', async function () {
    await expectProvisionedError(
      core.collections.create({
        projectId: seed.projectId,
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
    await expectProvisionedError(
      core.collections.update({
        projectId: seed.projectId,
        id: seed.collectionId,
        icon: 'home',
        name: {
          singular: { en: 'Product' },
          plural: { en: 'Products' },
        },
        slug: { singular: 'product', plural: 'products' },
        description: { en: 'Should never be updated' },
        fieldDefinitions: [],
      })
    );
    await expectProvisionedError(
      core.components.create({
        projectId: seed.projectId,
        name: { en: 'Hero' },
        slug: 'hero',
        description: { en: 'Should never be created' },
        fieldDefinitions: [],
      })
    );
    await expectProvisionedError(
      core.entries.create({
        projectId: seed.projectId,
        collectionId: uuid(),
        values: {},
      })
    );
    await expectProvisionedError(
      core.assets.create({
        projectId: seed.projectId,
        filePath: Path.resolve('src/test/data/150x150.png'),
        name: 'Provisioned',
        description: 'Should never be created',
      })
    );
    await expectProvisionedError(
      core.assets.delete({
        projectId: seed.projectId,
        id: seed.assetId,
        extension: seed.assetExtension,
      })
    );
  });

  it('should reject Releases on a provisioned copy', async function () {
    await expectProvisionedError(
      core.releases.create({ projectId: seed.projectId })
    );
    await expectProvisionedError(
      core.releases.createPreview({ projectId: seed.projectId })
    );
  });

  it('should reject a direct git commit into a provisioned copy', async function () {
    await expectProvisionedError(
      core.git.commit(core.util.pathTo.project(seed.projectId), {
        method: 'update',
        reference: { objectType: 'project', id: seed.projectId },
      })
    );
  });

  it('should reject a direct git tag into a provisioned copy', async function () {
    await expectProvisionedError(
      core.git.tags.create({
        path: core.util.pathTo.project(seed.projectId),
        message: { type: 'release', version: '99.0.0' },
      })
    );
  });

  it('should reject a direct git tag delete on a provisioned copy', async function () {
    await expectProvisionedError(
      core.git.tags.delete({
        path: core.util.pathTo.project(seed.projectId),
        id: uuid(),
      })
    );
  });

  it('should reject a direct git push from a provisioned copy', async function () {
    await expectProvisionedError(
      core.git.push(core.util.pathTo.project(seed.projectId))
    );
  });

  it('should reject switching branches on a provisioned copy', async function () {
    await expectProvisionedError(
      core.projects.branches.switch({
        id: seed.projectId,
        branch: 'work',
      })
    );
  });

  it('should delete a provisioned copy without force', async function () {
    await core.projects.delete({ id: seed.projectId });

    expect(await Fs.pathExists(core.util.pathTo.project(seed.projectId))).toBe(
      false
    );
  }, 30000);
});
