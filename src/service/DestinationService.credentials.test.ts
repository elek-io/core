import Path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import { CONTRACT_FILE_NAME } from '../schema/index.js';
import { startFakeCloud } from '../test/cloud.js';
import { FakeCloudGit } from '../test/cloudGit.js';
import { createCredentialRecorder } from '../test/credentialRecorder.js';
import { startFakeGitHost, type Authorize } from '../test/gitHost.js';
import { testUserProps } from '../test/setup.js';
import { createTmpCore, execGit, expectCoreError } from '../test/util.js';

/**
 * Who answers for a theme's address, which is the one git call Core makes
 * with the person's own access and no token of its own. A fake git host
 * behind basic auth records the credential it received, and a keychain
 * stand-in records whether git ever asked it.
 *
 * @see ../../contributing/git-credentials.md
 */

const cloudGitUrl = 'http://*.git.example.test';
const themeHost = 'themes.provider.test';
const projectHost = 'cell-1.git.example.test';
const themePath = 'acme/dealer-site.git';

/** A fake Cloud, a fake git host and the person's own credential setup */
async function setUp(authorize: Authorize) {
  const cloudGit = new FakeCloudGit();
  const cloud = await startFakeCloud(cloudGit.routes());
  const gitHost = await startFakeGitHost(authorize);
  vi.stubEnv('http_proxy', gitHost.proxyUrl);
  vi.stubEnv('no_proxy', undefined);
  vi.stubEnv('NO_PROXY', undefined);

  const recorder = await createCredentialRecorder();
  vi.stubEnv('GIT_CONFIG_GLOBAL', recorder.globalConfig);
  vi.stubEnv('GIT_ASKPASS', recorder.askpass);
  vi.stubEnv('SSH_ASKPASS', recorder.askpass);
  vi.stubEnv('SSH_ASKPASS_REQUIRE', 'force');

  return { cloudGit, cloud, gitHost, recorded: recorder.recorded };
}

/** A Core with a User and the remote access token every host but Cloud's gets */
async function coreWithToken(cloudUrl: string) {
  vi.stubEnv('ELEK_IO_REMOTE_ACCESS_TOKEN', 'core-remote-token');
  vi.stubEnv('ELEK_IO_REMOTE_ACCESS_TOKEN_USER', 'x-access-token');
  const { core } = createTmpCore({
    cloud: { url: cloudUrl, gitUrl: cloudGitUrl },
  });
  await core.user.set(testUserProps);
  return core;
}

/** A theme on the host, holding one tagged version with its Contract */
async function publishTheme(
  core: ElekIoCore,
  gitHost: Awaited<ReturnType<typeof setUp>>['gitHost'],
  projectId: string
): Promise<string> {
  const url = await gitHost.createRepository(themeHost, themePath);
  const contract = await core.contracts.generate({
    projectId,
    name: '@acme/dealer-site',
    version: '1.0.0',
  });
  const workPath = Path.join(core.options.dataDir, 'theme-work');
  await execGit(core.options.dataDir, [
    'init',
    '--quiet',
    '--initial-branch=main',
    workPath,
  ]);
  await execGit(workPath, ['config', 'user.name', 'Theme Author']);
  await execGit(workPath, ['config', 'user.email', 'author@theme.test']);
  const { writeFile } = await import('fs-extra');
  await writeFile(
    Path.join(workPath, CONTRACT_FILE_NAME),
    `${JSON.stringify(contract, null, 2)}\n`
  );
  await execGit(workPath, ['add', '--all']);
  await execGit(workPath, ['commit', '--quiet', '--message=Release v1.0.0']);
  await execGit(workPath, ['tag', '--annotate', 'v1.0.0', '--message=v1.0.0']);
  // Pushed with the host's own credential in the address, which is how the
  // theme's author would do it. Core never writes to a theme
  await execGit(workPath, [
    'push',
    '--quiet',
    url.replace('http://', 'http://person:keychain-secret@'),
    'main',
    '--tags',
  ]);
  return url;
}

