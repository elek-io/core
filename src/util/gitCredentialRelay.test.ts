import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { startFakeCloud } from '../test/cloud.js';
import { FakeCloudGit } from '../test/cloudGit.js';
import { createCredentialRecorder } from '../test/credentialRecorder.js';
import { createTmpCore, tmpDirPath } from '../test/util.js';
import { CloudClient } from './cloud.js';
import { GitCredentialRelay } from './gitCredentialRelay.js';
import { uuid } from './shared.js';

/**
 * The relay and its helper, driven by dugite's own `git credential fill`,
 * `approve` and `reject`. git runs the real helper script exactly as it
 * does for a fetch, so this needs no HTTP remote and runs on every
 * platform. A recording helper in the global config stands in for the
 * person's keychain, and a recording program for an askpass.
 */

const cloudPattern = 'https://*.git.example.test';
const hostOne = 'cell-1.git.example.test';
const hostTwo = 'cell-2.git.example.test';

/** A relay against a fake Cloud, with a recording keychain and askpass */
async function setUp(
  props: {
    session?: string | null;
    remoteToken?: { token: string; user: string } | null;
  } = {}
) {
  const cloudGit = new FakeCloudGit();
  const cloud = await startFakeCloud(cloudGit.routes());
  const { core } = createTmpCore({ cloud: { url: cloud.url } });
  const cloudClient = new CloudClient(
    cloud.url,
    '0.0.0',
    props.session === undefined ? 'session-one' : props.session,
    core.logger
  );
  const relay = new GitCredentialRelay({
    cloudGitUrl: cloudPattern,
    remoteToken: props.remoteToken ?? null,
    cloudClient,
    logService: core.logger,
    pathTo: core.util.pathTo,
  });
  onTestFinished(() => relay.close());

  const dir = tmpDirPath();
  await Fs.ensureDir(dir);
  const recorder = await createCredentialRecorder();
  const environment = {
    GIT_CONFIG_GLOBAL: recorder.globalConfig,
    SSH_ASKPASS: recorder.askpass,
    SSH_ASKPASS_REQUIRE: 'force',
    DISPLAY: ':0',
  };

  return {
    cloudGit,
    cloud,
    cloudClient,
    relay,
    dir,
    /** Runs one git credential command inside an invocation */
    credential: async function (
      env: Record<string, string>,
      action: 'fill' | 'approve' | 'reject',
      lines: string[]
    ) {
      return gitExec(['credential', action], dir, {
        env: { ...environment, ...env },
        stdin: `${lines.join('\n')}\n\n`,
      });
    },
    /** What the keychain stand-in and the askpass were asked */
    recorded: recorder.recorded,
    emptyConfig: recorder.emptyConfig,
  };
}

function request(host: string, projectId?: string): string[] {
  return [
    'protocol=https',
    `host=${host}`,
    ...(projectId === undefined ? [] : [`path=projects/${projectId}.git`]),
  ];
}

