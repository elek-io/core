import { beforeAll, describe, expect, it, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import core, { uuid, type Collection, type Contract } from '../test/setup.js';
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
    await createEntry(projectId, collection.id, asset.id);
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

  /** The Contract at another version, with a required field nothing fills */
  function demanding(version: string): Contract {
    const next = at(version);
    next.collections[0]?.fieldDefinitions.push({
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
});