/** A Project on Cloud's git host, so the token path is in play too */
async function projectOf(core: ElekIoCore) {
  const project = await core.projects.create({
    name: 'Website',
    description: 'A Project with a website',
    settings: { language: { default: 'en', supported: ['en'] } },
  });
  await core.collections.create({
    projectId: project.id,
    icon: 'home',
    name: { singular: { en: 'Car' }, plural: { en: 'Cars' } },
    slug: { singular: 'car', plural: 'cars' },
    description: { en: 'Cars' },
    fieldDefinitions: [],
  });
  return project;
}

describe("a theme's address and Core's own token", function () {
  it("gets the person's own credential and never the remote token", async function () {
    const t = await setUp(({ host, username, password }) => {
      if (host !== themeHost) {
        return 404;
      }
      return username === 'person' && password === 'keychain-secret'
        ? 200
        : 401;
    });
    const core = await coreWithToken(t.cloud.url);
    const project = await projectOf(core);
    const url = await publishTheme(core, t.gitHost, project.id);
    t.gitHost.requests.length = 0;

    const read = await core.contracts.readFromTheme({ url });

    expect(read.version).toEqual('1.0.0');
    // git probes once without a credential and is answered 401, then asks a
    // helper. The only credential the theme's host ever saw is the person's
    const seen = t.gitHost.requests
      .filter((request) => request.host === themeHost)
      .map((request) => request.username)
      .filter((username) => username !== null);
    expect(seen.length).toBeGreaterThan(0);
    expect([...new Set(seen)]).toEqual(['person']);
    // And the keychain was asked, which is what answers for a private theme
    expect(await t.recorded()).toContain('keychain get');
  });

  it("sends a Project's remote the token while reading a theme with the person's own access", async function () {
    const t = await setUp(({ host, username }) => {
      if (host === themeHost) {
        return username === 'person' ? 200 : 401;
      }
      if (host === projectHost) {
        return username === 'x-access-token' ? 200 : 401;
      }
      return 404;
    });
    const core = await coreWithToken(t.cloud.url);
    const project = await projectOf(core);
    const themeUrl = await publishTheme(core, t.gitHost, project.id);
    const projectUrl = await t.gitHost.createRepository(
      projectHost,
      `projects/${project.id}.git`
    );
    await core.projects.setRemoteOriginUrl({ id: project.id, url: projectUrl });
    await core.projects.synchronize({ id: project.id });
    t.gitHost.requests.length = 0;

    await core.contracts.readFromTheme({ url: themeUrl });
    await core.projects.synchronize({ id: project.id });

    const byHost = new Map<string, Set<string>>();
    for (const request of t.gitHost.requests) {
      if (request.username === null) {
        continue;
      }
      byHost.set(
        request.host,
        (byHost.get(request.host) ?? new Set()).add(request.username)
      );
    }
    expect([...(byHost.get(themeHost) ?? [])]).toEqual(['person']);
    expect([...(byHost.get(projectHost) ?? [])]).toEqual(['x-access-token']);
  });

  it('says the person has no access, naming their own rather than the token', async function () {
    const t = await setUp(({ host }) => (host === themeHost ? 401 : 404));
    const core = await coreWithToken(t.cloud.url);

    await expectCoreError(
      core.contracts.readFromTheme({
        url: `http://${themeHost}/${themePath}`,
      }),
      'Unauthorized',
      'your own git access'
    );
  });

  it('never names the remote token in what it says about an address', async function () {
    const t = await setUp(({ host }) => (host === themeHost ? 401 : 404));
    const core = await coreWithToken(t.cloud.url);

    const error = await core.contracts
      .readFromTheme({ url: `http://${themeHost}/${themePath}` })
      .then(
        () => null,
        (caught: unknown) => caught
      );

    expect(String(error)).not.toContain('ELEK_IO_REMOTE_ACCESS_TOKEN_USER');
    expect(String(error)).toContain('never with ELEK_IO_REMOTE_ACCESS_TOKEN');
    expect(String(error)).toContain('Ask whoever maintains the address');
  });
});