describe('GitCredentialRelay on a Cloud host', function () {
  it('asks git-token once per host and git-access for each further Project', async function () {
    const t = await setUp();
    const [first, second, third] = [uuid(), uuid(), uuid()];
    t.cloudGit.place(first, hostOne);
    t.cloudGit.place(second, hostOne);
    t.cloudGit.place(third, hostTwo);

    const invocation = await t.relay.begin();
    const answers = [];
    for (const [host, id] of [
      [hostOne, first],
      [hostOne, second],
      [hostOne, first],
      [hostTwo, third],
    ] as const) {
      const result = await t.credential(
        invocation.env,
        'fill',
        request(host, id)
      );
      expect(result.exitCode).toEqual(0);
      answers.push(result.stdout);
    }
    invocation.finish();

    expect(answers[0]).toContain('username=session-sessio');
    expect(answers[0]).toContain('password=git-token-1');
    expect(answers[1]).toContain('password=git-token-1');
    expect(answers[2]).toContain('password=git-token-1');
    expect(answers[3]).toContain('password=git-token-2');
    expect(
      t.cloudGit.calls.map((call) => [call.endpoint, call.projectId])
    ).toEqual([
      ['git-token', first],
      ['git-access', second],
      ['git-token', third],
    ]);
    expect(
      t.cloudGit.calls.every((call) => call.session === 'session-one')
    ).toBe(true);
  });

  it('never asks the keychain for a Cloud host, and still does for any other', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    const invocation = await t.relay.begin();

    const filled = await t.credential(
      invocation.env,
      'fill',
      request(hostOne, id)
    );
    const approved = await t.credential(invocation.env, 'approve', [
      ...request(hostOne, id),
      'username=session-sessio',
      'password=git-token-1',
    ]);
    expect(filled.exitCode).toEqual(0);
    expect(approved.exitCode).toEqual(0);
    expect(await t.recorded()).toEqual([]);

    const github = await t.credential(
      invocation.env,
      'fill',
      request('github.example.test')
    );
    invocation.finish();
    expect(github.stdout).toContain('password=keychain-secret');
    expect(await t.recorded()).toHaveLength(1);
  });

  it('drops the refused token on erase, quits for the rest of the invocation and asks again in the next', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);

    const invocation = await t.relay.begin();
    await t.credential(invocation.env, 'fill', request(hostOne, id));
    await t.credential(invocation.env, 'reject', [
      ...request(hostOne, id),
      'username=session-sessio',
      'password=git-token-1',
    ]);
    const afterErase = await t.credential(
      invocation.env,
      'fill',
      request(hostOne, id)
    );
    const outcome = invocation.finish();

    expect(afterErase.exitCode).not.toEqual(0);
    expect(afterErase.stderr).toContain('told us to quit');
    expect(outcome.isRetryable).toBe(true);
    expect(outcome.failure?.type).toEqual('Unauthorized');

    const next = await t.relay.begin();
    const retried = await t.credential(next.env, 'fill', request(hostOne, id));
    next.finish();
    expect(retried.stdout).toContain('password=git-token-2');
    expect(t.cloudGit.callsTo('git-token')).toHaveLength(2);
    expect(await t.recorded()).toEqual([]);
  });

  it('keeps a newer token when an older command reports its token refused', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);

    const first = await t.relay.begin();
    await t.credential(first.env, 'fill', request(hostOne, id));
    await t.credential(first.env, 'reject', [
      ...request(hostOne, id),
      'password=git-token-1',
    ]);
    first.finish();
    const second = await t.relay.begin();
    await t.credential(second.env, 'fill', request(hostOne, id));
    // An erase naming the token that was already replaced
    await t.credential(second.env, 'reject', [
      ...request(hostOne, id),
      'password=git-token-1',
    ]);
    second.finish();

    const third = await t.relay.begin();
    const result = await t.credential(third.env, 'fill', request(hostOne, id));
    third.finish();
    expect(result.stdout).toContain('password=git-token-2');
    expect(t.cloudGit.callsTo('git-token')).toHaveLength(2);
  });

  it('starts a new session with no token and no grant', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);

    const first = await t.relay.begin();
    await t.credential(first.env, 'fill', request(hostOne, id));
    first.finish();
    t.cloudClient.keep('session-two');
    const second = await t.relay.begin();
    const result = await t.credential(second.env, 'fill', request(hostOne, id));
    second.finish();

    expect(result.stdout).toContain('password=git-token-2');
    expect(t.cloudGit.callsTo('git-token').map((call) => call.session)).toEqual(
      ['session-one', 'session-two']
    );
  });

  it('answers quit=1 signed out, so neither the keychain nor an askpass runs', async function () {
    const t = await setUp({ session: null });
    const id = uuid();
    t.cloudGit.place(id, hostOne);

    // Without Core's environment and the keychain, the askpass runs, which
    // proves it can
    vi.stubEnv('GIT_ASKPASS', undefined);
    const bare = await t.credential(
      { GIT_CONFIG_GLOBAL: t.emptyConfig },
      'fill',
      request('other.example.test')
    );
    expect(bare.stdout).toContain('askpass-secret');
    const askedBefore = (await t.recorded()).length;

    const invocation = await t.relay.begin();
    const result = await t.credential(
      invocation.env,
      'fill',
      request(hostOne, id)
    );
    const outcome = invocation.finish();

    expect(result.exitCode).not.toEqual(0);
    expect(result.stderr).toContain('told us to quit');
    expect(outcome.failure?.type).toEqual('Unauthorized');
    expect(outcome.failure?.message).toContain('Sign in to elek.io Cloud');
    expect(await t.recorded()).toHaveLength(askedBefore);
    expect(t.cloudGit.calls).toEqual([]);
  });

  it('answers a Cloud host with the remote token while signed out', async function () {
    const t = await setUp({
      session: null,
      remoteToken: { token: 'pipeline-token', user: 'x-access-token' },
    });
    const id = uuid();

    const invocation = await t.relay.begin();
    const result = await t.credential(
      invocation.env,
      'fill',
      request(hostOne, id)
    );
    invocation.finish();

    expect(result.stdout).toContain('username=x-access-token');
    expect(result.stdout).toContain('password=pipeline-token');
    expect(t.cloudGit.calls).toEqual([]);
    expect(await t.recorded()).toEqual([]);
  });

  it('answers quit=1 for a path that names no Project', async function () {
    const t = await setUp();
    const invocation = await t.relay.begin();
    const result = await t.credential(invocation.env, 'fill', [
      'protocol=https',
      `host=${hostOne}`,
      'path=someone/else.git',
    ]);
    const outcome = invocation.finish();

    expect(result.stderr).toContain('told us to quit');
    expect(outcome.failure?.type).toEqual('PreconditionFailed');
    expect(t.cloudGit.calls).toEqual([]);
  });

  it('makes a failed Cloud call the reason, an outage included', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    t.cloudGit.next.push(Response.json({}, { status: 502 }));

    const invocation = await t.relay.begin();
    const result = await t.credential(
      invocation.env,
      'fill',
      request(hostOne, id)
    );
    const outcome = invocation.finish();

    expect(result.stderr).toContain('told us to quit');
    expect(outcome.failure?.type).toEqual('PreconditionFailed');
    expect(outcome.failure?.message).toContain('could not reach the git host');
    expect(await t.recorded()).toEqual([]);
  });

  it('answers quit=1 to a relay token whose invocation ended', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);

    const invocation = await t.relay.begin();
    invocation.finish();
    const result = await t.credential(
      invocation.env,
      'fill',
      request(hostOne, id)
    );

    expect(result.stderr).toContain('told us to quit');
    expect(t.cloudGit.calls).toEqual([]);
  });
});

