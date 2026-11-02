import Fs from 'fs-extra';
import Path from 'node:path';
import { assert, describe, expect, it, vi } from 'vitest';
import type ElekIoCore from '../index.node.js';
import { createCredentialRecorder } from '../test/credentialRecorder.js';
import { startFakeGitHost, type Authorize } from '../test/gitHost.js';
import { testUserProps, uuid } from '../test/setup.js';
import { createTmpCore } from '../test/util.js';
import { CoreError } from '../util/shared.js';

/**
 * A remote address can carry a user and a token, which git accepts and
 * Core's own docs reject. Nothing Core writes down may repeat one: not a
 * message somebody is shown and pastes into a report, and not a line in a
 * log file that can be handed on.
 *
 * A string nothing else in the suite produces stands in for the token, the
 * way the log sweep's sentinels do. See contributing/logging.md.
 */
const sentinelToken = 'zqx-canary-7b31d4-remote-token';
const gitHostName = 'git.provider.test';
const image = Path.resolve('src/test/data/150x150.png');

/**
 * A git host over HTTP that every git command reaches through
 * `http_proxy`, with nothing but the address left to answer it: no
 * keychain, and an askpass that fails rather than supplying a credential.
 */
async function setUp(authorize: Authorize = () => 200) {
  const gitHost = await startFakeGitHost(authorize);
  vi.stubEnv('http_proxy', gitHost.proxyUrl);
  vi.stubEnv('no_proxy', undefined);
  vi.stubEnv('NO_PROXY', undefined);
  const recorder = await createCredentialRecorder();
  vi.stubEnv('GIT_CONFIG_GLOBAL', recorder.emptyHelperConfig);
  vi.stubEnv('GIT_ASKPASS', recorder.failingAskpass);
  vi.stubEnv('SSH_ASKPASS', recorder.failingAskpass);
  return gitHost;
}

/**
 * A Project on its own data directory, pushed to a repository on the fake
 * host through an address carrying the sentinel token. The Core logs at
 * `debug`, so every git command line reaches its log files too.
 */
async function publishedProject(
  gitHost: Awaited<ReturnType<typeof setUp>>,
  options?: { withAsset: boolean }
) {
  const { core } = createTmpCore({ log: { level: 'debug' } });
  await core.user.set(testUserProps);
  const project = await core.projects.create({
    name: 'Autohaus Ebersfelde',
    description: 'A Project on a git host',
    settings: { language: { default: 'en', supported: ['en'] } },
  });
  if (options?.withAsset === true) {
    await core.assets.create({
      projectId: project.id,
      filePath: image,
      name: 'Logo',
      description: 'An image',
    });
  }

  const url = await gitHost.createRepository(
    gitHostName,
    `projects/${project.id}.git`
  );
  const withToken = url.replace('http://', `http://nils:${sentinelToken}@`);
  await core.projects.setRemoteOriginUrl({ id: project.id, url: withToken });

  return { core, projectId: project.id, url: withToken };
}

/** Every record this Core wrote, once its logger has flushed and closed */
async function closedLogsOf(core: ElekIoCore): Promise<string> {
  const dir = core.util.pathTo.logs;
  await core.dispose();
  if ((await Fs.pathExists(dir)) === false) {
    return '';
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );
  return contents.join('\n');
}

/** Runs the call and hands back the `CoreError` it rejected with */
async function refusalOf(promise: Promise<unknown>): Promise<CoreError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  assert(
    error instanceof CoreError,
    `Expected a CoreError, got ${String(error)}`
  );
  return error;
}

