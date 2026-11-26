import Fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Contract, DestinationFile, Value } from '../schema/index.js';
import core, {
  CoreError,
  flattenFieldDefinitions,
  projectFileSchema,
  uuid,
  type Collection,
  type Entry,
  type EntryFieldDefinition,
  type FieldDefinition,
  type NumberFieldDefinition,
  type StringFieldDefinition,
  type StringSelectFieldDefinition,
  type TextFieldDefinition,
} from '../test/setup.js';
import { contractFileOf, createFakeTheme } from '../test/theme.js';
import {
  createAsset,
  createCollection,
  createComponent,
  createEntry,
  createProject,
  ensureCleanGitStatus,
  expectCoreError,
} from '../test/util.js';

/**
 * A Release is refused while a website of the Project cannot take what
 * `draft` holds, and what a Release changes names the websites too.
 */
describe('Releasing a Project that has a website', function () {
  /** A theme that released every Contract given, at its own version */
  async function themeWith(contracts: Contract[]) {
    const theme = await createFakeTheme();
    for (const released of contracts) {
      await theme.release({
        tag: `v${released.version}`,
        files: contractFileOf(released),
      });
    }
    return theme;
  }

  /**
   * A Collection of a Contract under ids and a slug the Project does not
   * hold, so nothing of the Project fills it and it can be created from the
   * theme instead
   */
  function spareCollection(of: Contract, slug: string) {
    const cloned = structuredClone(of.collections[0]);
    if (cloned === undefined) {
      throw new Error('The Contract holds no Collection');
    }
    cloned.id = uuid();
    cloned.slug = { singular: slug, plural: `${slug}s` };
    for (const field of flattenFieldDefinitions(cloned.fieldDefinitions)) {
      field.id = uuid();
    }
    return cloned;
  }

  /** Orders changes by what they are, so a list of them compares */
  function byChangeType(
    a: { changeType: string },
    b: { changeType: string }
  ): number {
    return a.changeType.localeCompare(b.changeType);
  }

  /** A Collection whose one text field is optional, so an Entry can skip it */
  async function optionalCollection(projectId: string, slug: string) {
    const fieldDefinitionId = uuid();
    const collection = await core.collections.create({
      projectId,
      icon: 'notebook',
      name: {
        singular: { en: 'Note', de: 'Note' },
        plural: { en: 'Notes', de: 'Notes' },
      },
      slug: { singular: slug, plural: `${slug}s` },
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
    return { collection, fieldDefinitionId };
  }

  /** The one Value such a Collection's Entry holds, per language */
  function noteValues(content: {
    en: string | null;
    de: string | null;
  }): Record<string, Value> {
    return {
      note: { objectType: 'value', valueType: 'string', content },
    };
  }

  /** The Project version committed on `draft` */
  async function versionOf(projectId: string): Promise<string> {
    const content = await core.git.getFileContentAtCommit(
      core.util.pathTo.project(projectId),
      core.util.pathTo.projectFile(projectId),
      'draft'
    );
    return projectFileSchema.parse(JSON.parse(content)).version;
  }

  describe('a website that cannot take an Entry', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let notes: Collection;
    let emptyEntry: Entry;
    let website: DestinationFile;
    let noteFieldId = '';

    beforeAll(async function () {
      project = await createProject();
      const collection = await createCollection(project.id);
      await createComponent(project.id);
      const asset = await createAsset(project.id);
      await createEntry(project.id, collection.id, asset.id);
      const optional = await optionalCollection(project.id, 'note');
      notes = optional.collection;
      noteFieldId = optional.fieldDefinitionId;
      // Nothing in English, which is what the Contract below demands
      emptyEntry = await core.entries.create({
        projectId: project.id,
        collectionId: notes.id,
        values: noteValues({ en: null, de: 'Eine Notiz' }),
      });

      const demanding = await core.contracts.generate({
        projectId: project.id,
        name: '@acme/demanding-site',
        version: '1.0.0',
      });
      for (const written of demanding.collections) {
        for (const field of flattenFieldDefinitions(written.fieldDefinitions)) {
          if (field.id === noteFieldId) {
            field.isRequired = true;
          }
        }
      }
      const theme = await themeWith([demanding]);
      website = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'demanding.example',
        url: theme.url,
      });
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('names the Entry and why before the Release is started', async function () {
      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(prepared.destinationIssues).toMatchObject([
        {
          issue: 'missing_required',
          destinationId: website.id,
          contractCollectionId: notes.id,
          contractFieldDefinitionId: noteFieldId,
          contractFieldSlug: 'note',
          entryId: emptyEntry.id,
          collectionId: notes.id,
          fieldDefinitionId: noteFieldId,
          fieldSlug: 'note',
          language: 'en',
        },
      ]);
      expect(prepared.destinationIssues[0]?.message.length).toBeGreaterThan(0);
    });

    it('refuses the Release, names each Entry on the cause and releases nothing', async function () {
      const before = await versionOf(project.id);
      const shown = await core.releases.prepare({ projectId: project.id });
      const error = await core.releases.create({ projectId: project.id }).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(CoreError);
      // What the app showed before the Release was started is what the
      // refusal names
      expect(error instanceof CoreError && error.cause).toEqual(
        shown.destinationIssues
      );
      expect(error instanceof CoreError && error.type).toEqual('Conflict');
      expect(error instanceof CoreError && error.message).toContain(
        `Destination "${website.id}"`
      );
      expect(error instanceof CoreError && error.message).toContain(
        '1 Entry does not fit'
      );
      expect(error instanceof CoreError && error.cause).toMatchObject([
        {
          issue: 'missing_required',
          destinationId: website.id,
          entryId: emptyEntry.id,
          fieldSlug: 'note',
        },
      ]);
      expect(await versionOf(project.id)).toEqual(before);
      expect((await core.releases.list({ projectId: project.id })).total).toBe(
        0
      );
    });

    it('refuses a preview Release the same way', async function () {
      await expectCoreError(
        core.releases.createPreview({ projectId: project.id }),
        'Conflict',
        '1 Entry does not fit'
      );
      expect((await core.releases.list({ projectId: project.id })).total).toBe(
        0
      );
    });

    it('releases once the Entry fits, and names the website it changed', async function () {
      await core.entries.update({
        projectId: project.id,
        collectionId: notes.id,
        id: emptyEntry.id,
        values: noteValues({ en: 'A note', de: 'Eine Notiz' }),
      });

      const result = await core.releases.create({ projectId: project.id });

      expect(result.version).toEqual('0.1.0');
      expect(result.diff.destinationChanges).toEqual([
        { destinationId: website.id, changeType: 'added', bump: 'minor' },
      ]);
      expect(result.diff.contractChanges).toMatchObject([
        { contractId: website.contract.id, changeType: 'added', bump: 'minor' },
      ]);
    });
  });

  describe('a Collection the website needs that changes', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let specs: Collection;
    let website: DestinationFile;
    let specFieldId = '';

    beforeAll(async function () {
      project = await createProject();
      const collection = await createCollection(project.id);
      await createComponent(project.id);
      const asset = await createAsset(project.id);
      await createEntry(project.id, collection.id, asset.id);
      // A Collection holding no Entry, so dropping a required field of it
      // deletes no stored Value
      const required: StringFieldDefinition = {
        id: uuid(),
        slug: 'vin',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'VIN', de: 'FIN' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
      };
      specFieldId = required.id;
      specs = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Spec', de: 'Spec' },
          plural: { en: 'Specs', de: 'Specs' },
        },
        slug: { singular: 'spec', plural: 'specs' },
        description: { en: 'The specs', de: 'Die Specs' },
        fieldDefinitions: [required],
      });

      const theme = await themeWith([
        await core.contracts.generate({
          projectId: project.id,
          name: '@acme/spec-site',
          version: '1.0.0',
        }),
      ]);
      website = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'specs.example',
        url: theme.url,
      });
      await core.releases.create({ projectId: project.id });
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('stops the Release on a deleted field the website needs, and names it', async function () {
      await core.collections.update({
        ...specs,
        projectId: project.id,
        fieldDefinitions: [],
      });

      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(prepared.destinationIssues).toMatchObject([
        {
          issue: 'field_not_mapped',
          destinationId: website.id,
          contractCollectionId: specs.id,
          contractFieldDefinitionId: specFieldId,
        },
      ]);
      await expectCoreError(
        core.releases.create({ projectId: project.id }),
        'Conflict',
        '1 item is unmapped'
      );
    });

    it('stops the Release on a deleted Collection the website needs, and names it', async function () {
      await core.collections.delete({ projectId: project.id, id: specs.id });

      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(prepared.destinationIssues).toMatchObject([
        {
          issue: 'collection_not_mapped',
          destinationId: website.id,
          contractCollectionId: specs.id,
        },
      ]);
      expect(prepared.destinationIssues[0]?.message).toContain(
        'which the Project does not hold'
      );
      await expectCoreError(
        core.releases.create({ projectId: project.id }),
        'Conflict',
        'cannot take'
      );
    });

    it('releases once the website is removed, and names it as gone', async function () {
      await core.destinations.delete({ projectId: project.id, id: website.id });

      const prepared = await core.releases.prepare({ projectId: project.id });
      expect(prepared.destinationIssues).toEqual([]);
      expect(prepared.destinationChanges).toEqual([
        { destinationId: website.id, changeType: 'deleted', bump: 'major' },
      ]);

      const result = await core.releases.create({ projectId: project.id });

      // The Contract the website followed stays in the Project, and a
      // Contract no website follows is checked for nothing
      expect(result.diff.contractChanges).toEqual([]);
      expect(
        (await core.contracts.count({ projectId: project.id })) > 0
      ).toEqual(true);
    });

    it('stops every Release from the moment a website is added', async function () {
      // A theme needing a Collection the Project has nothing for, which is
      // what an editor maps or creates from the theme
      const needs = await core.contracts.generate({
        projectId: project.id,
        name: '@acme/needy-site',
        version: '1.0.0',
      });
      const extra = structuredClone(needs.collections[0]);
      if (extra === undefined) {
        throw new Error('The Contract holds no Collection');
      }
      extra.id = uuid();
      extra.slug = { singular: 'extra', plural: 'extras' };
      needs.collections.push(extra);
      const theme = await themeWith([needs]);
      const needy = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'needy.example',
        url: theme.url,
      });

      const prepared = await core.releases.prepare({ projectId: project.id });
      expect(prepared.destinationIssues).toMatchObject([
        {
          issue: 'collection_not_mapped',
          destinationId: needy.id,
          contractCollectionId: extra.id,
        },
      ]);
      await expectCoreError(
        core.releases.create({ projectId: project.id }),
        'Conflict',
        '1 item is unmapped'
      );

      await core.destinations.delete({ projectId: project.id, id: needy.id });
      expect(
        (await core.releases.prepare({ projectId: project.id }))
          .destinationIssues
      ).toEqual([]);
      await core.releases.create({ projectId: project.id });
    });
  });

  describe('a Project without a website', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let collection: Collection;
    let assetId = '';

    beforeAll(async function () {
      project = await createProject();
      collection = await createCollection(project.id);
      const asset = await createAsset(project.id);
      assetId = asset.id;
      await createEntry(project.id, collection.id, asset.id);
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('releases with nothing to check and nothing to report', async function () {
      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(prepared.destinationIssues).toEqual([]);
      expect(prepared.destinationChanges).toEqual([]);
      expect(prepared.contractChanges).toEqual([]);
      expect(prepared.bump).toEqual('minor');

      const result = await core.releases.create({ projectId: project.id });

      expect(result.version).toEqual('0.1.0');
      expect(result.diff.destinationChanges).toEqual([]);
    });

    it('names a Contract the Project keeps, its name and one it keeps no longer', async function () {
      const theme = await themeWith([
        await core.contracts.generate({
          projectId: project.id,
          name: '@acme/kept-site',
          version: '1.0.0',
        }),
      ]);
      const read = await core.contracts.readFromTheme({ url: theme.url });
      const origin = { kind: 'git' as const, url: theme.url };
      const kept = await core.contracts.keep({
        projectId: project.id,
        origin,
        contract: read.contract,
        commit: read.commit,
      });

      expect(
        (await core.releases.prepare({ projectId: project.id })).contractChanges
      ).toEqual([{ contractId: kept.id, changeType: 'added', bump: 'minor' }]);
      await core.releases.create({ projectId: project.id });

      // The same origin under another name renames what the Project keeps
      await core.contracts.keep({
        projectId: project.id,
        origin,
        contract: { ...read.contract, name: '@acme/renamed-site' },
        commit: read.commit,
      });

      // A site reads its own Contract by name, so the rename takes its
      // build away the way the Project dropping the Contract would
      const renamed = await core.releases.prepare({ projectId: project.id });
      expect(renamed.contractChanges).toEqual([
        { contractId: kept.id, changeType: 'nameChanged', bump: 'major' },
      ]);
      expect(renamed.bump).toEqual('major');
      await core.releases.create({ projectId: project.id });

      // A Contract that is gone, which no call of Core does and a working
      // copy can still arrive at
      const projectPath = core.util.pathTo.project(project.id);
      const folder = core.util.pathTo.contract(project.id, kept.id);
      await Fs.remove(folder);
      await core.git.add(projectPath, [folder]);
      await core.git.commit(projectPath, {
        method: 'delete',
        reference: { objectType: 'project', id: project.id },
      });

      const prepared = await core.releases.prepare({ projectId: project.id });
      // Released again, so the next test starts from a Project that keeps
      // no Contract rather than from one that just lost its own
      const released = await core.releases.create({ projectId: project.id });

      expect(prepared.contractChanges).toEqual([
        { contractId: kept.id, changeType: 'deleted', bump: 'major' },
      ]);
      expect(released.diff.bump).toEqual('major');
    });

    it('releases without the folders a Project written before them lacks', async function () {
      // What a Project written before Destinations existed holds, which
      // Core itself has no call for
      const projectPath = core.util.pathTo.project(project.id);
      const folders = [
        core.util.pathTo.destinations(project.id),
        core.util.pathTo.contracts(project.id),
      ];
      await Promise.all(folders.map((folder) => Fs.remove(folder)));
      await core.git.add(projectPath, folders);
      await core.git.commit(projectPath, {
        method: 'delete',
        reference: { objectType: 'project', id: project.id },
      });
      await createEntry(project.id, collection.id, assetId);

      const prepared = await core.releases.prepare({ projectId: project.id });
      expect(prepared.destinationIssues).toEqual([]);
      expect(prepared.destinationChanges).toEqual([]);
      expect(prepared.contractChanges).toEqual([]);

      const result = await core.releases.create({ projectId: project.id });
      expect(
        result.diff.entryChanges.filter((change) => {
          return change.changeType === 'added';
        })
      ).toHaveLength(1);
    });
  });

  describe('a theme that tagged a newer version', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let website: DestinationFile;

    beforeAll(async function () {
      project = await createProject();
      const collection = await createCollection(project.id);
      await createComponent(project.id);
      const asset = await createAsset(project.id);
      await createEntry(project.id, collection.id, asset.id);
      const contract = await core.contracts.generate({
        projectId: project.id,
        name: '@acme/versioned-site',
        version: '1.0.0',
      });
      // 2.0.0 needs a field no field definition of the Project carries, so
      // its Mapping stays incomplete while it waits
      const demanding: Contract = {
        ...structuredClone(contract),
        version: '2.0.0',
      };
      demanding.collections[0]?.fieldDefinitions.push({
        id: uuid(),
        slug: 'subtitle',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Subtitle', de: 'Untertitel' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
      });
      const theme = await themeWith([
        contract,
        { ...structuredClone(contract), version: '1.1.0' },
        demanding,
      ]);
      await core.releases.create({ projectId: project.id });
      website = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'versioned.example',
        url: theme.url,
        version: '1.0.0',
      });
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('names the website and its Contract as added, in the Release and afterwards', async function () {
      // Released before anything is asserted, so a failure here leaves the
      // next test the state it expects
      const prepared = await core.releases.prepare({ projectId: project.id });
      const released = await core.releases.create({ projectId: project.id });
      const { list } = await core.releases.list({ projectId: project.id });
      // By its version rather than by the order, because two Releases of
      // one second order by the tagged commit's date alone
      const tag = list.find((item) => item.version === released.version);
      const changes = await core.releases.changes({
        projectId: project.id,
        tagId: tag?.tagId ?? '',
      });

      expect(prepared.destinationIssues).toEqual([]);
      expect(prepared.destinationChanges).toEqual([
        { destinationId: website.id, changeType: 'added', bump: 'minor' },
      ]);
      expect(prepared.contractChanges).toEqual([
        {
          contractId: website.contract.id,
          changeType: 'added',
          bump: 'minor',
        },
      ]);
      expect(changes.destinationChanges).toEqual(prepared.destinationChanges);
      expect(changes.contractChanges).toEqual(prepared.contractChanges);
    });

    it('lets the Release out while a version waits that the Project does not fit', async function () {
      const kept = await core.destinations.keepVersion({
        projectId: project.id,
        id: website.id,
      });
      expect(kept.outcome).toEqual('waiting');
      expect(kept.destination.waiting?.version).toEqual('2.0.0');
      // The waiting version is what the website cannot take
      expect(
        await core.destinations.checkAll({
          projectId: project.id,
          id: website.id,
          isWaitingVersion: true,
        })
      ).not.toEqual([]);

      const prepared = await core.releases.prepare({ projectId: project.id });
      const released = await core.releases.create({ projectId: project.id });

      expect(prepared.destinationIssues).toEqual([]);
      expect(prepared.destinationChanges).toEqual([
        {
          destinationId: website.id,
          changeType: 'waitingVersionChanged',
          bump: 'patch',
        },
      ]);
      expect(prepared.contractChanges).toEqual([
        {
          contractId: website.contract.id,
          changeType: 'versionAdded',
          bump: 'minor',
          version: '2.0.0',
        },
      ]);
      expect(released.version).toEqual('0.3.0');
    });

    it("names the theme's version the website moved to", async function () {
      await core.destinations.keepVersion({
        projectId: project.id,
        id: website.id,
        version: '1.1.0',
      });
      const switched = await core.destinations.switchVersion({
        projectId: project.id,
        id: website.id,
      });
      expect(switched.outcome).toEqual('switched');

      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(
        prepared.destinationChanges.filter(
          (change) => change.changeType === 'versionChanged'
        )
      ).toEqual([
        {
          destinationId: website.id,
          changeType: 'versionChanged',
          bump: 'patch',
          version: '1.1.0',
        },
      ]);
      expect(prepared.destinationIssues).toEqual([]);
      await core.releases.create({ projectId: project.id });
    });
  });

  describe('a website the editor changed', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let collection: Collection;
    let website: DestinationFile;
    let spareId = '';

    beforeAll(async function () {
      project = await createProject();
      collection = await createCollection(project.id);
      await createComponent(project.id);
      const asset = await createAsset(project.id);
      await createEntry(project.id, collection.id, asset.id);
      const contract = await core.contracts.generate({
        projectId: project.id,
        name: '@acme/changing-site',
        version: '1.0.0',
      });
      // 1.1.0 names a Collection nothing of the Project fills, which is
      // what the editor creates from the theme
      const next: Contract = { ...structuredClone(contract), version: '1.1.0' };
      const spare = spareCollection(contract, 'spare');
      spareId = spare.id;
      next.collections.push(spare);
      const theme = await themeWith([contract, next]);
      website = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'changing.example',
        url: theme.url,
        version: '1.0.0',
      });
      await core.releases.create({ projectId: project.id });
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('names a renamed website and a replaced Mapping', async function () {
      const optional = flattenFieldDefinitions(
        collection.fieldDefinitions
      ).find((field) => field.isRequired === false);
      const current = await core.destinations.read({
        projectId: project.id,
        id: website.id,
      });
      const mapped = current.mapping.collections[collection.id];
      if (optional === undefined || mapped === undefined) {
        throw new Error('The Mapping does not fill an optional field');
      }

      await core.destinations.update({
        projectId: project.id,
        id: website.id,
        name: 'renamed.example',
        mapping: {
          collections: {
            ...current.mapping.collections,
            [collection.id]: {
              ...mapped,
              fields: Object.fromEntries(
                Object.entries(mapped.fields).filter(([id]) => {
                  return id !== optional.id;
                })
              ),
            },
          },
        },
      });

      const prepared = await core.releases.prepare({ projectId: project.id });
      const released = await core.releases.create({ projectId: project.id });

      expect(prepared.destinationIssues).toEqual([]);
      // A site names its website by the name the editor gave it, so the
      // rename takes that site's build away and the Release is a major
      expect(prepared.destinationChanges.toSorted(byChangeType)).toEqual([
        {
          destinationId: website.id,
          changeType: 'mappingChanged',
          bump: 'patch',
        },
        { destinationId: website.id, changeType: 'nameChanged', bump: 'major' },
      ]);
      expect(released.diff.bump).toEqual('major');
    });

    it('names a Collection created from a version that waits', async function () {
      await core.destinations.keepVersion({
        projectId: project.id,
        id: website.id,
      });
      const created = await core.destinations.createCollection({
        projectId: project.id,
        id: website.id,
        contractCollectionId: spareId,
        isWaitingVersion: true,
      });
      expect(created.createdFromTheme.collectionIds).toHaveLength(1);

      const prepared = await core.releases.prepare({ projectId: project.id });
      const released = await core.releases.create({ projectId: project.id });

      // What the website created from its theme is a change of the website,
      // and the Collection it wrote is reported beside it
      expect(prepared.destinationIssues).toEqual([]);
      expect(
        prepared.destinationChanges
          .map((change) => change.changeType)
          .toSorted()
      ).toEqual(['createdFromThemeChanged', 'waitingVersionChanged']);
      expect(prepared.contractChanges).toEqual([
        {
          contractId: website.contract.id,
          changeType: 'versionAdded',
          bump: 'minor',
          version: '1.1.0',
        },
      ]);
      expect(prepared.collectionChanges).toEqual([
        {
          collectionId: created.createdFromTheme.collectionIds[0],
          changeType: 'added',
          bump: 'minor',
          isSingleEntry: false,
        },
      ]);
      expect(released.diff.bump).toEqual('minor');
    });

    it('names every website of the Project that cannot take it', async function () {
      // Two more websites, each on a theme of its own naming a Collection
      // nothing of the Project fills
      const added: DestinationFile[] = [];
      for (const name of ['first.example', 'second.example']) {
        const needs = await core.contracts.generate({
          projectId: project.id,
          name: `@acme/${name.split('.')[0] ?? 'needy'}-site`,
          version: '1.0.0',
        });
        needs.collections.push(spareCollection(needs, 'wanted'));
        added.push(
          await core.destinations.addWebsite({
            projectId: project.id,
            name,
            url: (await themeWith([needs])).url,
          })
        );
      }

      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(
        prepared.destinationIssues
          .map((issue) => issue.destinationId)
          .toSorted()
      ).toEqual(added.map(({ id }) => id).toSorted());
      const error = await core.releases.create({ projectId: project.id }).then(
        () => null,
        (caught: unknown) => caught
      );
      expect(error instanceof CoreError && error.message).toContain(
        '2 items are unmapped'
      );
      for (const one of added) {
        expect(error instanceof CoreError && error.message).toContain(one.id);
      }
      expect(error instanceof CoreError && error.message).toContain(
        'Destinations "'
      );
    });
  });

  describe('a Project whose fields changed under its website', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let parts: Collection;
    let specs: Collection;
    let labels: Collection;
    let website: DestinationFile;
    let draftPart: Entry;
    let firstSpec: Entry;
    let secondSpec: Entry;
    const field = {
      status: uuid(),
      vin: uuid(),
      colour: uuid(),
      related: uuid(),
      kind: uuid(),
      caption: uuid(),
    };

    /**
     * The fields of the Specs, with the width the Project gives the one the
     * theme needs and the options it offers, so a test states what changed
     * by stating the Collection again
     */
    function specFields(props: {
      max: number;
      options: string[];
    }): FieldDefinition[] {
      const vin: TextFieldDefinition = {
        id: field.vin,
        slug: 'vin',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'VIN', de: 'FIN' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: props.max,
      };
      const colour: StringSelectFieldDefinition = {
        id: field.colour,
        slug: 'colour',
        valueType: 'string',
        fieldType: 'select',
        label: { en: 'Colour', de: 'Farbe' },
        description: null,
        defaultValue: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        options: props.options.map((value) => ({
          value,
          label: { en: value, de: value },
        })),
      };
      const related: EntryFieldDefinition = {
        id: field.related,
        slug: 'related',
        valueType: 'reference',
        fieldType: 'entry',
        label: { en: 'Related', de: 'Verwandt' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofCollections: [parts.id],
        min: null,
        max: null,
      };
      return [vin, colour, related];
    }

    /** The field the theme reads as text, as the Project first held it */
    const textKind: TextFieldDefinition = {
      id: field.kind,
      slug: 'kind',
      valueType: 'string',
      fieldType: 'text',
      label: { en: 'Kind', de: 'Art' },
      description: null,
      defaultValue: null,
      isRequired: true,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    };

    /** The same field after the editor made it hold a number instead */
    const numberKind: NumberFieldDefinition = {
      id: field.kind,
      slug: 'kind',
      valueType: 'number',
      fieldType: 'number',
      label: { en: 'Kind', de: 'Art' },
      description: null,
      defaultValue: null,
      isRequired: true,
      isDisabled: false,
      isUnique: false,
      inputWidth: '12',
      min: null,
      max: null,
    };

    /** The fields of the Labels, around the kind field it is given */
    function labelFields(
      kind: TextFieldDefinition | NumberFieldDefinition
    ): FieldDefinition[] {
      const caption: TextFieldDefinition = {
        id: field.caption,
        slug: 'caption',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Caption', de: 'Beschriftung' },
        description: null,
        defaultValue: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
      };
      return [kind, caption];
    }

    /** One string in both languages */
    function text(content: string | null): Value {
      return {
        objectType: 'value',
        valueType: 'string',
        content: { en: content, de: content },
      };
    }

    /** A reference to one Entry, in both languages */
    function pointsAt(entryId: string, collectionId: string): Value {
      const content = [
        { objectType: 'entry' as const, id: entryId, collectionId },
      ];
      return {
        objectType: 'value',
        valueType: 'reference',
        content: { en: content, de: content },
      };
    }

    /** The Mapping of the website as it stands, to change one entry of */
    async function mappingNow() {
      return (
        await core.destinations.read({ projectId: project.id, id: website.id })
      ).mapping;
    }

    beforeAll(async function () {
      project = await createProject();
      parts = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Part', de: 'Teil' },
          plural: { en: 'Parts', de: 'Teile' },
        },
        slug: { singular: 'part', plural: 'parts' },
        description: { en: 'The parts', de: 'Die Teile' },
        fieldDefinitions: [
          {
            id: field.status,
            slug: 'status',
            valueType: 'string',
            fieldType: 'select',
            label: { en: 'Status', de: 'Status' },
            description: null,
            defaultValue: null,
            isRequired: false,
            isDisabled: false,
            isUnique: false,
            inputWidth: '12',
            options: ['published', 'draft'].map((value) => ({
              value,
              label: { en: value, de: value },
            })),
          },
        ],
      });
      specs = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Spec', de: 'Spec' },
          plural: { en: 'Specs', de: 'Specs' },
        },
        slug: { singular: 'spec', plural: 'specs' },
        description: { en: 'The specs', de: 'Die Specs' },
        fieldDefinitions: specFields({ max: 10, options: ['red', 'blue'] }),
      });
      // No Entry holds a Value of this Collection, so a field of it is
      // changed without any stored content being lost
      labels = await core.collections.create({
        projectId: project.id,
        icon: 'home',
        name: {
          singular: { en: 'Label', de: 'Label' },
          plural: { en: 'Labels', de: 'Labels' },
        },
        slug: { singular: 'label', plural: 'labels' },
        description: { en: 'The labels', de: 'Die Labels' },
        fieldDefinitions: labelFields(textKind),
      });

      await core.entries.create({
        projectId: project.id,
        collectionId: parts.id,
        values: { status: text('published') },
      });
      draftPart = await core.entries.create({
        projectId: project.id,
        collectionId: parts.id,
        values: { status: text('draft') },
      });
      firstSpec = await core.entries.create({
        projectId: project.id,
        collectionId: specs.id,
        values: {
          vin: text('WVW1'),
          colour: text('red'),
          related: pointsAt(draftPart.id, parts.id),
        },
      });
      secondSpec = await core.entries.create({
        projectId: project.id,
        collectionId: specs.id,
        values: {
          vin: text('WVW2'),
          colour: text('blue'),
          related: pointsAt(draftPart.id, parts.id),
        },
      });

      const theme = await themeWith([
        await core.contracts.generate({
          projectId: project.id,
          name: '@acme/changed-site',
          version: '1.0.0',
        }),
      ]);
      website = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'changed.example',
        url: theme.url,
      });
      // Everything fits when the website is added, so every refusal below
      // is what a change to the Project did
      expect(
        await core.destinations.checkAll({
          projectId: project.id,
          id: website.id,
        })
      ).toEqual([]);
      await core.releases.create({ projectId: project.id });
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('refuses the Release on a field the Project widened, naming the gap and both Entries at once', async function () {
      // The editor widens the field the theme needs and types Values the
      // theme's own rules refuse, in both languages
      await core.collections.update({
        ...(await core.collections.read({
          projectId: project.id,
          id: specs.id,
        })),
        projectId: project.id,
        fieldDefinitions: specFields({ max: 100, options: ['red', 'blue'] }),
      });
      for (const entry of [firstSpec, secondSpec]) {
        await core.entries.update({
          projectId: project.id,
          collectionId: specs.id,
          id: entry.id,
          values: {
            vin: text('WVWZZZ1KZAW000001'),
            colour: text('red'),
            related: pointsAt(draftPart.id, parts.id),
          },
        });
      }
      // One required field of the Contract left unmapped beside them, so
      // the refusal names a Mapping gap and refused Entries together
      const mapping = await mappingNow();
      const mapped = mapping.collections[labels.id];
      if (mapped === undefined) {
        throw new Error('The Mapping does not fill the labels');
      }
      await core.destinations.update({
        projectId: project.id,
        id: website.id,
        mapping: {
          collections: {
            ...mapping.collections,
            [labels.id]: {
              ...mapped,
              fields: Object.fromEntries(
                Object.entries(mapped.fields).filter(([id]) => {
                  return id !== field.caption;
                })
              ),
            },
          },
        },
      });

      const prepared = await core.releases.prepare({ projectId: project.id });

      // An Entry is named once per Value the website refuses, which is one
      // per language here, and counted once in the refusal below
      const refused = prepared.destinationIssues.filter((issue) => {
        return issue.issue === 'constraint_violation';
      });
      expect(refused).toHaveLength(4);
      expect(refused).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entryId: firstSpec.id,
            fieldSlug: 'vin',
            language: 'en',
          }),
          expect.objectContaining({
            entryId: firstSpec.id,
            fieldSlug: 'vin',
            language: 'de',
          }),
          expect.objectContaining({
            entryId: secondSpec.id,
            fieldSlug: 'vin',
            language: 'en',
          }),
          expect.objectContaining({
            entryId: secondSpec.id,
            fieldSlug: 'vin',
            language: 'de',
          }),
        ])
      );
      expect(
        prepared.destinationIssues.filter((issue) => {
          return issue.issue === 'field_not_mapped';
        })
      ).toMatchObject([
        {
          contractCollectionId: labels.id,
          contractFieldDefinitionId: field.caption,
        },
      ]);

      const error = await core.releases.create({ projectId: project.id }).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error instanceof CoreError && error.message).toEqual(
        `Cannot create a release: Destination "${website.id}" of this Project cannot take what "draft" holds, 1 item is unmapped and 2 Entries do not fit. Each is named on the cause. Map the rest, or remove the Destination.`
      );
      expect((await core.releases.list({ projectId: project.id })).total).toBe(
        1
      );
    });

    it('refuses the Release on a field whose type changed, an option it gained and an Entry pointing at one the website leaves out', async function () {
      // The theme's field takes text and the Project's field now holds a
      // number, so nothing fills it any more
      await core.collections.update({
        ...(await core.collections.read({
          projectId: project.id,
          id: labels.id,
        })),
        projectId: project.id,
        fieldDefinitions: labelFields(numberKind),
      });
      // An option the theme's field does not offer, beside the width the
      // Specs' field keeps from the test above
      await core.collections.update({
        ...(await core.collections.read({
          projectId: project.id,
          id: specs.id,
        })),
        projectId: project.id,
        fieldDefinitions: specFields({
          max: 100,
          options: ['red', 'blue', 'teal'],
        }),
      });
      // The website takes the Parts that are published, and a Spec it takes
      // points at one it leaves out
      const mapping = await mappingNow();
      const mapped = mapping.collections[parts.id];
      if (mapped === undefined) {
        throw new Error('The Mapping does not fill the parts');
      }
      await core.destinations.update({
        projectId: project.id,
        id: website.id,
        mapping: {
          collections: {
            ...mapping.collections,
            [parts.id]: {
              ...mapped,
              from: {
                ...mapped.from,
                where: [
                  { fieldDefinitionId: field.status, equals: ['published'] },
                ],
              },
            },
          },
        },
      });

      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(prepared.destinationIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            issue: 'does_not_fit',
            contractCollectionId: labels.id,
            contractFieldDefinitionId: field.kind,
          }),
          expect.objectContaining({
            issue: 'option_not_matched',
            contractCollectionId: specs.id,
            contractFieldDefinitionId: field.colour,
          }),
          expect.objectContaining({
            issue: 'reference_not_taken',
            entryId: firstSpec.id,
            contractFieldSlug: 'related',
          }),
        ])
      );
      await expectCoreError(
        core.releases.create({ projectId: project.id }),
        'Conflict',
        'cannot take'
      );
    });

    it('refuses the Release while a mapped reference points at a Collection nothing fills', async function () {
      const mapping = await mappingNow();
      const withoutParts = structuredClone(mapping);
      delete withoutParts.collections[parts.id];
      await core.destinations.update({
        projectId: project.id,
        id: website.id,
        mapping: withoutParts,
      });

      const prepared = await core.releases.prepare({ projectId: project.id });

      expect(prepared.destinationIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            issue: 'reference_not_mapped',
            contractCollectionId: specs.id,
            contractFieldDefinitionId: field.related,
          }),
          expect.objectContaining({
            issue: 'collection_not_mapped',
            contractCollectionId: parts.id,
          }),
        ])
      );
      await expectCoreError(
        core.releases.create({ projectId: project.id }),
        'Conflict',
        'cannot take'
      );
    });
  });

  describe('a website and a Contract this Core cannot read', function () {
    let project: Awaited<ReturnType<typeof createProject>>;
    let website: DestinationFile;

    beforeAll(async function () {
      project = await createProject();
      const collection = await createCollection(project.id);
      const asset = await createAsset(project.id);
      await createEntry(project.id, collection.id, asset.id);
      const theme = await themeWith([
        await core.contracts.generate({
          projectId: project.id,
          name: '@acme/unreadable-site',
          version: '1.0.0',
        }),
      ]);
      website = await core.destinations.addWebsite({
        projectId: project.id,
        name: 'unreadable.example',
        url: theme.url,
      });
      await core.releases.create({ projectId: project.id });
    });

    afterAll(async function () {
      await project.destroy();
    });

    afterEach(async function ({ task }) {
      await ensureCleanGitStatus(task, project.id);
    });

    it('reports both by their presence alone, and never as gone or renamed', async function () {
      // Both files as a Core that wrote another shape left them: a kind of
      // Destination and an origin of a Contract this Core does not know
      const projectPath = core.util.pathTo.project(project.id);
      const destinationFilePath = core.util.pathTo.destinationFile(
        project.id,
        website.id
      );
      const contractFilePath = core.util.pathTo.contractFile(
        project.id,
        website.contract.id
      );
      await Fs.writeJson(destinationFilePath, {
        ...(await Fs.readJson(destinationFilePath)),
        coreVersion: '0.1.0',
        kind: 'inbox',
      });
      await Fs.writeJson(contractFilePath, {
        ...(await Fs.readJson(contractFilePath)),
        coreVersion: '0.1.0',
        origin: { kind: 'registry', package: '@acme/unreadable-site' },
      });
      await core.git.add(projectPath, [destinationFilePath, contractFilePath]);
      await core.git.commit(projectPath, {
        method: 'update',
        reference: { objectType: 'project', id: project.id },
      });

      // Neither file is one this Core reads, so the website is not among
      // the ones it lists and the check reads nothing about it
      expect(
        (await core.destinations.list({ projectId: project.id, limit: 0 })).list
      ).toEqual([]);

      const prepared = await core.releases.prepare({ projectId: project.id });
      const released = await core.releases.create({ projectId: project.id });

      // Which part of either changed cannot be read, so the Release reports
      // no change inside them, and never that one is gone
      expect(prepared.destinationIssues).toEqual([]);
      expect(prepared.destinationChanges).toEqual([]);
      expect(prepared.contractChanges).toEqual([]);
      expect(prepared.bump).toEqual('patch');
      expect(released.version).toEqual('0.1.1');
    });
  });
});
