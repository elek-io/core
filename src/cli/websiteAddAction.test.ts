import { beforeAll, describe, expect, it } from 'vitest';
import core, { uuid, type Collection } from '../test/setup.js';
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

/**
 * Exercises websiteAddAction in process. The CLI Core of this worker
 * resolves its data directory from the worker's ELEK_IO_DATA_DIR, so the
 * shared test Core's Projects are the ones it writes into. The exit code
 * lives in the binary entry, covered by index.cli.test.ts.
 */
describe('websiteAddAction', function () {
  let projectId = '';
  let collection: Collection;

  beforeAll(async function () {
    getCore();
    const project = await createProject();
    projectId = project.id;
    collection = await createCollection(projectId);
    const asset = await createAsset(projectId);
    await createEntry(projectId, collection.id, asset.id);
  });

  /** A theme holding the Project's own Contract at the given versions */
  async function themeWith(versions: string[]) {
    const theme = await createFakeTheme();
    for (const version of versions) {
      const contract = await core.contracts.generate({
        projectId,
        name: '@acme/dealer-site',
        version,
      });
      await theme.release({
        tag: `v${version}`,
        files: contractFileOf(contract),
      });
    }
    return theme;
  }

  it('adds the website at the newest version the theme tagged', async function () {
    const theme = await themeWith(['1.0.0', '1.4.0']);

    await websiteAddAction({
      project: projectId,
      name: 'newest.example',
      theme: theme.url,
    });

    const page = await core.destinations.list({ projectId, limit: 0 });
    const added = page.list.find(
      (website) => website.name === 'newest.example'
    );
    expect(added?.contract.version).toEqual('1.4.0');
    expect(added?.kind).toEqual('website');
  });

  it('adds it at the version it is given instead', async function () {
    const theme = await themeWith(['1.0.0', '1.4.0']);

    await websiteAddAction({
      project: projectId,
      name: 'pinned.example',
      theme: theme.url,
      version: '1.0.0',
    });

    const page = await core.destinations.list({ projectId, limit: 0 });
    expect(
      page.list.find((website) => website.name === 'pinned.example')?.contract
        .version
    ).toEqual('1.0.0');
  });

  it('commits the website on the branch the Project is checked out on', async function () {
    const theme = await themeWith(['1.0.0']);

    await websiteAddAction({
      project: projectId,
      name: 'committed.example',
      theme: theme.url,
    });

    expect(await core.projects.branches.current({ id: projectId })).toEqual(
      'draft'
    );
    expect(
      (await core.git.status(core.util.pathTo.project(projectId))).files
    ).toEqual([]);
  });

  it('refuses while the website cannot take the Project, and keeps it', async function () {
    const theme = await createFakeTheme();
    const demanding = await core.contracts.generate({
      projectId,
      name: '@acme/demanding-site',
      version: '1.0.0',
    });
    // A Collection the Contract names that the Project does not hold, so the
    // Mapping can never fill it
    const unfillable = structuredClone(demanding.collections[0]);
    if (unfillable !== undefined) {
      unfillable.id = uuid();
      unfillable.slug = { singular: 'extra', plural: 'extras' };
      demanding.collections.push(unfillable);
    }
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(demanding) });

    await expectCoreError(
      websiteAddAction({
        project: projectId,
        name: 'unfillable.example',
        theme: theme.url,
      }),
      'PreconditionFailed',
      'cannot take it yet'
    );

    const page = await core.destinations.list({ projectId, limit: 0 });
    expect(
      page.list.some((website) => website.name === 'unfillable.example')
    ).toEqual(true);
  });

  it('adds nothing for an address carrying a credential', async function () {
    const before = await core.destinations.count({ projectId });

    await expectCoreError(
      websiteAddAction({
        project: projectId,
        name: 'credential.example',
        theme: 'https://nils:ghp_secret@github.com/acme/dealer-site.git',
      }),
      'BadRequest',
      'carries a credential'
    );

    expect(await core.destinations.count({ projectId })).toEqual(before);
  });

  it('adds nothing for an address that tagged no version', async function () {
    const theme = await createFakeTheme();
    const before = await core.destinations.count({ projectId });

    await expectCoreError(
      websiteAddAction({
        project: projectId,
        name: 'untagged.example',
        theme: theme.url,
      }),
      'PreconditionFailed',
      'tagged no version',
      'theme_without_version'
    );

    expect(await core.destinations.count({ projectId })).toEqual(before);
  });

  it('refuses a name the Project already uses', async function () {
    const theme = await themeWith(['1.0.0']);
    await websiteAddAction({
      project: projectId,
      name: 'taken.example',
      theme: theme.url,
    });

    await expectCoreError(
      websiteAddAction({
        project: projectId,
        name: 'taken.example',
        theme: theme.url,
      }),
      'Conflict',
      'already in use'
    );
  });
});