describe('cloning a Project that is already on the computer', function () {
  it('names the Project without the credentials of the address', async function () {
    const gitHost = await setUp();
    const { core, projectId, url } = await publishedProject(gitHost);
    await core.projects.synchronize({ id: projectId });

    const error = await refusalOf(core.projects.clone({ url }));

    expect(error.type).toBe('Conflict');
    expect(error.message).toContain(projectId);
    expect(error.message).not.toContain(sentinelToken);
    expect(error.message).not.toContain('nils');
    // The whole first line of a stack is the message, which is what an
    // error screen shows and somebody pastes
    expect(error.stack).not.toContain(sentinelToken);
  });

  it('writes no credential into the log files it leaves behind', async function () {
    const gitHost = await setUp();
    const { core, projectId, url } = await publishedProject(gitHost);
    await core.projects.synchronize({ id: projectId });
    await refusalOf(core.projects.clone({ url }));

    const written = await closedLogsOf(core);

    expect(written).not.toContain(sentinelToken);
    // The clone reached the files, so the absence above is the redaction
    // rather than an empty log
    expect(written).toContain('[redacted]@git.provider.test');
  });
});

describe('provisioning a Project the remote does not hold', function () {
  it('names the remote without the credentials of the address', async function () {
    const gitHost = await setUp();
    const { core, projectId, url } = await publishedProject(gitHost);
    await core.projects.synchronize({ id: projectId });

    const error = await refusalOf(
      core.projects.provision({ id: uuid(), url, ref: 'draft' })
    );

    expect(error.type).toBe('BadRequest');
    expect(error.message).toContain(projectId);
    expect(error.message).toContain('[redacted]@git.provider.test');
    expect(error.message).not.toContain(sentinelToken);
    expect(await closedLogsOf(core)).not.toContain(sentinelToken);
  });
});

describe('a Git LFS upload the remote will not take', function () {
  it('names the remote without the credentials of the address', async function () {
    // The host answers plain git, so the reachability probe passes and the
    // failure is attributed to the LFS endpoint rather than to the host
    const gitHost = await setUp((request) =>
      request.rest.startsWith('/info/lfs/') ? 404 : 200
    );
    const { core, projectId } = await publishedProject(gitHost, {
      withAsset: true,
    });

    const error = await refusalOf(core.projects.synchronize({ id: projectId }));

    expect(error.type).toBe('PreconditionFailed');
    expect(error.message).toContain('Git LFS upload');
    expect(error.message).toContain('[redacted]@git.provider.test');
    expect(error.message).not.toContain(sentinelToken);
    expect(await closedLogsOf(core)).not.toContain(sentinelToken);
  });

  it('names no address at all when the stored one cannot be read', async function () {
    const gitHost = await setUp((request) =>
      request.rest.startsWith('/info/lfs/') ? 404 : 200
    );
    const { core, projectId } = await publishedProject(gitHost, {
      withAsset: true,
    });
    // Reading the remote runs git again, and a git that fails there leaves
    // the message with no address to name
    vi.spyOn(core.git.remotes, 'getOriginUrl').mockRejectedValueOnce(
      new Error('fatal: no such remote')
    );

    const error = await refusalOf(
      core.git.lfs.push(core.util.pathTo.project(projectId))
    );

    expect(error.type).toBe('PreconditionFailed');
    expect(error.message).toContain('Git LFS upload to the remote failed');
    expect(error.message).not.toContain(sentinelToken);
    expect(await closedLogsOf(core)).not.toContain(sentinelToken);
  });
});

/**
 * The elek.io Cloud address is configuration rather than something a
 * caller passes, and a staging setup can put a user and a password in it.
 * `fetch` refuses such an address outright, so every call ends in the
 * message below, which is the one that was handed the credential.
 */
describe('an elek.io Cloud address carrying a credential', function () {
  it('names the address without it when elek.io Cloud cannot be reached', async function () {
    const { core } = createTmpCore({
      log: { level: 'debug' },
      cloud: { url: `http://nils:${sentinelToken}@127.0.0.1:1` },
    });

    const error = await refusalOf(
      core.cloud.account.signIn({
        email: 'mara@example.de',
        password: 'correct horse battery staple',
      })
    );

    expect(error.type).toBe('PreconditionFailed');
    expect(error.message).toContain('[redacted]@127.0.0.1:1');
    expect(error.message).not.toContain(sentinelToken);
    expect(error.message).not.toContain('nils');
    expect(await closedLogsOf(core)).not.toContain(sentinelToken);
  });
});
