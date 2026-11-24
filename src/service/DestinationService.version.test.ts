import Fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  destinationFileSchema,
  type Contract,
  type Mapping,
  type StringFieldDefinition,
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
  });

  describe('two websites on one theme', function () {
    it('each keep their own version, and switching one leaves the other', async function () {
      const theme = await themeWith([at('1.0.0'), at('1.1.0')]);
      const one = await websiteOn(theme, { version: '1.0.0' });
      const other = await websiteOn(theme, { version: '1.0.0' });

      await core.destinations.keepVersion({ projectId, id: one.id });
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
      // The check now reads the Project against the version it switched to
      expect(
        await core.destinations.checkAll({ projectId, id: website.id })
      ).toEqual([]);
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
      const theme = await themeWith([at('1.0.0')]);
      const website = await websiteOn(theme);
      const filePath = core.util.pathTo.destinationFile(projectId, website.id);
      const { waiting: _, ...withoutTheKey } = destinationFileSchema.parse(
        await Fs.readJson(filePath)
      );
      await Fs.outputJson(filePath, withoutTheKey);

      expect(
        (await core.destinations.read({ projectId, id: website.id })).waiting
      ).toBeNull();

      await Fs.outputJson(filePath, website);
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
