import { beforeAll, describe, expect, it, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import type { StringFieldDefinition } from '../schema/index.js';
import core, {
  CoreError,
  flattenFieldDefinitions,
  uuid,
  type Collection,
  type Contract,
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
import { getCore } from './util.js';
import { websiteAddAction } from './websiteAddAction.js';
import { websiteUpdateAction } from './websiteUpdateAction.js';

/**
 * Exercises websiteUpdateAction in process, the way websiteAddAction.test.ts
 * does, so the CLI Core of this worker writes into the shared test Core's
 * Projects. The exit code lives in the binary entry, covered by
 * index.cli.test.ts.
 */
describe('websiteUpdateAction', function () {
  let projectId = '';
  let collection: Collection;
  let entry: Entry;
  let contract: Contract;
  /**
   * The Core the action writes through, which is the one every assertion
   * reads through too: two instances on one data directory each cache the
   * files they read, and only this one sees what the action wrote
   */
  let cli: ElekIoCore;

  beforeAll(async function () {
    cli = getCore();
    const project = await createProject();
    projectId = project.id;
    collection = await createCollection(projectId);
    const asset = await createAsset(projectId);
    entry = await createEntry(projectId, collection.id, asset.id);
    contract = await core.contracts.generate({
      projectId,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });
  });

  /** The Project's own Contract at another version */
  function at(version: string): Contract {
    return { ...structuredClone(contract), version };
  }

  /**
   * The Contract at another version, refusing the Value the Entry holds for
   * the Project's own text field
   */
  function tightened(version: string): Contract {
    const next = demanding(version);
    for (const field of flattenFieldDefinitions(
      next.collections[0]?.fieldDefinitions ?? []
    )) {
      if (field.valueType === 'string' && 'max' in field) {
        field.max = 1;
      }
    }
    return next;
  }

  /** A required text field no field definition of the Project has */
  function requiredField(slug: string): StringFieldDefinition {
    return {
      id: uuid(),
      slug,
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
  }

  /** The Contract at another version, with a required field nothing fills */
  function demanding(
    version: string,
    field: StringFieldDefinition = requiredField('subtitle')
  ): Contract {
    const next = at(version);
    next.collections[0]?.fieldDefinitions.push(field);
    return next;
  }

  /** A theme that released every Contract given, and a website on its first */
  async function websiteOn(name: string, contracts: Contract[]) {
    const theme = await createFakeTheme();
    const [first] = contracts;
    if (first === undefined) {
      throw new Error('A theme releases at least one version');
    }
    await theme.release({
      tag: `v${first.version}`,
      files: contractFileOf(first),
    });
    await websiteAddAction({ project: projectId, name, theme: theme.url });
    for (const released of contracts.slice(1)) {
      await theme.release({
        tag: `v${released.version}`,
        files: contractFileOf(released),
      });
    }
    const { list } = await cli.destinations.list({ projectId, limit: 0 });
    const website = list.find((candidate) => candidate.name === name);
    if (website === undefined) {
      throw new Error(`The Project holds no website "${name}"`);
    }
    return website;
  }

  it('switches the website to the newest version the theme tagged', async function () {
    const website = await websiteOn('switched.example', [
      at('1.0.0'),
      at('1.4.0'),
    ]);

    await websiteUpdateAction({ project: projectId, name: 'switched.example' });

    const after = await cli.destinations.read({ projectId, id: website.id });
    expect(after.contract.version).toEqual('1.4.0');
    expect(after.waiting).toBeNull();
  });

  it('switches to the version it is given instead', async function () {
    const website = await websiteOn('pinned.example', [
      at('1.0.0'),
      at('1.4.0'),
      at('2.0.0'),
    ]);

    await websiteUpdateAction({
      project: projectId,
      name: 'pinned.example',
      version: '1.4.0',
    });

    expect(
      (await cli.destinations.read({ projectId, id: website.id })).contract
        .version
    ).toEqual('1.4.0');
  });

  it('takes the website by its id as well', async function () {
    const website = await websiteOn('by-id.example', [
      at('1.0.0'),
      at('1.1.0'),
    ]);

    await websiteUpdateAction({ project: projectId, name: website.id });

    expect(
      (await cli.destinations.read({ projectId, id: website.id })).contract
        .version
    ).toEqual('1.1.0');
  });

  it('does nothing while the website uses the newest version', async function () {
    const website = await websiteOn('current.example', [at('1.0.0')]);

    await websiteUpdateAction({ project: projectId, name: 'current.example' });

    const after = await cli.destinations.read({ projectId, id: website.id });
    expect(after.contract.version).toEqual('1.0.0');
    expect(after.waiting).toBeNull();
    expect(after.updated).toBeNull();
  });

  it('names each item the new version lacks, and keeps the version in use', async function () {
    const website = await websiteOn('demanding.example', [
      at('1.0.0'),
      demanding('2.0.0'),
    ]);
    const printed = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const logged = vi.spyOn(getCore().logger, 'warn');

    let terminal = '';
    let logFile = '';
    try {
      await expectCoreError(
        websiteUpdateAction({
          project: projectId,
          name: 'demanding.example',
        }),
        'PreconditionFailed',
        'keeps using'
      );
    } finally {
      // Read before restoring, which drops what the spy recorded
      terminal = JSON.stringify(printed.mock.calls);
      logFile = JSON.stringify(logged.mock.calls);
      printed.mockRestore();
      logged.mockRestore();
    }

    // The field's own slug reaches the person at the terminal, and the log
    // file gets the kind of issue and the ids
    expect(terminal).toContain(
      'No field of the Project fills the required field'
    );
    expect(terminal).toContain('subtitle');
    expect(logFile).toContain('field_not_mapped');
    expect(logFile).not.toContain('subtitle');
    const after = await cli.destinations.read({ projectId, id: website.id });
    expect(after.contract.version).toEqual('1.0.0');
    // It waits, so the editor maps the rest rather than reading the theme again
    expect(after.waiting?.version).toEqual('2.0.0');
  });

  it('switches on the next run once the Mapping covers the new version', async function () {
    const second = demanding('2.0.0');
    const added = second.collections[0]?.fieldDefinitions.at(-1);
    const filled = collection.fieldDefinitions[0];
    if (added === undefined || filled === undefined) {
      throw new Error('The Contract or the Collection holds no field');
    }
    const website = await websiteOn('mapped-later.example', [
      at('1.0.0'),
      second,
    ]);
    await expectCoreError(
      websiteUpdateAction({ project: projectId, name: 'mapped-later.example' }),
      'PreconditionFailed',
      'keeps using'
    );
    const waiting = (await cli.destinations.read({ projectId, id: website.id }))
      .waiting;
    if (waiting === null) {
      throw new Error('No version waits');
    }
    const mapping = structuredClone(waiting.mapping);
    for (const collectionMapping of Object.values(mapping.collections)) {
      collectionMapping.fields[added.id] = { fieldDefinitionId: filled.id };
    }
    await cli.destinations.update({
      projectId,
      id: website.id,
      waitingMapping: mapping,
    });

    // The theme is read again and answers the same version, so what the
    // editor mapped is what the second run switches to
    await websiteUpdateAction({
      project: projectId,
      name: 'mapped-later.example',
    });

    const after = await cli.destinations.read({ projectId, id: website.id });
    expect(after.contract.version).toEqual('2.0.0');
    expect(after.mapping).toEqual(mapping);
    expect(after.waiting).toBeNull();
  });

  it('commits on the branch the Project is checked out on', async function () {
    await websiteOn('committed.example', [at('1.0.0'), at('1.1.0')]);

    await websiteUpdateAction({
      project: projectId,
      name: 'committed.example',
    });

    expect(await core.projects.branches.current({ id: projectId })).toEqual(
      'draft'
    );
    expect(
      (await core.git.status(core.util.pathTo.project(projectId))).files
    ).toEqual([]);
  });

  it('names the websites the Project has when it holds none of that name', async function () {
    await expectCoreError(
      websiteUpdateAction({ project: projectId, name: 'nothing.example' }),
      'NotFound',
      'has no website "nothing.example"'
    );
  });

  it('names the Entry, the field and the language of a Value that does not fit', async function () {
    const field = flattenFieldDefinitions(collection.fieldDefinitions)[0];
    if (field === undefined) {
      throw new Error('The Collection holds no field definition');
    }
    await websiteOn('refused.example', [at('1.0.0'), tightened('2.0.0')]);
    const printed = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const logged = vi.spyOn(getCore().logger, 'warn');

    let terminal = '';
    let logFile = '';
    let refused: unknown;
    try {
      refused = await websiteUpdateAction({
        project: projectId,
        name: 'refused.example',
      }).then(
        () => null,
        (caught: unknown) => caught
      );
    } finally {
      // Read before restoring, which drops what the spy recorded
      terminal = printed.mock.calls.map((call) => String(call[0])).join('\n');
      logFile = JSON.stringify(logged.mock.calls);
      printed.mockRestore();
      logged.mockRestore();
    }
    const left = refused instanceof CoreError ? refused.message : '';

    // The Contract's refusal says what is wrong without saying where, so the
    // line in front of it names what a person opens to change the Value
    expect(terminal).toContain(`Entry "${entry.id}"`);
    expect(terminal).toContain(`Collection "${collection.id}"`);
    expect(terminal).toContain(`field "${field.slug}" in "en"`);
    expect(terminal).toContain(`field "${field.slug}" in "de"`);
    expect(terminal).toContain('Too big');
    // One Entry does not fit, in two languages, and the field of the Contract
    // nothing fills is counted on its own
    expect(left).toContain('keeps using');
    expect(left).toContain('1 item it needs is unmapped');
    expect(left).toContain('1 Entry does not fit');
    // The log file gets the kind of issue and the ids, never a slug or a
    // Value, see contributing/logging.md
    expect(logFile).toContain('constraint_violation');
    expect(logFile).toContain(entry.id);
    expect(logFile).not.toContain(field.slug);
    expect(logFile).not.toContain('Too big');
  });

  it('switches on the next run once the Project holds the field the version needs', async function () {
    // Its own slug, because the Project's Collection keeps the field
    // definition this test adds to it
    const added = requiredField('gained-subtitle');
    const website = await websiteOn('gained.example', [
      at('1.0.0'),
      demanding('2.0.0', added),
    ]);
    await expectCoreError(
      websiteUpdateAction({ project: projectId, name: 'gained.example' }),
      'PreconditionFailed',
      'keeps using'
    );

    // No CLI command writes a Mapping, so what a developer with the CLI
    // alone does is add the field definition the refusal named, with the id
    // the Contract carries
    await cli.collections.update({
      ...collection,
      projectId,
      fieldDefinitions: [...collection.fieldDefinitions, added],
      resolutions: {
        [entry.id]: {
          [added.slug]: {
            objectType: 'value',
            valueType: 'string',
            content: { en: 'A subtitle', de: 'Ein Untertitel' },
          },
        },
      },
    });
    await websiteUpdateAction({ project: projectId, name: 'gained.example' });

    const after = await cli.destinations.read({ projectId, id: website.id });
    expect(after.contract.version).toEqual('2.0.0');
    expect(after.waiting).toBeNull();
    expect(after.mapping.collections[collection.id]?.fields[added.id]).toEqual({
      fieldDefinitionId: added.id,
    });
  });
});
