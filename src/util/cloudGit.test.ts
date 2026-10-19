import { describe, expect, it } from 'vitest';
import { startFakeCloud } from '../test/cloud.js';
import { FakeCloudGit } from '../test/cloudGit.js';
import { createTmpCore, expectCoreError } from '../test/util.js';
import { CloudClient } from './cloud.js';
import { CloudGitAccess } from './cloudGit.js';
import { uuid } from './shared.js';

/**
 * The state behind the helper, against a real HTTP server standing in for
 * elek.io Cloud's two git endpoints. What git does with an answer is
 * covered with git itself in gitCredentialRelay.test.ts.
 */

const hostOne = 'cell-1.git.example.test';
const hostTwo = 'cell-2.git.example.test';

async function setUp() {
  const cloudGit = new FakeCloudGit();
  const cloud = await startFakeCloud(cloudGit.routes());
  const { core } = createTmpCore({ cloud: { url: cloud.url } });
  const cloudClient = new CloudClient(
    cloud.url,
    '0.0.0',
    'session-one',
    core.logger
  );
  const access = new CloudGitAccess(cloudClient, core.logger);
  return { cloudGit, cloud, cloudClient, access };
}

describe('CloudGitAccess', function () {
  it('never has two requests to one host in flight', async function () {
    const t = await setUp();
    const ids = [uuid(), uuid(), uuid()];
    for (const id of ids) {
      t.cloudGit.place(id, hostOne);
    }

    const credentials = await Promise.all(
      ids.map((id) => t.access.credentialFor(hostOne, id))
    );

    // One token, then a grant for each further Project, never three tokens
    // revoking each other
    expect(t.cloudGit.calls.map((call) => call.endpoint)).toEqual([
      'git-token',
      'git-access',
      'git-access',
    ]);
    expect(new Set(credentials.map((c) => c.password))).toEqual(
      new Set(['git-token-1'])
    );
  });

  it('sends the session as a bearer token and a JSON body', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);

    await t.access.credentialFor(hostOne, id);

    expect(t.cloud.received[0]?.headers['authorization']).toEqual(
      'Bearer session-one'
    );
    expect(t.cloud.received[0]?.path).toEqual(
      `/management/v1/projects/${id}/git-token`
    );
    expect(t.cloud.received[0]?.rawBody).toEqual('{}');
  });

  it('asks once more when access changed while it was granted', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    t.cloudGit.next.push(
      Response.json({ code: 'git_access_changed' }, { status: 409 })
    );

    const credential = await t.access.credentialFor(hostOne, id);

    expect(credential.password).toEqual('git-token-1');
    expect(t.cloudGit.callsTo('git-token')).toHaveLength(2);
  });

  it('throws Conflict when access changed twice in a row', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    t.cloudGit.next.push(
      Response.json({ code: 'git_access_changed' }, { status: 409 }),
      Response.json({ code: 'git_access_changed' }, { status: 409 })
    );

    await expectCoreError(t.access.credentialFor(hostOne, id), 'Conflict', id);
    expect(t.cloudGit.calls).toHaveLength(2);
  });

  it('throws NotFound for a Project the session cannot see', async function () {
    const t = await setUp();
    const id = uuid();

    await expectCoreError(
      t.access.credentialFor(hostOne, id),
      'NotFound',
      `elek.io Cloud has no Project "${id}" this session can see`
    );
  });

  it('throws PreconditionFailed when Cloud could not reach the git host', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    t.cloudGit.next.push(Response.json({}, { status: 504 }));

    await expectCoreError(
      t.access.credentialFor(hostOne, id),
      'PreconditionFailed',
      'could not reach the git host (504)'
    );
  });

  it('asks nothing more until a 429 Retry-After passes', async function () {
    const t = await setUp();
    const [first, second] = [uuid(), uuid()];
    t.cloudGit.place(first, hostOne);
    t.cloudGit.place(second, hostTwo);
    t.cloudGit.next.push(
      Response.json({}, { status: 429, headers: { 'Retry-After': '120' } })
    );

    await expectCoreError(
      t.access.credentialFor(hostOne, first),
      'RateLimited',
      'call again in 120 seconds'
    );
    await expectCoreError(
      t.access.credentialFor(hostTwo, second),
      'RateLimited',
      'call again in 120 seconds'
    );
    expect(t.cloudGit.calls).toHaveLength(1);

    // A new session is not rate limited by the old one's answer
    t.cloudClient.keep('session-two');
    await t.access.credentialFor(hostTwo, second);
    expect(t.cloudGit.calls).toHaveLength(2);
  });

  it('asks for a token of its own when Cloud places the Project on another host', async function () {
    const t = await setUp();
    const [first, moved] = [uuid(), uuid()];
    t.cloudGit.place(first, hostOne);
    t.cloudGit.place(moved, hostTwo);
    await t.access.credentialFor(hostOne, first);

    // The remote names the host the Project was on before
    await expectCoreError(
      t.access.credentialFor(hostOne, moved),
      'PreconditionFailed',
      `Set its remote to "http://${hostTwo}/projects/${moved}.git"`
    );
    expect(t.cloudGit.calls.map((call) => call.endpoint)).toEqual([
      'git-token',
      'git-access',
      'git-token',
    ]);

    // The token it got reaches the Project at its real remote
    const credential = await t.access.credentialFor(hostTwo, moved);
    expect(credential.password).toEqual('git-token-2');
    expect(t.cloudGit.calls).toHaveLength(3);
  });

  it('asks again for a Project it was told to forget', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    await t.access.credentialFor(hostOne, id);

    t.access.forget(hostOne, id);
    await t.access.credentialFor(hostOne, id);

    expect(t.cloudGit.calls.map((call) => call.endpoint)).toEqual([
      'git-token',
      'git-access',
    ]);
  });

  it('forgets the session after a 401, so the next session starts clean', async function () {
    const t = await setUp();
    const id = uuid();
    t.cloudGit.place(id, hostOne);
    t.cloudGit.next.push(Response.json({}, { status: 401 }));

    await expectCoreError(t.access.credentialFor(hostOne, id), 'Unauthorized');
    expect(t.cloudClient.hasToken).toBe(false);
  });
});
