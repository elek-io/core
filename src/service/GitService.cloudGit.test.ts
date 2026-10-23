import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import { startFakeCloud } from '../test/cloud.js';
import { FakeCloudGit } from '../test/cloudGit.js';
import { createCredentialRecorder } from '../test/credentialRecorder.js';
import { startFakeGitHost, type Authorize } from '../test/gitHost.js';
import { testUserProps } from '../test/setup.js';
import { createTmpCore, expectCoreError, getFileHash } from '../test/util.js';

/**
 * Core against git hosts over HTTP, the one thing local bare remotes
 * cannot show: git and git-lfs asking for credentials. A fake elek.io Cloud
 * mints git tokens, and a fake git host behind basic auth honors them,
 * reached through `http_proxy` so any host name works without DNS.
 *
 * @see ../../contributing/testing.md
 */

const cloudGitUrl = 'http://*.git.example.test';
const hostOne = 'cell-1.git.example.test';
const hostTwo = 'cell-2.git.example.test';
const providerHost = 'git.provider.test';
const githubHost = 'github.example.test';
const image = Path.resolve('src/test/data/150x150.png');

/** A fake Cloud and a fake git host, with git pointed at both */
async function setUp(authorize?: (cloudGit: FakeCloudGit) => Authorize) {
  const cloudGit = new FakeCloudGit();
  const cloud = await startFakeCloud(cloudGit.routes());
  const gitHost = await startFakeGitHost(
    authorize === undefined ? cloudGit.authorize : authorize(cloudGit)
  );
  vi.stubEnv('http_proxy', gitHost.proxyUrl);
  vi.stubEnv('no_proxy', undefined);
  vi.stubEnv('NO_PROXY', undefined);

  // The person's own setup: a keychain in the global config and an askpass
  // a desktop sets, both recording whether git ever asked them
  const recorder = await createCredentialRecorder();
  vi.stubEnv('GIT_CONFIG_GLOBAL', recorder.globalConfig);
  vi.stubEnv('GIT_ASKPASS', recorder.askpass);
  vi.stubEnv('SSH_ASKPASS', recorder.askpass);
  vi.stubEnv('SSH_ASKPASS_REQUIRE', 'force');

  return {
    cloudGit,
    cloud,
    gitHost,
    recorded: recorder.recorded,
  };
}

/** A Core with a User, signed in to the fake Cloud when given a session */
async function cloudCore(cloudUrl: string, session: string | null) {
  const { core } = createTmpCore({
    cloud: {
      url: cloudUrl,
      gitUrl: cloudGitUrl,
      ...(session === null ? {} : { token: session }),
    },
  });
  await core.user.set(testUserProps);
  return core;
}

/** A Project with an Asset, so pushing it moves an LFS object */
async function projectWithAsset(core: ElekIoCore) {
  const project = await core.projects.create({
    name: 'Website',
    description: 'A Project on a git host',
    settings: { language: { default: 'en', supported: ['en'] } },
  });
  const asset = await core.assets.create({
    projectId: project.id,
    filePath: image,
    name: 'Logo',
    description: 'An image',
  });
  return { project, asset };
}

/** Pushes a Project to a new repository on a host and returns its remote */
async function publish(
  t: Awaited<ReturnType<typeof setUp>>,
  core: ElekIoCore,
  projectId: string,
  host: string
): Promise<string> {
  t.cloudGit.place(projectId, host);
  const url = await t.gitHost.createRepository(
    host,
    `projects/${projectId}.git`
  );
  await core.projects.setRemoteOriginUrl({ id: projectId, url });
  await core.projects.synchronize({ id: projectId });
  return url;
}

