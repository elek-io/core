import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Contract, DestinationFile } from '../schema/index.js';
import core, {
  flattenFieldDefinitions,
  uuid,
  type Collection,
  type Entry,
} from '../test/setup.js';
import { contractFileOf, createFakeTheme } from '../test/theme.js';
import {
  createAsset,
  createCollection,
  createComponent,
  createEntry,
  createProject,
  createRefCollection,
  expectCoreError,
} from '../test/util.js';

/**
 * Adding a website from a theme's git address, keeping its Contract once,
 * and asking what it cannot take.
 */
describe('DestinationService', function () {
  let projectId = '';
  let collection: Collection;
  let entry: Entry;
  let destroy: () => Promise<void>;
  let contract: Contract;

  beforeAll(async function () {
    const project = await createProject();
    projectId = project.id;
    destroy = project.destroy;
    collection = await createCollection(projectId);
    await createComponent(projectId);
    const asset = await createAsset(projectId);
    entry = await createEntry(projectId, collection.id, asset.id);
    contract = await core.contracts.generate({
      projectId,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });
  });

  afterAll(async function () {
    await destroy();
  });

  /** A theme that has released the Project's own Contract at one version */
  async function themeOf(given: Contract = contract) {
    const theme = await createFakeTheme();
    await theme.release({
      tag: `v${given.version}`,
      files: contractFileOf(given),
    });
    return theme;
  }

  /**
   * A Collection whose one text field is optional, so an Entry of it can
   * hold no Value for it and still be written through Core
   */
  async function optionalCollection() {
    const fieldDefinitionId = uuid();
    const created = await core.collections.create({
      projectId,
      icon: 'notebook',
      name: {
        singular: { en: 'Note', de: 'Note' },
        plural: { en: 'Notes', de: 'Notes' },
      },
      slug: { singular: 'note', plural: 'notes' },
      description: { en: 'Notes', de: 'Notes' },
      fieldDefinitions: [
        {
          id: fieldDefinitionId,
          slug: 'note',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Note', de: 'Note' },
          description: null,
          defaultValue: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
        },
      ],
    });
    return { collection: created, fieldDefinitionId };
  }

  /** The Project's Contract with one field turned required */
  async function contractDemanding(fieldDefinitionId: string) {
    const generated = await core.contracts.generate({
      projectId,
      name: '@acme/demanding-site',
      version: '1.0.0',
    });
    for (const written of generated.collections) {
      for (const field of flattenFieldDefinitions(written.fieldDefinitions)) {
        if (field.id === fieldDefinitionId) {
          field.isRequired = true;
        }
      }
    }
    return generated;
  }

  /** A website on a fresh theme, under a name no other test uses */
  async function websiteOf(name: string, given: Contract = contract) {
    const theme = await themeOf(given);
    const website = await core.destinations.addWebsite({
      projectId,
      name,
      url: theme.url,
    });
    return { theme, website };
  }

  describe('addWebsite', function () {
    it('writes the website, its Contract and the Mapping, and commits', async function () {
      const { website } = await websiteOf('writes.example');

      expect(website.objectType).toEqual('destination');
      expect(website.kind).toEqual('website');
      expect(website.name).toEqual('writes.example');
      expect(website.contract.version).toEqual('1.0.0');
      expect(
        await core.contracts.read({ projectId, id: website.contract.id })
      ).toMatchObject({ name: '@acme/dealer-site', versions: ['1.0.0'] });
      expect(
        (await core.git.status(core.util.pathTo.project(projectId))).files
      ).toEqual([]);
    });

    it('maps every Collection and field whose id the Project carries', async function () {
      const { website } = await websiteOf('maps.example');
      const mapped = website.mapping.collections[collection.id];

      expect(mapped?.from.collectionId).toEqual(collection.id);
      expect(Object.keys(mapped?.fields ?? {}).toSorted()).toEqual(
        flattenFieldDefinitions(collection.fieldDefinitions)
          .map(({ id }) => id)
          .toSorted()
      );
    });

    it('takes the newest version the theme tagged', async function () {
      const theme = await createFakeTheme();
      await theme.release({
        tag: 'v1.0.0',
        files: contractFileOf(contract),
      });
      await theme.release({
        tag: 'v1.4.0',
        files: contractFileOf({ ...contract, version: '1.4.0' }),
      });

      const website = await core.destinations.addWebsite({
        projectId,
        name: 'newest.example',
        url: theme.url,
      });

      expect(website.contract.version).toEqual('1.4.0');
    });

    it('takes the version it is given instead', async function () {
      const theme = await createFakeTheme();
      await theme.release({ tag: 'v1.0.0', files: contractFileOf(contract) });
      await theme.release({
        tag: 'v1.4.0',
        files: contractFileOf({ ...contract, version: '1.4.0' }),
      });

      const website = await core.destinations.addWebsite({
        projectId,
        name: 'pinned.example',
        url: theme.url,
        version: '1.0.0',
      });

      expect(website.contract.version).toEqual('1.0.0');
    });

    it('refuses a name another website already carries, and adds nothing', async function () {
      await websiteOf('taken.example');
      const before = await core.destinations.count({ projectId });
      const theme = await themeOf();

      await expectCoreError(
        core.destinations.addWebsite({
          projectId,
          name: 'taken.example',
          url: theme.url,
        }),
        'Conflict',
        'already in use'
      );

      expect(await core.destinations.count({ projectId })).toEqual(before);
    });

    it('adds nothing for an address that has tagged no version', async function () {
      const theme = await createFakeTheme();
      const before = await core.destinations.count({ projectId });

      await expectCoreError(
        core.destinations.addWebsite({
          projectId,
          name: 'untagged.example',
          url: theme.url,
        }),
        'PreconditionFailed',
        'tagged no version',
        'theme_without_version'
      );

      expect(await core.destinations.count({ projectId })).toEqual(before);
      expect(
        (await core.git.status(core.util.pathTo.project(projectId))).files
      ).toEqual([]);
    });

    it('adds nothing for an address carrying a credential', async function () {
      const before = await core.destinations.count({ projectId });

      await expectCoreError(
        core.destinations.addWebsite({
          projectId,
          name: 'credential.example',
          url: 'https://nils:ghp_secret@github.com/acme/dealer-site.git',
        }),
        'BadRequest',
        'carries a credential'
      );

      expect(await core.destinations.count({ projectId })).toEqual(before);
    });
  });

  describe('a second website on one theme', function () {
    it('uses the Contract the Project already keeps', async function () {
      const theme = await themeOf();
      const first = await core.destinations.addWebsite({
        projectId,
        name: 'first.example',
        url: theme.url,
      });
      const kept = await core.contracts.count({ projectId });

      const second = await core.destinations.addWebsite({
        projectId,
        name: 'second.example',
        url: theme.url,
      });

      expect(second.contract.id).toEqual(first.contract.id);
      expect(await core.contracts.count({ projectId })).toEqual(kept);
    });

    it('keeps that Contract when the other website is removed', async function () {
      const theme = await themeOf();
      const first = await core.destinations.addWebsite({
        projectId,
        name: 'stays-one.example',
        url: theme.url,
      });
      const second = await core.destinations.addWebsite({
        projectId,
        name: 'stays-two.example',
        url: theme.url,
      });

      await core.destinations.delete({ projectId, id: first.id });

      expect(
        await core.contracts.read({ projectId, id: second.contract.id })
      ).toMatchObject({ versions: ['1.0.0'] });
      expect(
        (await core.destinations.read({ projectId, id: second.id })).contract.id
      ).toEqual(second.contract.id);
    });
  });

  describe('a Project that has a website', function () {
    it('releases as one without a website does', async function () {
      const project = await createProject('Released Project');
      const released = await createCollection(project.id);
      const asset = await createAsset(project.id);
      await createEntry(project.id, released.id, asset.id);
      const theme = await createFakeTheme();
      await theme.release({
        tag: 'v1.0.0',
        files: contractFileOf(
          await core.contracts.generate({
            projectId: project.id,
            name: '@acme/released-site',
            version: '1.0.0',
          })
        ),
      });
      await core.destinations.addWebsite({
        projectId: project.id,
        name: 'released.example',
        url: theme.url,
      });

      const release = await core.releases.create({ projectId: project.id });

      expect(release.version).toBeDefined();
      expect(
        (await core.releases.list({ projectId: project.id })).list.length
      ).toEqual(1);

      await project.destroy();
    });
  });

  describe('read, update, delete, list and count', function () {
    it('throws NotFound for a website the Project does not hold', async function () {
      await expectCoreError(
        core.destinations.read({ projectId, id: uuid() }),
        'NotFound'
      );
    });

    it('renames a website and leaves its Mapping as it was', async function () {
      const { website } = await websiteOf('rename-before.example');

      const renamed = await core.destinations.update({
        projectId,
        id: website.id,
        name: 'rename-after.example',
      });

      expect(renamed.name).toEqual('rename-after.example');
      expect(renamed.mapping).toEqual(website.mapping);
      expect(renamed.updated).not.toBeNull();
    });

    it('replaces a Mapping and leaves the name and the version as they were', async function () {
      const { website } = await websiteOf('remap.example');

      const remapped = await core.destinations.update({
        projectId,
        id: website.id,
        mapping: { collections: {} },
      });

      expect(remapped.mapping).toEqual({ collections: {} });
      expect(remapped.name).toEqual('remap.example');
      expect(remapped.contract).toEqual(website.contract);
    });

    it('refuses a rename onto a name another website carries', async function () {
      const { website } = await websiteOf('clash-one.example');
      await websiteOf('clash-two.example');

      await expectCoreError(
        core.destinations.update({
          projectId,
          id: website.id,
          name: 'clash-two.example',
        }),
        'Conflict'
      );
    });

    it('takes a rename onto the name it already carries', async function () {
      const { website } = await websiteOf('same-name.example');

      await expect(
        core.destinations.update({
          projectId,
          id: website.id,
          name: 'same-name.example',
        })
      ).resolves.toMatchObject({ name: 'same-name.example' });
    });

    it('removes a website and commits', async function () {
      const { website } = await websiteOf('removed.example');

      await core.destinations.delete({ projectId, id: website.id });

      await expectCoreError(
        core.destinations.read({ projectId, id: website.id }),
        'NotFound'
      );
      expect(
        await Fs.pathExists(core.util.pathTo.destination(projectId, website.id))
      ).toEqual(false);
      expect(
        (await core.git.status(core.util.pathTo.project(projectId))).files
      ).toEqual([]);
    });

    it('throws NotFound when removing one the Project does not hold', async function () {
      await expectCoreError(
        core.destinations.delete({ projectId, id: uuid() }),
        'NotFound'
      );
    });

    it('lists what the Project holds and counts the same number', async function () {
      const page = await core.destinations.list({ projectId, limit: 0 });

      expect(page.total).toEqual(await core.destinations.count({ projectId }));
      expect(page.list.length).toEqual(page.total);
    });

    it('lists nothing for a Project whose folders predate Destinations', async function () {
      const older = await createProject('Older Project');
      await Fs.remove(core.util.pathTo.destinations(older.id));

      expect(
        await core.destinations.list({ projectId: older.id })
      ).toMatchObject({ total: 0, list: [] });
      expect(await core.destinations.count({ projectId: older.id })).toEqual(0);

      await older.destroy();
    });
  });

  describe('check and checkAll', function () {
    let website: DestinationFile;

    beforeAll(async function () {
      website = (await websiteOf('checked.example')).website;
    });

    it('is empty for an Entry the website can take', async function () {
      expect(
        await core.destinations.check({
          projectId,
          id: website.id,
          collectionId: collection.id,
          entryId: entry.id,
        })
      ).toEqual([]);
    });

    it('is empty for a whole Project the website can take', async function () {
      expect(
        await core.destinations.checkAll({ projectId, id: website.id })
      ).toEqual([]);
    });

    it("reads Values against the Project's languages rather than the Contract's", async function () {
      // The Contract serves German alone and the Project holds English and
      // German, which is recorded and not checked, because which language
      // fills a field belongs to a Mapping
      const german: Contract = {
        ...contract,
        languages: ['de'],
        version: '3.0.0',
      };
      const theme = await createFakeTheme();
      await theme.release({ tag: 'v3.0.0', files: contractFileOf(german) });
      const germanSite = await core.destinations.addWebsite({
        projectId,
        name: 'german.example',
        url: theme.url,
      });

      expect(
        await core.destinations.checkAll({ projectId, id: germanSite.id })
      ).toEqual([]);

      await core.destinations.delete({ projectId, id: germanSite.id });
    });

    it('names the Collection nothing fills', async function () {
      const unmapped = await core.destinations.update({
        projectId,
        id: website.id,
        mapping: { collections: {} },
      });

      const issues = await core.destinations.checkAll({
        projectId,
        id: unmapped.id,
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        issue: 'collection_not_mapped',
        destinationId: website.id,
        contractCollectionId: collection.id,
      });

      await core.destinations.update({
        projectId,
        id: website.id,
        mapping: website.mapping,
      });
    });

    it('names a required field nothing fills, once rather than per Entry', async function () {
      const required = flattenFieldDefinitions(
        contract.collections[0]?.fieldDefinitions ?? []
      ).find((field) => field.isRequired === true);
      const withoutField = structuredClone(website.mapping);
      delete withoutField.collections[collection.id]?.fields[
        required?.id ?? ''
      ];

      await core.destinations.update({
        projectId,
        id: website.id,
        mapping: withoutField,
      });
      const issues = await core.destinations.checkAll({
        projectId,
        id: website.id,
      });

      expect(
        issues.filter((issue) => issue.issue === 'field_not_mapped')
      ).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        issue: 'field_not_mapped',
        contractFieldDefinitionId: required?.id,
      });

      await core.destinations.update({
        projectId,
        id: website.id,
        mapping: website.mapping,
      });
    });

    it('names a mapped reference pointing at a Collection nothing fills', async function () {
      // One Collection's reference field points at another, and only the
      // first is mapped, so what the reference needs is not deliverable
      const target = await createRefCollection(projectId);
      const source = await createRefCollection(projectId);
      const reference = flattenFieldDefinitions(source.fieldDefinitions).find(
        (field) => field.fieldType === 'entry'
      );
      await core.collections.update({
        ...source,
        projectId,
        fieldDefinitions: source.fieldDefinitions.map((field) =>
          'ofCollections' in field && field.id === reference?.id
            ? { ...field, ofCollections: [target.id] }
            : field
        ),
      });
      const { website: referencing } = await websiteOf(
        'reference.example',
        await core.contracts.generate({
          projectId,
          name: '@acme/reference-site',
          version: '1.0.0',
        })
      );
      const withoutTarget = structuredClone(referencing.mapping);
      delete withoutTarget.collections[target.id];

      await core.destinations.update({
        projectId,
        id: referencing.id,
        mapping: withoutTarget,
      });
      const issues = await core.destinations.checkAll({
        projectId,
        id: referencing.id,
      });

      expect(
        issues.filter((issue) => issue.issue === 'reference_not_mapped')
      ).toMatchObject([
        {
          issue: 'reference_not_mapped',
          contractCollectionId: source.id,
          contractFieldDefinitionId: reference?.id,
        },
      ]);
      expect(
        issues.filter((issue) => issue.issue === 'collection_not_mapped')
      ).toMatchObject([{ contractCollectionId: target.id }]);

      await core.destinations.delete({ projectId, id: referencing.id });
    });

    it('names the Entry, the field and the language of a required Value that is missing', async function () {
      // The Project's own field is optional and its Value is empty, which
      // Core writes without complaint. The theme needs it, so the website
      // is what refuses the Entry
      const optional = await optionalCollection();
      const emptyEntry = await core.entries.create({
        projectId,
        collectionId: optional.collection.id,
        values: {
          note: {
            objectType: 'value',
            valueType: 'string',
            content: { en: null, de: 'Eine Notiz' },
          },
        },
      });
      const demanding = await contractDemanding(optional.fieldDefinitionId);
      const theme = await createFakeTheme();
      await theme.release({
        tag: `v${demanding.version}`,
        files: contractFileOf(demanding),
      });
      const demandingSite = await core.destinations.addWebsite({
        projectId,
        name: 'demanding.example',
        url: theme.url,
      });

      const issues = await core.destinations.check({
        projectId,
        id: demandingSite.id,
        collectionId: optional.collection.id,
        entryId: emptyEntry.id,
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        issue: 'missing_required',
        destinationId: demandingSite.id,
        contractCollectionId: optional.collection.id,
        contractFieldDefinitionId: optional.fieldDefinitionId,
        contractFieldSlug: 'note',
        entryId: emptyEntry.id,
        collectionId: optional.collection.id,
        fieldDefinitionId: optional.fieldDefinitionId,
        fieldSlug: 'note',
        language: 'en',
      });

      await core.destinations.delete({ projectId, id: demandingSite.id });
    });

    it('names an Entry whose Value breaks a constraint of the Contract', async function () {
      const text = flattenFieldDefinitions(collection.fieldDefinitions).find(
        (field) => field.fieldType === 'text'
      );
      const stricter = structuredClone(contract);
      const field = flattenFieldDefinitions(
        stricter.collections[0]?.fieldDefinitions ?? []
      ).find((candidate) => candidate.id === text?.id);
      if (field !== undefined && 'max' in field) {
        field.max = 1;
      }
      stricter.version = '2.0.0';
      const theme = await createFakeTheme();
      await theme.release({ tag: 'v2.0.0', files: contractFileOf(stricter) });
      const strict = await core.destinations.addWebsite({
        projectId,
        name: 'strict.example',
        url: theme.url,
      });

      const issues = await core.destinations.checkAll({
        projectId,
        id: strict.id,
      });

      expect(
        issues.filter((issue) => issue.issue === 'constraint_violation').length
      ).toBeGreaterThan(0);
      expect(issues[0]).toMatchObject({
        issue: 'constraint_violation',
        entryId: entry.id,
        fieldDefinitionId: text?.id,
      });

      await core.destinations.delete({ projectId, id: strict.id });
    });

    it('throws NotFound for a website the Project does not hold', async function () {
      await expectCoreError(
        core.destinations.checkAll({ projectId, id: uuid() }),
        'NotFound'
      );
    });
  });
});
