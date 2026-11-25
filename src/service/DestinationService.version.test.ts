import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Contract,
  Mapping,
  StringFieldDefinition,
} from '../schema/index.js';
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
  createEntry,
  createProject,
  expectCoreError,
} from '../test/util.js';

/**
 * Keeping a theme's newer version beside the one a website uses, and
 * switching to it once nothing of the Project is left that it cannot take.
 */
describe('a theme that tagged a new version', function () {
  let projectId = '';
  let collection: Collection;
  let entry: Entry;
  let destroy: () => Promise<void>;
  let contract: Contract;
  /** The Project's own required text field, which a Mapping fills from */
  let textFieldId = '';

  beforeAll(async function () {
    const project = await createProject();
    projectId = project.id;
    destroy = project.destroy;
    collection = await createCollection(projectId);
    const asset = await createAsset(projectId);
    entry = await createEntry(projectId, collection.id, asset.id);
    const textField = collection.fieldDefinitions[0];
    if (textField === undefined) {
      throw new Error('The Collection holds no field definition');
    }
    textFieldId = textField.id;
    contract = await core.contracts.generate({
      projectId,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });
  });

  afterAll(async function () {
    await destroy();
  });

  /** The Project's own Contract at another version, unchanged otherwise */
  function at(version: string): Contract {
    return { ...structuredClone(contract), version };
  }

  /** A required field of the Contract no field definition of the Project has */
  function withRequiredField(version: string): {
    contract: Contract;
    field: StringFieldDefinition;
  } {
    const next = at(version);
    const field: StringFieldDefinition = {
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
    };
    next.collections[0]?.fieldDefinitions.push(field);
    return { contract: next, field };
  }

  /** The Contract at another version, refusing the Entry's own Value */
  function withTightenedField(version: string): Contract {
    const next = at(version);
    for (const field of flattenFieldDefinitions(
      next.collections[0]?.fieldDefinitions ?? []
    )) {
      if (field.valueType === 'string' && 'max' in field) {
        field.max = 1;
      }
    }
    return next;
  }

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

  /** A website of the Project on a theme, at the version given */
  async function websiteOn(
    theme: { url: string },
    options: { name?: string; version?: string } = {}
  ) {
    return core.destinations.addWebsite({
      projectId,
      name: options.name ?? `website-${uuid()}.example`,
      url: theme.url,
      ...(options.version === undefined ? {} : { version: options.version }),
    });
  }

  /** Whether the Project has nothing uncommitted left */
  async function isCommitted() {
    const status = await core.git.status(core.util.pathTo.project(projectId));
    return status.files.length === 0;
  }

  describe('newerVersions', function () {
    it('lists the versions newer than the one the website uses', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0'), at('2.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });

      const newer = await core.destinations.newerVersions({
        projectId,
        id: website.id,
      });

      expect(newer).toEqual(['2.0.0', '1.1.0']);
    });

    it('is empty while the website uses the newest version', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0')]);
      const website = await websiteOn(theme);

      expect(website.contract.version).toEqual('1.1.0');
      expect(
        await core.destinations.newerVersions({ projectId, id: website.id })
      ).toEqual([]);
    });

    it('lists a pre-release, which is taken only when it is named', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0-beta.1')]);
      const website = await websiteOn(theme);

      expect(website.contract.version).toEqual('1.0.0');
      expect(
        await core.destinations.newerVersions({ projectId, id: website.id })
      ).toEqual(['1.1.0-beta.1']);
      // The newest tagged version a pre-release leads to is the one in use
      expect(
        (await core.destinations.keepVersion({ projectId, id: website.id }))
          .outcome
      ).toEqual('in-use');
      expect(
        (
          await core.destinations.keepVersion({
            projectId,
            id: website.id,
            version: '1.1.0-beta.1',
          })
        ).destination.waiting?.version
      ).toEqual('1.1.0-beta.1');
    });

    it('throws NotFound for a website the Project does not hold', async function () {
      await expectCoreError(
        core.destinations.newerVersions({ projectId, id: uuid() }),
        'NotFound'
      );
    });

    it('lists a version of a theme that holds no Contract', async function () {
      const theme = await createFakeTheme();
      await theme.release({ tag: 'v1.0.0', files: { 'README.md': 'A theme' } });

      expect(
        await core.contracts.versionsFromTheme({ url: theme.url })
      ).toEqual(['1.0.0']);
      await expectCoreError(
        core.contracts.readFromTheme({ url: theme.url }),
        'NotFound',
        'has no elek.contract.json'
      );
    });
  });

  describe('keepVersion', function () {
    it('keeps the newest version beside the one in use, with its Mapping', async function () {
      const theme = await themeWith([at('1.0.0'), at('2.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      expect(kept.outcome).toEqual('waiting');
      expect(kept.version).toEqual('2.0.0');
      // The website goes on using the version it uses
      expect(kept.destination.contract.version).toEqual('1.0.0');
      expect(kept.destination.waiting?.version).toEqual('2.0.0');
      expect(
        kept.destination.waiting?.mapping.collections[collection.id]?.from
      ).toEqual({ collectionId: collection.id });
      // The Project keeps a copy of it, so it needs the theme no more
      expect(
        (
          await core.contracts.readVersion({
            projectId,
            id: website.contract.id,
            version: '2.0.0',
          })
        ).contract.version
      ).toEqual('2.0.0');
      expect(await isCommitted()).toBe(true);
    });

    it('fills a field the new version added whose id the Project carries', async function () {
      // The reference field leaves the Contract and comes back at 2.0.0,
      // which is a theme adding a field the Project already has
      const first = at('1.0.0');
      const dropped = first.collections[0]?.fieldDefinitions.pop();
      if (dropped === undefined) {
        throw new Error('The Contract holds no field definition');
      }
      const theme = await themeWith([first, at('2.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      expect(
        website.mapping.collections[collection.id]?.fields[dropped.id]
      ).toBeUndefined();
      expect(
        kept.destination.waiting?.mapping.collections[collection.id]?.fields[
          dropped.id
        ]
      ).toEqual({ fieldDefinitionId: dropped.id });
    });

    it('keeps the version it is given instead', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0'), at('2.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
        version: '1.1.0',
      });

      expect(kept.destination.waiting?.version).toEqual('1.1.0');
    });

    it('answers in-use and writes nothing while the website uses it', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0')]);
      const website = await websiteOn(theme);

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      expect(kept.outcome).toEqual('in-use');
      expect(kept.version).toEqual('1.1.0');
      expect(kept.destination.waiting).toBeNull();
      expect(kept.destination.updated).toBeNull();
      expect(await isCommitted()).toBe(true);
    });

    it('refuses a version older than the one in use, and keeps nothing', async function () {
      const theme = await themeWith([at('1.0.0'), at('2.0.0')]);
      const website = await websiteOn(theme);

      await expectCoreError(
        core.destinations.keepVersion({
          projectId,
          id: website.id,
          version: '1.0.0',
        }),
        'PreconditionFailed',
        'is older than version "2.0.0"'
      );

      expect(
        (await core.destinations.read({ projectId, id: website.id })).waiting
      ).toBeNull();
    });

    it('refuses a version whose Contract carries another name', async function () {
      const renamed = at('2.0.0');
      renamed.name = '@acme/other-site';
      const theme = await themeWith([at('1.0.0'), renamed]);
      const website = await websiteOn(theme, { version: '1.0.0' });

      await expectCoreError(
        core.destinations.keepVersion({ projectId, id: website.id }),
        'BadRequest',
        'carries the Contract "@acme/other-site"'
      );

      expect(
        (await core.destinations.read({ projectId, id: website.id })).waiting
      ).toBeNull();
    });

    it('refuses a version whose copy in the Project carries another name', async function () {
      // A second website keeps 2.0.0 under a name of its own, so the Project
      // holds a copy of that version carrying it
      const renamed = at('2.0.0');
      renamed.name = '@acme/other-site';
      const theme = await themeWith([at('1.0.0'), renamed]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await websiteOn(theme, { version: '2.0.0' });
      // The theme moves the tag onto a Contract carrying the name this
      // website follows. The copy the Project keeps is the Contract a switch
      // would put it on, so that is the name the version is read by
      await theme.release({
        tag: 'v2.0.0',
        files: contractFileOf(at('2.0.0')),
        isMoved: true,
      });

      await expectCoreError(
        core.destinations.keepVersion({
          projectId,
          id: website.id,
          version: '2.0.0',
        }),
        'BadRequest',
        'own copy of version "2.0.0" carries the Contract "@acme/other-site"'
      );

      expect(
        (await core.destinations.read({ projectId, id: website.id })).waiting
      ).toBeNull();
      // Nothing is written, so the Contract the other website follows keeps
      // its name and its site goes on building
      expect(
        (await core.contracts.read({ projectId, id: website.contract.id })).name
      ).toEqual('@acme/other-site');
      expect(await isCommitted()).toBe(true);
    });

    it('replaces the version that waits and keeps what was mapped for it', async function () {
      const second = withRequiredField('2.0.0');
      const third = withRequiredField('3.0.0');
      // The same field, so what the editor mapped for 2.0.0 fits 3.0.0 too
      third.contract.collections[0]?.fieldDefinitions.pop();
      third.contract.collections[0]?.fieldDefinitions.push(second.field);
      const theme = await themeWith([
        at('1.0.0'),
        second.contract,
        third.contract,
      ]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await core.destinations.keepVersion({
        projectId,
        id: website.id,
        version: '2.0.0',
      });
      const mapped = await core.destinations.update({
        projectId,
        id: website.id,
        waitingMapping: mappingFilling(
          website.mapping,
          second.field.id,
          textFieldId
        ),
      });

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      expect(mapped.contract.version).toEqual('1.0.0');
      expect(kept.destination.waiting?.version).toEqual('3.0.0');
      expect(
        kept.destination.waiting?.mapping.collections[collection.id]?.fields[
          second.field.id
        ]
      ).toEqual({ fieldDefinitionId: textFieldId });
    });

    it('replaces the version that waits with one older than it', async function () {
      const theme = await themeWith([at('1.0.0'), at('2.0.0'), at('3.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await core.destinations.keepVersion({ projectId, id: website.id });

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
        version: '2.0.0',
      });

      // Every version newer than the one in use can be put beside it, so an
      // editor who picks 2.0.0 while 3.0.0 waits gets 2.0.0
      expect(kept.outcome).toEqual('waiting');
      expect(kept.version).toEqual('2.0.0');
      expect(kept.destination.waiting?.version).toEqual('2.0.0');
    });

    it('fills what the Project gained for the version that already waits', async function () {
      const second = withRequiredField('2.0.0');
      // Its own slug, because the Project's Collection keeps the field
      // definition this test adds to it
      second.field.slug = 'gained-subtitle';
      const theme = await themeWith([at('1.0.0'), second.contract]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      const before = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      // The field the new version added, with the id its Contract carries,
      // which is what a Contract generated from this Project gives
      await core.collections.update({
        ...collection,
        projectId,
        fieldDefinitions: [...collection.fieldDefinitions, second.field],
        resolutions: {
          [entry.id]: {
            [second.field.slug]: {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'A subtitle', de: 'Ein Untertitel' },
            },
          },
        },
      });
      const after = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      expect(
        before.destination.waiting?.mapping.collections[collection.id]?.fields[
          second.field.id
        ]
      ).toBeUndefined();
      expect(after.destination.waiting?.version).toEqual('2.0.0');
      expect(
        after.destination.waiting?.mapping.collections[collection.id]?.fields[
          second.field.id
        ]
      ).toEqual({ fieldDefinitionId: second.field.id });
      // So the switch the run before was refused goes through, without the
      // theme tagging anything else
      expect(
        (await core.destinations.switchVersion({ projectId, id: website.id }))
          .outcome
      ).toEqual('switched');
    });

    it('writes nothing while the version that waits is filled the same', async function () {
      const second = withRequiredField('2.0.0');
      const theme = await themeWith([at('1.0.0'), second.contract]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      const first = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      const again = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      expect(again.outcome).toEqual('waiting');
      expect(again.destination.updated).toEqual(first.destination.updated);
      expect(await isCommitted()).toBe(true);
    });

    it('reads the name from the version the website uses', async function () {
      // A second website on the same theme keeps a version whose Contract was
      // renamed, which writes that name into the Contract the Project keeps
      const renamed = at('2.0.0');
      renamed.name = '@acme/other-site';
      const theme = await themeWith([at('1.0.0'), renamed, at('3.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      const other = await websiteOn(theme, { version: '2.0.0' });

      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
        version: '3.0.0',
      });

      expect(other.contract.version).toEqual('2.0.0');
      expect(
        (await core.contracts.read({ projectId, id: website.contract.id })).name
      ).toEqual('@acme/dealer-site');
      // 3.0.0 carries the name 1.0.0 carries, which is what this website
      // follows, so the other website's rename does not refuse it
      expect(kept.destination.waiting?.version).toEqual('3.0.0');
    });

    it('builds the Mapping from the version the Project kept', async function () {
      // Both versions leave the reference field out, which the Project holds
      const first = at('1.0.0');
      const dropped = first.collections[0]?.fieldDefinitions.pop();
      const second = { ...structuredClone(first), version: '2.0.0' };
      if (dropped === undefined) {
        throw new Error('The Contract holds no field definition');
      }
      const theme = await themeWith([first, second]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await core.destinations.keepVersion({ projectId, id: website.id });

      // The theme moves the 2.0.0 tag onto a Contract that names the
      // reference field again. The Project never rewrites a copy, so the copy
      // it read is the Contract a switch would put the website on
      await theme.release({
        tag: 'v2.0.0',
        files: contractFileOf(at('2.0.0')),
        isMoved: true,
      });
      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
        version: '2.0.0',
      });

      expect(
        (
          await core.contracts.readVersion({
            projectId,
            id: website.contract.id,
            version: '2.0.0',
          })
        ).contract.collections[0]?.fieldDefinitions.map(({ id }) => id)
      ).not.toContain(dropped.id);
      expect(
        Object.keys(
          kept.destination.waiting?.mapping.collections[collection.id]
            ?.fields ?? {}
        )
      ).not.toContain(dropped.id);
    });
  });

  describe('two websites on one theme', function () {
    it('each keep their own version, and switching one leaves the other', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0')]);
      const one = await websiteOn(theme, { version: '1.0.0' });
      const other = await websiteOn(theme, { version: '1.0.0' });

      await core.destinations.keepVersion({ projectId, id: one.id });
      // Both websites read the copies the Project keeps, so the switch needs
      // no access to the theme
      await Fs.remove(theme.url);
      const switched = await core.destinations.switchVersion({
        projectId,
        id: one.id,
      });

      expect(switched.outcome).toEqual('switched');
      expect(switched.destination.contract.version).toEqual('1.1.0');
      const untouched = await core.destinations.read({
        projectId,
        id: other.id,
      });
      expect(untouched.contract.version).toEqual('1.0.0');
      expect(untouched.waiting).toBeNull();
    });
  });

  describe('switchVersion', function () {
    it('switches to the version that waits once nothing is left', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });

      const switched = await core.destinations.switchVersion({
        projectId,
        id: website.id,
      });

      expect(switched.outcome).toEqual('switched');
      expect(switched.issues).toEqual([]);
      expect(switched.destination.contract.version).toEqual('1.1.0');
      expect(switched.destination.mapping).toEqual(
        kept.destination.waiting?.mapping
      );
      expect(switched.destination.waiting).toBeNull();
      expect(await isCommitted()).toBe(true);
      // The check reads the Project against the version it switched to, and
      // the copy of the version left behind stays
      expect(
        await core.destinations.checkAll({ projectId, id: website.id })
      ).toEqual([]);
      expect(
        (
          await core.contracts.readVersion({
            projectId,
            id: website.contract.id,
            version: '1.0.0',
          })
        ).contract.version
      ).toEqual('1.0.0');
    });

    it('keeps the version in use while the Mapping lacks a required field', async function () {
      const second = withRequiredField('2.0.0');
      const theme = await themeWith([at('1.0.0'), second.contract]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await core.destinations.keepVersion({ projectId, id: website.id });

      const switched = await core.destinations.switchVersion({
        projectId,
        id: website.id,
      });

      expect(switched.outcome).toEqual('kept');
      expect(switched.issues.map((issue) => issue.message)).toContain(
        'No field of the Project fills the required field "subtitle" of "products"'
      );
      expect(switched.destination.contract.version).toEqual('1.0.0');
      expect(switched.destination.waiting?.version).toEqual('2.0.0');
      // What the editor is asked, before they map anything
      expect(
        (
          await core.destinations.checkAll({
            projectId,
            id: website.id,
            isWaitingVersion: true,
          })
        ).map((issue) => issue.issue)
      ).toContain('field_not_mapped');
    });

    it('reads one Entry against the version that waits', async function () {
      // What the screen of one Entry asks while the editor maps the new
      // version, which is the check of that Entry against what waits
      const theme = await themeWith([at('1.0.0'), withTightenedField('2.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await core.destinations.keepVersion({ projectId, id: website.id });

      const ofWaiting = await core.destinations.check({
        projectId,
        id: website.id,
        collectionId: collection.id,
        entryId: entry.id,
        isWaitingVersion: true,
      });
      const ofInUse = await core.destinations.check({
        projectId,
        id: website.id,
        collectionId: collection.id,
        entryId: entry.id,
      });

      expect(ofWaiting.map((issue) => issue.issue)).toContain(
        'constraint_violation'
      );
      expect(
        ofWaiting.every((issue) => {
          return 'entryId' in issue && issue.entryId === entry.id;
        })
      ).toBe(true);
      // The version in use takes the same Entry, so the issues come from the
      // version that waits rather than from the Entry alone
      expect(ofInUse).toEqual([]);
    });

    it('keeps the version in use while an Entry does not fit', async function () {
      const theme = await themeWith([at('1.0.0'), withTightenedField('2.0.0')]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      await core.destinations.keepVersion({ projectId, id: website.id });

      const switched = await core.destinations.switchVersion({
        projectId,
        id: website.id,
      });

      expect(switched.outcome).toEqual('kept');
      const refused = switched.issues.filter((issue) => {
        return issue.issue === 'constraint_violation';
      });
      expect(refused.length).toBeGreaterThan(0);
      expect(
        refused.every((issue) => {
          return 'entryId' in issue && issue.entryId === entry.id;
        })
      ).toBe(true);
      expect(switched.destination.contract.version).toEqual('1.0.0');
    });

    it('switches once the editor mapped what the new version needs', async function () {
      const second = withRequiredField('2.0.0');
      const theme = await themeWith([at('1.0.0'), second.contract]);
      const website = await websiteOn(theme, { version: '1.0.0' });
      const kept = await core.destinations.keepVersion({
        projectId,
        id: website.id,
      });
      const waiting = kept.destination.waiting;
      if (waiting === null) {
        throw new Error('No version waits');
      }

      await core.destinations.update({
        projectId,
        id: website.id,
        waitingMapping: mappingFilling(
          waiting.mapping,
          second.field.id,
          textFieldId
        ),
      });
      const switched = await core.destinations.switchVersion({
        projectId,
        id: website.id,
      });

      expect(switched.outcome).toEqual('switched');
      expect(switched.destination.contract.version).toEqual('2.0.0');
      expect(
        switched.destination.mapping.collections[collection.id]?.fields[
          second.field.id
        ]
      ).toEqual({ fieldDefinitionId: textFieldId });
    });
  });

  describe('a website with no version waiting', function () {
    it('holds no waiting version once it is added', async function () {
      const theme = await themeWith([at('1.0.0')]);
      const website = await websiteOn(theme);

      expect(website.waiting).toBeNull();
      expect(
        await core.destinations.checkAll({ projectId, id: website.id })
      ).toEqual([]);
    });

    it('refuses to switch, and writes nothing', async function () {
      const theme = await themeWith([at('1.0.0')]);
      const website = await websiteOn(theme);

      await expectCoreError(
        core.destinations.switchVersion({ projectId, id: website.id }),
        'PreconditionFailed',
        'No version of its Contract waits'
      );

      expect(
        (await core.destinations.read({ projectId, id: website.id })).updated
      ).toBeNull();
      expect(await isCommitted()).toBe(true);
    });

    it('refuses a check of a waiting version', async function () {
      const theme = await themeWith([at('1.0.0')]);
      const website = await websiteOn(theme);

      await expectCoreError(
        core.destinations.checkAll({
          projectId,
          id: website.id,
          isWaitingVersion: true,
        }),
        'PreconditionFailed',
        'No version of its Contract waits'
      );
      await expectCoreError(
        core.destinations.check({
          projectId,
          id: website.id,
          collectionId: collection.id,
          entryId: entry.id,
          isWaitingVersion: true,
        }),
        'PreconditionFailed',
        'No version of its Contract waits'
      );
    });

    it('reads a Destination written before a version could wait', async function () {
      // Written by hand rather than added, so nothing of it was read before
      // and the file itself is what answers
      const id = uuid();
      await Fs.outputJson(core.util.pathTo.destinationFile(projectId, id), {
        objectType: 'destination',
        id,
        coreVersion: '0.1.0',
        created: '2026-01-01T00:00:00.000Z',
        updated: null,
        name: `predates-waiting-${id}.example`,
        kind: 'website',
        contract: { id: uuid(), version: '1.0.0' },
        mapping: { collections: {} },
      });

      expect(
        (await core.destinations.read({ projectId, id })).waiting
      ).toBeNull();

      await Fs.remove(core.util.pathTo.destination(projectId, id));
    });

    it('refuses a Mapping for a waiting version', async function () {
      const theme = await themeWith([at('1.0.0')]);
      const website = await websiteOn(theme);

      await expectCoreError(
        core.destinations.update({
          projectId,
          id: website.id,
          waitingMapping: website.mapping,
        }),
        'PreconditionFailed',
        'no Mapping of a waiting version to replace'
      );
    });
  });
});

/** The Mapping given, with one more field of the Contract filled */
function mappingFilling(
  mapping: Mapping,
  contractFieldDefinitionId: string,
  fieldDefinitionId: string
): Mapping {
  const next = structuredClone(mapping);
  for (const collectionMapping of Object.values(next.collections)) {
    collectionMapping.fields[contractFieldDefinitionId] = {
      fieldDefinitionId,
    };
  }
  return next;
}