describe('GitCredentialRelay with ELEK_IO_REMOTE_ACCESS_TOKEN', function () {
  it('answers every other host with the token, and quits after a refusal', async function () {
    const t = await setUp({
      session: 'session-one',
      remoteToken: { token: 'provider-token', user: 'oauth2' },
    });

    const invocation = await t.relay.begin();
    const filled = await t.credential(
      invocation.env,
      'fill',
      request('github.example.test')
    );
    await t.credential(invocation.env, 'reject', [
      ...request('github.example.test'),
      'username=oauth2',
      'password=provider-token',
    ]);
    const afterErase = await t.credential(
      invocation.env,
      'fill',
      request('github.example.test')
    );
    const outcome = invocation.finish();

    expect(filled.stdout).toContain('username=oauth2');
    expect(filled.stdout).toContain('password=provider-token');
    expect(afterErase.stderr).toContain('told us to quit');
    // The same token would be refused again, so nothing reruns
    expect(outcome.isRetryable).toBe(false);
    expect(outcome.failure?.message).toContain('ELEK_IO_REMOTE_ACCESS_TOKEN');
    expect(await t.recorded()).toEqual([]);
  });

  it("keeps the token out of git's environment", async function () {
    const t = await setUp({
      remoteToken: { token: 'provider-token', user: 'oauth2' },
    });
    const invocation = await t.relay.begin();
    invocation.finish();

    expect(JSON.stringify(invocation.env)).not.toContain('provider-token');
    expect(JSON.stringify(invocation.env)).not.toContain('session-one');
  });
});

describe('GitCredentialRelay for a host nobody answers', function () {
  it('fails rather than run an askpass a desktop set', async function () {
    const t = await setUp({ session: null });
    vi.stubEnv('GIT_ASKPASS', undefined);

    const invocation = await t.relay.begin();
    const result = await t.credential(
      { ...invocation.env, GIT_CONFIG_GLOBAL: t.emptyConfig },
      'fill',
      request('other.example.test')
    );
    invocation.finish();

    // The same run without Core's environment ran the askpass, see the
    // signed out test above
    expect(result.exitCode).not.toEqual(0);
    expect(result.stderr).toContain('terminal prompts disabled');
    expect(await t.recorded()).toEqual([]);
  });

  it('keeps config the host process hands git, and puts its own last', async function () {
    const t = await setUp();
    vi.stubEnv('GIT_CONFIG_PARAMETERS', "'http.lowSpeedTime'='30'");

    const invocation = await t.relay.begin();
    invocation.finish();

    expect(invocation.env['GIT_CONFIG_PARAMETERS']).toMatch(
      /^'http\.lowSpeedTime'='30' 'credential\./
    );
  });
});

describe('GitCredentialRelay without a pattern or a token', function () {
  it('installs nothing and still keeps prompts and askpass off', async function () {
    const cloud = await startFakeCloud({});
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const relay = new GitCredentialRelay({
      cloudGitUrl: null,
      remoteToken: null,
      cloudClient: new CloudClient(cloud.url, '0.0.0', null, core.logger),
      logService: core.logger,
      pathTo: core.util.pathTo,
    });

    const invocation = await relay.begin();
    invocation.finish();

    expect(invocation.env).toEqual({
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
    });
  });
});