describe('git with an elek.io Cloud session', function () {
  it('pushes and clones on two git hosts, LFS included, asking git-token once per host', async function () {
    const t = await setUp();
    const core = await cloudCore(t.cloud.url, 'session-one');
    const first = await projectWithAsset(core);
    const second = await projectWithAsset(core);
    const third = await projectWithAsset(core);

    const firstUrl = await publish(t, core, first.project.id, hostOne);
    await publish(t, core, second.project.id, hostOne);
    const thirdUrl = await publish(t, core, third.project.id, hostTwo);

    expect(
      t.cloudGit.calls.map((call) => [call.endpoint, call.projectId])
    ).toEqual([
      ['git-token', first.project.id],
      ['git-access', second.project.id],
      ['git-token', third.project.id],
    ]);
    const uploads = t.gitHost.requests.filter(
      (request) => request.method === 'PUT' && request.status === 200
    );
    expect(new Set(uploads.map((request) => request.host))).toEqual(
      new Set([hostOne, hostTwo])
    );

    // Another process signs in with a session of its own, and clones from
    // both hosts with every LFS object
    const other = await cloudCore(t.cloud.url, 'session-two');
    for (const [url, published] of [
      [firstUrl, first],
      [thirdUrl, third],
    ] as const) {
      const cloned = await other.projects.clone({ url });
      expect(cloned.id).toEqual(published.project.id);
      expect(
        await getFileHash(
          other.util.pathTo.asset(
            published.project.id,
            published.asset.id,
            published.asset.extension
          )
        )
      ).toEqual(await getFileHash(image));
    }
    expect(t.cloudGit.callsTo('git-token').map((call) => call.session)).toEqual(
      ['session-one', 'session-one', 'session-two', 'session-two']
    );

    // Neither the keychain nor an askpass ever heard of a Cloud host
    expect(await t.recorded()).toEqual([]);

    // Every token minted is a sentinel no log file may hold
    for (const each of [core, other]) {
      const logs = each.util.pathTo.logs;
      for (const file of await Fs.readdir(logs)) {
        const content = await Fs.readFile(Path.join(logs, file), 'utf8');
        expect(content).not.toContain('git-token-');
        expect(content).not.toContain('session-one');
        expect(content).not.toContain('session-two');
      }
    }
  });

  it('ends an LFS push whose token the git host refuses, after asking once more', async function () {
    const t = await setUp();
    t.cloudGit.refuses = (host, rest) =>
      host === hostOne && rest.startsWith('/info/lfs/');
    const core = await cloudCore(t.cloud.url, 'session-one');
    const { project } = await projectWithAsset(core);

    await expectCoreError(
      publish(t, core, project.id, hostOne),
      'Unauthorized',
      `The git host "${hostOne}" refused the git token`
    );

    // The rerun asked for a new token, and nothing looped
    expect(t.cloudGit.callsTo('git-token')).toHaveLength(2);
    const lfsRequests = t.gitHost.requests.filter((request) =>
      request.rest.startsWith('/info/lfs/')
    );
    expect(lfsRequests.length).toBeGreaterThan(0);
    expect(lfsRequests.length).toBeLessThan(12);
    expect(await t.recorded()).toEqual([]);
  });

  it('asks again for a grant taken back, and throws NotFound once the Project is gone', async function () {
    const t = await setUp();
    const core = await cloudCore(t.cloud.url, 'session-one');
    const { project } = await projectWithAsset(core);
    await publish(t, core, project.id, hostOne);

    t.cloudGit.takeBack(project.id);
    t.cloudGit.remove(project.id);
    // The token is live, so the git host answers as for a missing repository
    await expect(
      core.projects.synchronize({ id: project.id })
    ).rejects.toThrow();
    expect(t.cloudGit.callsTo('git-access')).toHaveLength(0);

    await expectCoreError(
      core.projects.synchronize({ id: project.id }),
      'NotFound',
      project.id
    );
    expect(t.cloudGit.callsTo('git-access')).toHaveLength(1);
  });

  it("throws the Cloud call's error when Cloud could not reach the git host", async function () {
    const t = await setUp();
    const core = await cloudCore(t.cloud.url, 'session-one');
    const { project } = await projectWithAsset(core);
    t.cloudGit.next.push(Response.json({}, { status: 502 }));

    await expectCoreError(
      publish(t, core, project.id, hostOne),
      'PreconditionFailed',
      'could not reach the git host'
    );
  });

  it("keeps the person's own helper for a host that is not Cloud's", async function () {
    const t = await setUp(
      (cloudGit) => (request) =>
        request.host === githubHost
          ? request.password === 'keychain-secret'
            ? 200
            : 401
          : cloudGit.authorize(request)
    );
    const core = await cloudCore(t.cloud.url, 'session-one');
    const { project } = await projectWithAsset(core);

    await publish(t, core, project.id, githubHost);

    const asked = await t.recorded();
    expect(asked).toContain('keychain get');
    expect(asked.some((line) => line.startsWith('askpass'))).toBe(false);
    expect(t.cloudGit.calls).toEqual([]);
  });
});

describe('git signed out of elek.io Cloud', function () {
  it('throws Unauthorized for a Cloud host, and no askpass or keychain runs', async function () {
    const t = await setUp();
    const core = await cloudCore(t.cloud.url, null);
    const { project } = await projectWithAsset(core);

    await expectCoreError(
      publish(t, core, project.id, hostOne),
      'Unauthorized',
      'Sign in to elek.io Cloud'
    );
    expect(await t.recorded()).toEqual([]);
    expect(t.cloudGit.calls).toEqual([]);
  });

  it('reaches a Cloud remote with ELEK_IO_REMOTE_ACCESS_TOKEN alone', async function () {
    const t = await setUp(
      (cloudGit) => (request) =>
        request.password === 'pipeline-token'
          ? 200
          : cloudGit.authorize(request)
    );
    const publisher = await cloudCore(t.cloud.url, 'session-one');
    const { project } = await projectWithAsset(publisher);
    const url = await publish(t, publisher, project.id, hostOne);

    vi.stubEnv('ELEK_IO_REMOTE_ACCESS_TOKEN', 'pipeline-token');
    const pipeline = await cloudCore(t.cloud.url, null);
    const cloned = await pipeline.projects.clone({ url });

    expect(cloned.id).toEqual(project.id);
    const viaToken = t.gitHost.requests.filter(
      (request) => request.password === 'pipeline-token'
    );
    expect(viaToken.length).toBeGreaterThan(0);
    expect(viaToken.every((request) => request.status === 200)).toBe(true);
    expect(await t.recorded()).toEqual([]);
  });

  it('ends an LFS push whose ELEK_IO_REMOTE_ACCESS_TOKEN the git host refuses', async function () {
    const t = await setUp(
      (cloudGit) => (request) =>
        request.host === providerHost
          ? request.password === 'provider-token' &&
            !request.rest.startsWith('/info/lfs/')
            ? 200
            : 401
          : cloudGit.authorize(request)
    );
    vi.stubEnv('ELEK_IO_REMOTE_ACCESS_TOKEN', 'provider-token');
    const core = await cloudCore(t.cloud.url, null);
    const { project } = await projectWithAsset(core);

    await expectCoreError(
      publish(t, core, project.id, providerHost),
      'Unauthorized',
      'ELEK_IO_REMOTE_ACCESS_TOKEN'
    );

    // Askpass looped here thousands of times, the helper hears the erase
    const lfsRequests = t.gitHost.requests.filter((request) =>
      request.rest.startsWith('/info/lfs/')
    );
    expect(lfsRequests.length).toBeGreaterThan(0);
    expect(lfsRequests.length).toBeLessThan(12);
    expect(await t.recorded()).toEqual([]);
  });
});
