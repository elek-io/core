import Fs from 'fs-extra';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Contract } from '../schema/index.js';
import { CONTRACT_FILE_NAME } from '../schema/index.js';
import core from '../test/setup.js';
import { contractFileOf, createFakeTheme } from '../test/theme.js';
import {
  createCollection,
  createProject,
  expectCoreError,
} from '../test/util.js';

/**
 * Reading a Contract from a theme's git address, against real repositories.
 * A local bare repository is an address a Project's remote takes too, so
 * these need no git host. Whose credentials reach the address is proven in
 * `DestinationService.credentials.test.ts`.
 */
describe('reading a Contract from a theme', function () {
  let projectId = '';
  let destroy: () => Promise<void>;
  let contract: Contract;

  beforeAll(async function () {
    const project = await createProject();
    projectId = project.id;
    destroy = project.destroy;
    await createCollection(projectId);
    contract = await core.contracts.generate({
      projectId,
      name: '@acme/dealer-site',
      version: '1.0.0',
    });
  });

  afterAll(async function () {
    await destroy();
  });

  /** The same Contract under another version, as a later release carries it */
  function at(version: string): Contract {
    return { ...contract, version };
  }

  it('reads the newest version the theme tagged', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(at('1.0.0')) });
    await theme.release({ tag: 'v1.9.0', files: contractFileOf(at('1.9.0')) });
    const commit = await theme.release({
      tag: 'v1.10.0',
      files: contractFileOf(at('1.10.0')),
    });

    const read = await core.contracts.readFromTheme({ url: theme.url });

    expect(read.version).toEqual('1.10.0');
    expect(read.commit).toEqual(commit);
    expect(read.contract.name).toEqual('@acme/dealer-site');
    expect(read.contract.collections).toEqual(contract.collections);
  });

  it('reads the version it is given rather than the newest', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(at('1.0.0')) });
    await theme.release({ tag: 'v2.0.0', files: contractFileOf(at('2.0.0')) });

    const read = await core.contracts.readFromTheme({
      url: theme.url,
      version: '1.0.0',
    });

    expect(read.version).toEqual('1.0.0');
  });

  it('reads a lightweight tag as well as an annotated one', async function () {
    const theme = await createFakeTheme();
    const commit = await theme.release({
      tag: 'v1.0.0',
      files: contractFileOf(at('1.0.0')),
      isLightweight: true,
    });

    const read = await core.contracts.readFromTheme({ url: theme.url });

    expect(read.commit).toEqual(commit);
  });

  it('leaves a pre-release out unless it is named', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(at('1.0.0')) });
    await theme.release({
      tag: 'v2.0.0-beta.1',
      files: contractFileOf(at('2.0.0-beta.1')),
    });

    expect(
      (await core.contracts.readFromTheme({ url: theme.url })).version
    ).toEqual('1.0.0');
    expect(
      (
        await core.contracts.readFromTheme({
          url: theme.url,
          version: '2.0.0-beta.1',
        })
      ).version
    ).toEqual('2.0.0-beta.1');
  });

  it('says the theme tagged no version', async function () {
    const theme = await createFakeTheme();

    await expectCoreError(
      core.contracts.readFromTheme({ url: theme.url }),
      'PreconditionFailed',
      'tagged no version',
      'theme_without_version'
    );
  });

  it('says a version it has not tagged is not there', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(at('1.0.0')) });

    await expectCoreError(
      core.contracts.readFromTheme({ url: theme.url, version: '2.0.0' }),
      'NotFound',
      'no tag "v2.0.0"'
    );
  });

  it('says the newest version holds no Contract', async function () {
    const theme = await createFakeTheme();
    await theme.release({
      tag: 'v1.0.0',
      files: { 'index.astro': '<html />' },
    });

    await expectCoreError(
      core.contracts.readFromTheme({ url: theme.url }),
      'NotFound',
      `no ${CONTRACT_FILE_NAME} at "v1.0.0"`
    );
  });

  it('says the Contract does not parse', async function () {
    const theme = await createFakeTheme();
    await theme.release({
      tag: 'v1.0.0',
      files: { [CONTRACT_FILE_NAME]: '{ "name": "@acme/dealer-site" }' },
    });

    await expectCoreError(
      core.contracts.readFromTheme({ url: theme.url }),
      'BadRequest',
      'is no Contract'
    );
  });

  it('says the Contract carries another version than its tag', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(at('9.9.9')) });

    await expectCoreError(
      core.contracts.readFromTheme({ url: theme.url }),
      'BadRequest',
      'carries version "9.9.9" rather than "1.0.0"'
    );
  });

  it('says an address it cannot read cannot be read', async function () {
    await expectCoreError(
      core.contracts.readFromTheme({
        url: Path.join(core.util.pathTo.tmp, 'no-theme-here.git'),
      }),
      'Internal'
    );
  });

  it('leaves no scratch repository behind, whether it read or refused', async function () {
    const theme = await createFakeTheme();
    await theme.release({ tag: 'v1.0.0', files: contractFileOf(at('1.0.0')) });
    const before = await Fs.readdir(core.util.pathTo.tmp);

    await core.contracts.readFromTheme({ url: theme.url });
    await core.contracts
      .readFromTheme({ url: theme.url, version: '2.0.0' })
      .catch(() => undefined);

    expect(await Fs.readdir(core.util.pathTo.tmp)).toEqual(before);
  });

  it('refuses an address git would run as a command, without running git', async function () {
    const pwned = Path.join(core.util.pathTo.tmp, 'pwned');
    await Fs.remove(pwned);
    // git's own default for `protocol.ext.allow` is `never`, so the refusal
    // rather than that default has to be what stops this. A person whose
    // config allows the transport is who this protects
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'protocol.ext.allow');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'always');

    await expectCoreError(
      core.contracts.readFromTheme({
        url: `ext::sh -c touch% ${pwned}`,
      }),
      'BadRequest',
      'remote helper'
    );

    expect(await Fs.pathExists(pwned)).toEqual(false);
    vi.unstubAllEnvs();
  });

  it('refuses an address carrying a credential, and never repeats it', async function () {
    await expectCoreError(
      core.contracts.readFromTheme({
        url: 'https://nils:ghp_secret@github.com/acme/dealer-site.git',
      }),
      'BadRequest',
      'carries a credential'
    );
    await core.contracts
      .readFromTheme({
        url: 'https://nils:ghp_secret@github.com/acme/dealer-site.git',
      })
      .catch((error: unknown) => {
        expect(String(error)).not.toContain('ghp_secret');
      });
  });

  it('refuses an address git would read as one of its own options', async function () {
    await expectCoreError(
      core.contracts.readFromTheme({ url: '--upload-pack=id' }),
      'BadRequest',
      'one of its own options'
    );
  });
});
