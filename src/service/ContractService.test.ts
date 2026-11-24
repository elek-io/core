import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, {
  flattenFieldDefinitions,
  uuid,
  type Collection,
  type EntryFieldDefinition,
} from '../test/setup.js';
import {
  createCollection,
  createComponent,
  createProject,
  expectCoreError,
} from '../test/util.js';

/**
 * Generating a Contract from a Project, and keeping one in the Project once
 * per origin. Reading one from a theme's git address is in
 * `ContractService.theme.test.ts`, which needs repositories.
 */
describe('ContractService', function () {
  let projectId = '';
  let collection: Collection;
  let componentId = '';
  let destroy: () => Promise<void>;

  beforeAll(async function () {
    const project = await createProject();
    projectId = project.id;
    destroy = project.destroy;
    collection = await createCollection(projectId);
    componentId = (await createComponent(projectId)).id;
  });

  afterAll(async function () {
    await destroy();
  });

  /** A Contract as a theme would carry it, generated from the Project */
  async function generated(name = '@acme/dealer-site', version = '1.0.0') {
    return core.contracts.generate({ projectId, name, version });
  }

  describe('generate', function () {
    it('writes every Collection and Component of the Project, with the given name and version', async function () {
      const contract = await generated();

      expect(contract.name).toEqual('@acme/dealer-site');
      expect(contract.version).toEqual('1.0.0');
      expect(contract.collections.map(({ id }) => id)).toEqual([collection.id]);
      expect(contract.components.map(({ id }) => id)).toEqual([componentId]);
    });

    it('keeps the field definition ids a Mapping binds to', async function () {
      const contract = await generated();
      const written = contract.collections[0];

      expect(written?.fieldDefinitions).toEqual(collection.fieldDefinitions);
    });

    it("writes the Project's own languages when none are given", async function () {
      expect((await generated()).languages).toEqual(['en', 'de']);
    });

    it('writes the languages it is given instead', async function () {
      const contract = await core.contracts.generate({
        projectId,
        name: '@acme/dealer-site',
        version: '1.0.0',
        languages: 'any',
      });

      expect(contract.languages).toEqual('any');
    });

    it('follows the Project after a Collection changed', async function () {
      const before = await generated();
      const renamed = await core.collections.update({
        ...collection,
        projectId,
        description: { en: 'Renamed', de: 'Renamed' },
      });

      const after = await generated();

      expect(before.collections[0]?.description).not.toEqual({
        en: 'Renamed',
        de: 'Renamed',
      });
      expect(after.collections[0]?.description).toEqual({
        en: 'Renamed',
        de: 'Renamed',
      });

      await core.collections.update({ ...collection, projectId });
      expect(renamed.id).toEqual(collection.id);
    });

    it('refuses a name that is no package-like name', async function () {
      await expectCoreError(
        core.contracts.generate({
          projectId,
          name: 'Dealer Site',
          version: '1.0.0',
        }),
        'BadRequest'
      );
    });

    it('refuses a version that is no semantic version', async function () {
      await expectCoreError(
        core.contracts.generate({
          projectId,
          name: '@acme/dealer-site',
          version: '1.0',
        }),
        'BadRequest'
      );
    });

    it('refuses a Project that does not exist', async function () {
      await expectCoreError(
        core.contracts.generate({
          projectId: uuid(),
          name: '@acme/dealer-site',
          version: '1.0.0',
        }),
        'NotFound'
      );
    });

    it('names the Collection it would leave out and writes nothing', async function () {
      const dangling = uuid();
      const reference = flattenFieldDefinitions(
        collection.fieldDefinitions
      ).find((definition) => definition.fieldType === 'entry');
      (reference as EntryFieldDefinition).ofCollections = [dangling];
      await core.collections.update({
        ...collection,
        projectId,
        fieldDefinitions: collection.fieldDefinitions,
      });

      await expectCoreError(
        generated(),
        'BadRequest',
        `collection "${dangling}"`
      );

      (reference as EntryFieldDefinition).ofCollections = [collection.id];
      await core.collections.update({
        ...collection,
        projectId,
        fieldDefinitions: collection.fieldDefinitions,
      });
      await expect(generated()).resolves.toBeDefined();
    });
  });

  describe('keep', function () {
    const origin = { kind: 'git', url: '/srv/themes/dealer-site.git' } as const;

    it('writes the Contract and the copy of its version, and commits', async function () {
      const kept = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });

      expect(kept.objectType).toEqual('contract');
      expect(kept.name).toEqual('@acme/dealer-site');
      expect(kept.origin).toEqual(origin);
      expect(kept.versions).toEqual(['1.0.0']);
      expect(
        await core.contracts.readVersion({
          projectId,
          id: kept.id,
          version: '1.0.0',
        })
      ).toMatchObject({ version: '1.0.0', commit: 'a1b2c3d' });
      expect(
        (await core.git.status(core.util.pathTo.project(projectId))).files
      ).toEqual([]);
    });

    it('returns the Contract the Project already keeps for an origin', async function () {
      const first = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });
      const second = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });

      expect(second.id).toEqual(first.id);
      expect(await core.contracts.count({ projectId })).toEqual(1);
    });

    it('adds a copy for a version the Project does not hold yet', async function () {
      const first = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });
      const next = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated('@acme/dealer-site', '1.1.0'),
        commit: 'e4f5a6b',
      });

      expect(next.id).toEqual(first.id);
      expect(next.versions).toEqual(['1.1.0', '1.0.0']);
      expect(
        await core.contracts.readVersion({
          projectId,
          id: next.id,
          version: '1.0.0',
        })
      ).toMatchObject({ commit: 'a1b2c3d' });
    });

    it('leaves the copy of a version it already holds as it was', async function () {
      const kept = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });
      await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'another-commit',
      });

      expect(
        await core.contracts.readVersion({
          projectId,
          id: kept.id,
          version: '1.0.0',
        })
      ).toMatchObject({ commit: 'a1b2c3d' });
    });

    it('keeps a second Contract for a second origin', async function () {
      await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });
      const other = await core.contracts.keep({
        projectId,
        origin: { kind: 'git', url: '/srv/themes/other-site.git' },
        contract: await generated('@acme/other-site'),
        commit: 'f6a7b8c',
      });

      expect(await core.contracts.count({ projectId })).toEqual(2);
      expect(other.name).toEqual('@acme/other-site');
    });

    it('follows the name the Contract at an origin carries', async function () {
      const first = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated(),
        commit: 'a1b2c3d',
      });
      const renamed = await core.contracts.keep({
        projectId,
        origin,
        contract: await generated('@acme/renamed-site', '2.0.0'),
        commit: 'e4f5a6b',
      });

      expect(renamed.id).toEqual(first.id);
      expect(renamed.name).toEqual('@acme/renamed-site');
      expect(renamed.updated).not.toBeNull();
    });

    it('refuses to keep one while Core is read-only', async function () {
      const readOnly = new (await import('../index.node.js')).default({
        dataDir: core.options.dataDir,
        isReadOnly: true,
      });
      await expectCoreError(
        readOnly.contracts.keep({
          projectId,
          origin,
          contract: await generated(),
          commit: 'a1b2c3d',
        }),
        'PreconditionFailed',
        'read-only',
        'read_only_mode'
      );
      await readOnly.dispose();
    });
  });

  describe('read, list and count', function () {
    it('throws NotFound for a Contract the Project does not keep', async function () {
      await expectCoreError(
        core.contracts.read({ projectId, id: uuid() }),
        'NotFound'
      );
    });

    it('throws NotFound for a version the Project holds no copy of', async function () {
      const kept = await core.contracts.keep({
        projectId,
        origin: { kind: 'git', url: '/srv/themes/listed.git' },
        contract: await generated(),
        commit: 'a1b2c3d',
      });

      await expectCoreError(
        core.contracts.readVersion({
          projectId,
          id: kept.id,
          version: '9.9.9',
        }),
        'NotFound'
      );
    });

    it('lists what the Project keeps and counts the same number', async function () {
      await core.contracts.keep({
        projectId,
        origin: { kind: 'git', url: '/srv/themes/listed.git' },
        contract: await generated(),
        commit: 'a1b2c3d',
      });

      const page = await core.contracts.list({ projectId });

      expect(page.total).toEqual(await core.contracts.count({ projectId }));
      expect(page.list.length).toEqual(page.total);
    });

    it('lists nothing for a Project whose folders predate Contracts', async function () {
      const older = await createProject('Older Project');
      await Fs.remove(core.util.pathTo.contracts(older.id));

      expect(await core.contracts.list({ projectId: older.id })).toMatchObject({
        total: 0,
        list: [],
      });
      expect(await core.contracts.count({ projectId: older.id })).toEqual(0);

      await older.destroy();
    });

    it('answers a page of its own for a limit and an offset', async function () {
      const project = await createProject('Paged Project');
      await createCollection(project.id);
      for (const name of ['@acme/one', '@acme/two', '@acme/three']) {
        await core.contracts.keep({
          projectId: project.id,
          origin: { kind: 'git', url: `/srv/themes/${name}.git` },
          contract: await core.contracts.generate({
            projectId: project.id,
            name,
            version: '1.0.0',
          }),
          commit: 'a1b2c3d',
        });
      }

      const page = await core.contracts.list({
        projectId: project.id,
        limit: 2,
        offset: 1,
      });

      expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
      expect(page.list.length).toEqual(2);
      expect(
        (await core.contracts.list({ projectId: project.id, limit: 0 })).list
          .length
      ).toEqual(3);

      await project.destroy();
    });
  });

  describe('a Project with no Contract', function () {
    it('releases, synchronizes and upgrades as one without the folders does', async function () {
      const project = await createProject('Untouched Project');
      await createCollection(project.id);

      const release = await core.releases.create({ projectId: project.id });
      await core.projects.upgrade({ id: project.id, force: true });

      expect(release.version).toBeDefined();
      expect(
        (await core.projects.read({ id: project.id })).coreVersion
      ).toEqual(core.coreVersion);
      expect(await core.destinations.count({ projectId: project.id })).toEqual(
        0
      );
      expect(await core.contracts.count({ projectId: project.id })).toEqual(0);

      await project.destroy();
    });
  });
});
