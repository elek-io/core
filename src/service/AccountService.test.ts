import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { logRecordSchema, type LogRecord } from '../schema/logSchema.js';
import type { SetUserProps } from '../schema/userSchema.js';
import {
  startFakeCloud,
  type FakeCloud,
  type FakeCloudRoute,
  type Respond,
} from '../test/cloud.js';
import { createTmpCore } from '../test/util.js';
import { CoreError, uuid } from '../util/shared.js';

/**
 * Signing in to elek.io Cloud, against a real HTTP server standing in for
 * it. What is asserted is mostly what Core keeps afterwards, the token in
 * memory and the User on disk, and what the calls after it carry. The
 * requests are checked on the server side, because what Core believes it
 * sent is not evidence of what was sent.
 */

const signUpRoute = 'POST /api/auth/sign-up/email';
const signInRoute = 'POST /api/auth/sign-in/email';
const signOutRoute = 'POST /api/auth/sign-out';
const sessionRoute = 'GET /api/auth/get-session';
const reportRoute = 'POST /management/v1/reports';

const account = {
  id: uuid(),
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};
const password = 'correct horse battery staple';

/** The bearer token a session answers in its header */
const sessionToken = 'header-session-token';

/** A User set before signing in, whose settings signing in keeps */
const localUser: SetUserProps = {
  userType: 'local',
  id: null,
  name: 'Ada',
  email: 'ada@home.example.com',
  language: 'de',
  localApi: { isEnabled: true, port: 31999 },
};

/** The `cloud` User signing in to `account` makes of `localUser` */
const cloudUser: SetUserProps = {
  ...localUser,
  userType: 'cloud',
  id: account.id,
  name: account.name,
  email: account.email,
};

/**
 * What signing in answers. The body's `token` is deliberately not the
 * header's, because the header is the one a later call has to carry
 */
function signedIn(token = sessionToken, user = account): Response {
  return Response.json(
    {
      redirect: false,
      token: 'body-token-not-the-bearer',
      url: null,
      user: { ...user, emailVerified: true, image: null },
    },
    { status: 200, headers: { 'set-auth-token': token } }
  );
}

/** What signing up answers while the address still has to be verified */
function verificationRequired(user: unknown): Response {
  return Response.json({ token: null, user }, { status: 200 });
}

function refused(status: number, code?: string): Response {
  return Response.json(code === undefined ? {} : { code, message: code }, {
    status,
  });
}

function liveSession(user = account): Response {
  return Response.json({
    session: { id: uuid(), userId: user.id },
    user: { ...user, emailVerified: true, image: null },
  });
}

function accepted(): Response {
  return Response.json({ id: uuid() }, { status: 201 });
}

const feedback = {
  type: 'feedback',
  message: 'The Release view is the best part of this.',
  user: null,
  desktop: {
    version: '0.5.0',
    runtime: { electron: '40.1.0', chrome: '142.0.0.0', node: '24.12.0' },
  },
} as const;

/** A fake Cloud that accepts reports, plus whatever the test answers */
async function startCloud(
  routes: Partial<Record<FakeCloudRoute, Respond>>
): Promise<FakeCloud> {
  return startFakeCloud({ [reportRoute]: accepted, ...routes });
}

async function caught(promise: Promise<unknown>): Promise<CoreError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(CoreError);
  if (error instanceof CoreError) {
    return error;
  }
  return expect.unreachable('the call should have been refused');
}

/** The Authorization header of every request, in the order they arrived */
function bearers(cloud: FakeCloud): (string | undefined)[] {
  return cloud.received.map(function (received) {
    return received.headers['authorization'];
  });
}

describe('signing in', function () {
  it('answers the token and the account, and sets a cloud User keeping the settings', async function () {
    const cloud = await startCloud({ [signInRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);

    const session = await core.cloud.account.signIn({
      email: account.email,
      password,
    });

    expect(session).toEqual({ token: sessionToken, account });
    expect(core.cloud.account.hasToken).toBe(true);
    expect(await core.user.get()).toEqual(cloudUser);
  });

  it('sends the address and the password, and nothing else', async function () {
    const cloud = await startCloud({ [signInRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.account.signIn({ email: account.email, password });

    expect(cloud.received[0]?.body).toEqual({ email: account.email, password });
    expect(cloud.received[0]?.headers['content-type']).toContain(
      'application/json'
    );
  });

  it('carries the token on every later call, reports included', async function () {
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(),
      [sessionRoute]: () => liveSession(),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.account.signIn({ email: account.email, password });
    await core.cloud.reports.create(feedback);
    await core.cloud.account.read();

    // The header's token, never the one in the body
    expect(bearers(cloud)).toEqual([
      undefined,
      `Bearer ${sessionToken}`,
      `Bearer ${sessionToken}`,
    ]);
  });

  it('starts a data directory with no User yet on default settings', async function () {
    const cloud = await startCloud({ [signInRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.account.signIn({ email: account.email, password });

    expect(await core.user.get()).toEqual({
      userType: 'cloud',
      ...account,
      language: 'en',
      localApi: { isEnabled: false, port: 31310 },
    });
  });

  it('replaces the token when signing in again', async function () {
    let token = 'first-session-token';
    const cloud = await startCloud({ [signInRoute]: () => signedIn(token) });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.account.signIn({ email: account.email, password });
    token = 'second-session-token';
    await core.cloud.account.signIn({ email: account.email, password });
    await core.cloud.reports.create(feedback);

    expect(bearers(cloud)[2]).toBe('Bearer second-session-token');
  });

  it('refuses a wrong address or password and an unverified address as two different types', async function () {
    let answer = refused(401, 'INVALID_EMAIL_OR_PASSWORD');
    const cloud = await startCloud({ [signInRoute]: () => answer });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);

    const wrong = await caught(
      core.cloud.account.signIn({ email: account.email, password })
    );
    answer = refused(403, 'EMAIL_NOT_VERIFIED');
    const unverified = await caught(
      core.cloud.account.signIn({ email: account.email, password })
    );

    expect(wrong.type).toBe('Unauthorized');
    // Not PreconditionFailed, which is what an unreachable Cloud throws, so
    // a host asks for the code from the mail and never does that offline
    expect(unverified.type).toBe('Conflict');
    expect(core.cloud.account.hasToken).toBe(false);
    expect(await core.user.get()).toEqual(localUser);

    await core.cloud.reports.create(feedback);
    expect(bearers(cloud)[2]).toBeUndefined();
  });

  it('reads a 403 for anything other than the address as Unauthorized', async function () {
    const cloud = await startCloud({
      [signInRoute]: () => refused(403, 'SOMETHING_ELSE'),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caught(
      core.cloud.account.signIn({ email: account.email, password })
    );

    expect(error.type).toBe('Unauthorized');
  });

  it('refuses an accepted sign in without a token it can send', async function () {
    const cloud = await startCloud({
      [signInRoute]: () => Response.json({ user: account }, { status: 200 }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);

    const error = await caught(
      core.cloud.account.signIn({ email: account.email, password })
    );

    expect(error.type).toBe('Internal');
    expect(core.cloud.account.hasToken).toBe(false);
    expect(await core.user.get()).toEqual(localUser);
  });

  it('refuses an empty password before anything is sent', async function () {
    const cloud = await startCloud({ [signInRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caught(
      core.cloud.account.signIn({ email: account.email, password: '' })
    );

    expect(error.type).toBe('BadRequest');
    expect(cloud.received).toHaveLength(0);
  });

  it('does not send a second time after a timeout', async function () {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(function () {
        return realTimeout(250);
      });
    onTestFinished(function () {
      timeout.mockRestore();
    });
    const cloud = await startCloud({
      [signInRoute]: () =>
        new Promise<Response>(function () {
          // Never answers, so a retrying Core would show up twice
        }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caught(
      core.cloud.account.signIn({ email: account.email, password })
    );

    // A retry spends the rate limit on a password guess
    expect(error.type).toBe('PreconditionFailed');
    expect(cloud.received).toHaveLength(1);
  });
});

describe('signing up', function () {
  it('with a session, answers it and signs in the way signing in does', async function () {
    const cloud = await startCloud({ [signUpRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);

    const result = await core.cloud.account.signUp({
      name: account.name,
      email: account.email,
      password,
    });
    await core.cloud.reports.create(feedback);

    expect(result).toEqual({
      outcome: 'session',
      token: sessionToken,
      account,
    });
    expect(await core.user.get()).toEqual(cloudUser);
    expect(bearers(cloud)[1]).toBe(`Bearer ${sessionToken}`);
  });

  it('sends the name, the address and the password', async function () {
    const cloud = await startCloud({ [signUpRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.account.signUp({
      name: account.name,
      email: account.email,
      password,
    });

    expect(cloud.received[0]?.body).toEqual({
      name: account.name,
      email: account.email,
      password,
    });
  });

  it.each([
    ['a new address', account],
    // For an address that already has an account the answer is made up, so
    // it is never the account and must not become anybody's User
    [
      'an address that already has an account',
      { id: uuid(), name: 'Made Up', email: account.email },
    ],
  ])(
    'with no session for %s, answers that the address needs verifying and nothing else',
    async function (_label, user) {
      const cloud = await startCloud({
        [signUpRoute]: () => verificationRequired(user),
      });
      const { core } = createTmpCore({ cloud: { url: cloud.url } });
      await core.user.set(localUser);

      const result = await core.cloud.account.signUp({
        name: account.name,
        email: account.email,
        password,
      });
      await core.cloud.reports.create(feedback);

      expect(result).toEqual({ outcome: 'verification' });
      expect(core.cloud.account.hasToken).toBe(false);
      expect(await core.user.get()).toEqual(localUser);
      expect(bearers(cloud)[1]).toBeUndefined();
    }
  );

  it('refuses an address an account already holds as Conflict', async function () {
    const cloud = await startCloud({
      [signUpRoute]: () =>
        refused(422, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caught(
      core.cloud.account.signUp({
        name: account.name,
        email: account.email,
        password,
      })
    );

    expect(error.type).toBe('Conflict');
    expect(core.cloud.account.hasToken).toBe(false);
  });

  it.each([
    ['11 characters', 'a'.repeat(11), false],
    ['12 characters', 'a'.repeat(12), true],
    ['128 characters', 'a'.repeat(128), true],
    ['129 characters', 'a'.repeat(129), false],
    // An emoji is one code point, which is the unit Zod bounds in, so six
    // of them are six characters short of the minimum and twelve are not
    ['six emoji', '😀'.repeat(6), false],
    ['twelve emoji', '😀'.repeat(12), true],
  ])(
    'takes a password of %s only when it is 12 to 128 long',
    async function (_label, candidate, isTaken) {
      const cloud = await startCloud({ [signUpRoute]: () => signedIn() });
      const { core } = createTmpCore({ cloud: { url: cloud.url } });

      const call = core.cloud.account.signUp({
        name: account.name,
        email: account.email,
        password: candidate,
      });

      if (isTaken) {
        await call;
        expect(cloud.received).toHaveLength(1);
      } else {
        expect((await caught(call)).type).toBe('BadRequest');
        expect(cloud.received).toHaveLength(0);
      }
    }
  );
});

describe('signing in or up while Core holds a token', function () {
  it('sends none of it, and a refused sign in keeps it', async function () {
    // A mistyped password says nothing about the session Core holds
    const cloud = await startCloud({
      [signInRoute]: () => refused(401, 'INVALID_EMAIL_OR_PASSWORD'),
    });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'held-session-token' },
    });

    await caught(core.cloud.account.signIn({ email: account.email, password }));
    await core.cloud.reports.create(feedback);

    expect(core.cloud.account.hasToken).toBe(true);
    expect(bearers(cloud)).toEqual([undefined, 'Bearer held-session-token']);
  });

  it('sends none of it when signing up', async function () {
    const cloud = await startCloud({
      [signUpRoute]: () => verificationRequired(account),
    });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'held-session-token' },
    });

    await core.cloud.account.signUp({
      name: account.name,
      email: account.email,
      password,
    });

    expect(bearers(cloud)).toEqual([undefined]);
    expect(core.cloud.account.hasToken).toBe(true);
  });
});

describe('telling the host the token changed', function () {
  it('hands a listener the token signing in and signing up keep', async function () {
    let token = 'signed-in-token';
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(token),
      [signUpRoute]: () => signedIn(token),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const changes: (string | null)[] = [];
    core.cloud.account.onTokenChange((change) => {
      changes.push(change);
    });

    await core.cloud.account.signIn({ email: account.email, password });
    token = 'signed-up-token';
    await core.cloud.account.signUp({
      name: account.name,
      email: account.email,
      password,
    });

    expect(changes).toEqual(['signed-in-token', 'signed-up-token']);
  });

  it('hands a listener null whenever Core drops the token', async function () {
    let reportStatus = 201;
    let isLive = true;
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(),
      [signOutRoute]: () => Response.json({ success: true }),
      [sessionRoute]: () =>
        isLive ? liveSession() : Response.json(null, { status: 200 }),
      [reportRoute]: () =>
        reportStatus === 401
          ? new Response(null, { status: reportStatus })
          : accepted(),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const changes: (string | null)[] = [];
    core.cloud.account.onTokenChange((change) => {
      changes.push(change);
    });

    await core.cloud.account.signIn({ email: account.email, password });
    await core.cloud.account.signOut();
    await core.cloud.account.signIn({ email: account.email, password });
    reportStatus = 401;
    await caught(core.cloud.reports.create(feedback));
    await core.cloud.account.signIn({ email: account.email, password });
    isLive = false;
    await core.cloud.account.read();

    expect(changes).toEqual([
      sessionToken,
      null,
      sessionToken,
      null,
      sessionToken,
      null,
    ]);
  });

  it('stays quiet while the token does not change', async function () {
    let isRefused = false;
    const cloud = await startCloud({
      [signInRoute]: () =>
        isRefused ? refused(401, 'INVALID_EMAIL_OR_PASSWORD') : signedIn(),
      [signUpRoute]: () => verificationRequired(account),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const changes: (string | null)[] = [];
    core.cloud.account.onTokenChange((change) => {
      changes.push(change);
    });

    await core.cloud.account.signOut();
    await core.cloud.account.signUp({
      name: account.name,
      email: account.email,
      password,
    });
    await core.cloud.account.signIn({ email: account.email, password });
    // The same token again, and a refused sign in, change nothing
    await core.cloud.account.signIn({ email: account.email, password });
    isRefused = true;
    await caught(core.cloud.account.signIn({ email: account.email, password }));

    expect(changes).toEqual([sessionToken]);
  });

  it('stops once the listener is removed', async function () {
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(),
      [signOutRoute]: () => Response.json({ success: true }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const changes: (string | null)[] = [];
    const remove = core.cloud.account.onTokenChange((change) => {
      changes.push(change);
    });

    await core.cloud.account.signIn({ email: account.email, password });
    remove();
    await core.cloud.account.signOut();

    expect(changes).toEqual([sessionToken]);
  });

  it('signs in even when a listener throws or rejects', async function () {
    const cloud = await startCloud({ [signInRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    core.cloud.account.onTokenChange(() => {
      throw new Error('the store is locked');
    });
    core.cloud.account.onTokenChange(() =>
      Promise.reject(new Error('the store is locked'))
    );
    const changes: (string | null)[] = [];
    core.cloud.account.onTokenChange((change) => {
      changes.push(change);
    });

    const session = await core.cloud.account.signIn({
      email: account.email,
      password,
    });

    // A listener is the host's, so its failure is not the sign in's
    expect(session.token).toBe(sessionToken);
    expect(core.cloud.account.hasToken).toBe(true);
    expect(changes).toEqual([sessionToken]);
  });
});

describe('reading the account', function () {
  it('answers the account of a live session, carrying the token', async function () {
    const cloud = await startCloud({ [sessionRoute]: () => liveSession() });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'stored-session-token' },
    });

    expect(await core.cloud.account.read()).toEqual(account);
    expect(bearers(cloud)).toEqual(['Bearer stored-session-token']);
  });

  it('answers null without asking Cloud while Core holds no token', async function () {
    const cloud = await startCloud({ [sessionRoute]: () => liveSession() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    expect(await core.cloud.account.read()).toBeNull();
    expect(cloud.received).toHaveLength(0);
  });

  it('reads the token ELEK_IO_CLOUD_TOKEN hands Core, and prefers the option', async function () {
    vi.stubEnv('ELEK_IO_CLOUD_TOKEN', 'environment-session-token');
    onTestFinished(function () {
      vi.unstubAllEnvs();
    });
    const cloud = await startCloud({ [sessionRoute]: () => liveSession() });
    const { core: fromEnvironment } = createTmpCore({
      cloud: { url: cloud.url },
    });
    const { core: fromOption } = createTmpCore({
      cloud: { url: cloud.url, token: 'option-session-token' },
    });

    await fromEnvironment.cloud.account.read();
    await fromOption.cloud.account.read();

    expect(bearers(cloud)).toEqual([
      'Bearer environment-session-token',
      'Bearer option-session-token',
    ]);
  });
});

describe('the User follows the account a session read answers', function () {
  it('takes a name or an address changed on the account', async function () {
    const renamed = {
      ...account,
      name: 'Ada King',
      email: 'ada@king.example.com',
    };
    const cloud = await startCloud({
      [sessionRoute]: () => liveSession(renamed),
    });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'stored-session-token' },
    });
    await core.user.set(cloudUser);

    await core.cloud.account.read();

    expect(await core.user.get()).toEqual({
      ...cloudUser,
      name: renamed.name,
      email: renamed.email,
    });
  });

  it('makes a local User the cloud User of a live session', async function () {
    const cloud = await startCloud({ [sessionRoute]: () => liveSession() });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'stored-session-token' },
    });
    await core.user.set(localUser);

    await core.cloud.account.read();

    expect(await core.user.get()).toEqual(cloudUser);
  });

  it('sets the account of the session when the User belongs to another', async function () {
    const other = {
      id: uuid(),
      name: 'Grace Hopper',
      email: 'grace@example.com',
    };
    const cloud = await startCloud({
      [sessionRoute]: () => liveSession(other),
    });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'stored-session-token' },
    });
    await core.user.set(cloudUser);

    await core.cloud.account.read();

    expect(await core.user.get()).toEqual({ ...cloudUser, ...other });
  });

  it('writes nothing while the User already follows the account', async function () {
    const cloud = await startCloud({ [sessionRoute]: () => liveSession() });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'stored-session-token' },
    });
    await core.user.set(cloudUser);
    const set = vi.spyOn(core.user, 'set');
    onTestFinished(function () {
      set.mockRestore();
    });

    await core.cloud.account.read();

    expect(set).not.toHaveBeenCalled();
  });
});

describe('a session that is not live any more', function () {
  it('forgets the token on a 401 and leaves the User cloud', async function () {
    let status = 401;
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(),
      [reportRoute]: () =>
        status === 401 ? new Response(null, { status }) : accepted(),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);
    await core.cloud.account.signIn({ email: account.email, password });

    const error = await caught(core.cloud.reports.create(feedback));
    status = 201;
    await core.cloud.reports.create(feedback);

    expect(error.type).toBe('Unauthorized');
    expect(core.cloud.account.hasToken).toBe(false);
    // The host asks the person to sign in again, and until then the commits
    // keep the author they had
    expect(await core.user.get()).toEqual(cloudUser);
    expect(bearers(cloud)[2]).toBeUndefined();
  });

  it('forgets the token when the session read answers null and leaves the User cloud', async function () {
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(),
      [sessionRoute]: () => Response.json(null, { status: 200 }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);
    await core.cloud.account.signIn({ email: account.email, password });

    expect(await core.cloud.account.read()).toBeNull();
    expect(core.cloud.account.hasToken).toBe(false);
    expect(await core.user.get()).toEqual(cloudUser);

    // Nothing left to ask about
    expect(await core.cloud.account.read()).toBeNull();
    expect(cloud.received).toHaveLength(2);
  });

  it('answers null for a session read Cloud refuses with a 401', async function () {
    const cloud = await startCloud({
      [sessionRoute]: () => new Response(null, { status: 401 }),
    });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token: 'revoked-session-token' },
    });

    expect(await core.cloud.account.read()).toBeNull();
    expect(core.cloud.account.hasToken).toBe(false);
  });
});

describe('signing out', function () {
  it('sends {} with the token, forgets it, and sets a local User keeping the name and email', async function () {
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(),
      [signOutRoute]: () => Response.json({ success: true }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);
    await core.cloud.account.signIn({ email: account.email, password });

    await core.cloud.account.signOut();
    await core.cloud.reports.create(feedback);

    // Without a body Cloud answers 415 and the session stays live
    expect(cloud.received[1]?.rawBody).toBe('{}');
    expect(cloud.received[1]?.headers['content-type']).toContain(
      'application/json'
    );
    expect(bearers(cloud)).toEqual([
      undefined,
      `Bearer ${sessionToken}`,
      undefined,
    ]);
    expect(core.cloud.account.hasToken).toBe(false);
    expect(await core.user.get()).toEqual({
      ...cloudUser,
      userType: 'local',
      id: null,
    });
  });

  it.each([
    ['refuses', () => new Response(null, { status: 500 })],
    [
      'never answers',
      () =>
        new Promise<Response>(function () {
          // The timeout below gives up on it
        }),
    ],
  ])(
    'signs out on this machine even when Cloud %s',
    async function (_label, respond: Respond) {
      const realTimeout = AbortSignal.timeout.bind(AbortSignal);
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation(function () {
          return realTimeout(250);
        });
      onTestFinished(function () {
        timeout.mockRestore();
      });
      const cloud = await startCloud({
        [signInRoute]: () => signedIn(),
        [signOutRoute]: respond,
      });
      const { core } = createTmpCore({ cloud: { url: cloud.url } });
      await core.cloud.account.signIn({ email: account.email, password });

      await core.cloud.account.signOut();

      expect(core.cloud.account.hasToken).toBe(false);
      expect((await core.user.get())?.userType).toBe('local');
    }
  );

  it('signs out on this machine when Cloud cannot be reached', async function () {
    const cloud = await startCloud({ [signInRoute]: () => signedIn() });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.cloud.account.signIn({ email: account.email, password });
    await cloud.close();

    await core.cloud.account.signOut();

    expect(core.cloud.account.hasToken).toBe(false);
    expect((await core.user.get())?.userType).toBe('local');
  });

  it('sends nothing while Core holds no token, and still sets a local User', async function () {
    const cloud = await startCloud({
      [signOutRoute]: () => Response.json({ success: true }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(cloudUser);

    await core.cloud.account.signOut();

    expect(cloud.received).toHaveLength(0);
    expect(await core.user.get()).toEqual({
      ...cloudUser,
      userType: 'local',
      id: null,
    });
  });
});

describe('what a refusal says', function () {
  it.each([
    [signInRoute, 400, 'VALIDATION_ERROR', 'BadRequest'],
    [signInRoute, 401, 'INVALID_EMAIL_OR_PASSWORD', 'Unauthorized'],
    [signInRoute, 403, 'EMAIL_NOT_VERIFIED', 'Conflict'],
    [signInRoute, 403, 'SOMETHING_ELSE', 'Unauthorized'],
    [signInRoute, 429, undefined, 'RateLimited'],
    [signInRoute, 500, undefined, 'Internal'],
    [signUpRoute, 400, 'PASSWORD_TOO_SHORT', 'BadRequest'],
    [signUpRoute, 400, 'PASSWORD_TOO_LONG', 'BadRequest'],
    [signUpRoute, 422, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'Conflict'],
    [signUpRoute, 422, 'SOMETHING_ELSE', 'Internal'],
    [signUpRoute, 429, undefined, 'RateLimited'],
    [signUpRoute, 500, undefined, 'Internal'],
  ] as const)(
    '%s answering %i %s is %s, and the message never repeats the answer',
    async function (route, status, code, type) {
      // An answer can echo what was sent, and a boundary error message is
      // written to a log file
      const sentinel = 'zqx-canary-77c1e0-answer';
      const cloud = await startCloud({
        [route]: () =>
          Response.json(
            { code, message: sentinel, echo: sentinel },
            { status }
          ),
      });
      const { core } = createTmpCore({ cloud: { url: cloud.url } });

      const error = await caught(
        route === signInRoute
          ? core.cloud.account.signIn({ email: account.email, password })
          : core.cloud.account.signUp({
              name: account.name,
              email: account.email,
              password,
            })
      );

      expect(error.type).toBe(type);
      expect(error.message).toContain(String(status));
      expect(error.message).not.toContain(sentinel);
      expect(error.message).not.toContain(account.email);
    }
  );

  it('refuses an accepted answer it cannot read, without repeating it', async function () {
    const sentinel = 'zqx-canary-77c1e0-account';
    const cloud = await startCloud({
      [signInRoute]: () => signedIn(sessionToken, { ...account, id: sentinel }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caught(
      core.cloud.account.signIn({ email: account.email, password })
    );

    expect(error.type).toBe('Internal');
    // Where the answer went wrong, and none of what it said
    expect(error.message).toContain('user.id');
    expect(error.message).not.toContain(sentinel);
    expect(core.cloud.account.hasToken).toBe(false);
  });
});

describe('what stays on the machine', function () {
  it('never writes the token, the password or the account into user.json or a log file', async function () {
    // Planted strings nothing else in the suite produces, through every
    // call and the failure paths, where a boundary error is logged
    const token = 'zqx-canary-token-3e9a51';
    const secret = 'zqx-canary-password-3e9a51';
    const typed = {
      id: uuid(),
      name: 'Zqx Canary Name 3e9a51',
      email: 'zqx-canary-3e9a51@example.com',
    };
    let isRefused = false;
    const cloud = await startCloud({
      [signUpRoute]: () => signedIn(token, typed),
      [signInRoute]: () =>
        isRefused
          ? refused(401, 'INVALID_EMAIL_OR_PASSWORD')
          : signedIn(token, typed),
      [sessionRoute]: () => liveSession(typed),
      [signOutRoute]: () => new Response(null, { status: 500 }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(localUser);

    await core.cloud.account.signUp({ ...typed, password: secret });
    await core.cloud.account.signIn({ email: typed.email, password: secret });
    await core.cloud.account.read();
    isRefused = true;
    await caught(
      core.cloud.account.signIn({ email: typed.email, password: secret })
    );
    isRefused = false;
    await core.cloud.account.signIn({ email: typed.email, password: secret });
    await core.cloud.account.signOut();

    const userFile = await Fs.readFile(core.util.pathTo.userFile, 'utf8');
    expect(userFile).not.toContain(token);
    expect(userFile).not.toContain(secret);

    const logs = await readLogsOnce(core.util.pathTo.logs, function (record) {
      return record.message === 'Signed out of elek.io Cloud';
    });
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain(typed.name);
    expect(logs).not.toContain(typed.email);
  });
});

async function readLogs(dir: string): Promise<string> {
  if (!(await Fs.pathExists(dir))) {
    return '';
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter(function (name) {
        return name.endsWith('.log');
      })
      .map(function (name) {
        return Fs.readFile(Path.join(dir, name), 'utf8');
      })
  );
  return contents.join('\n');
}

function recordsIn(logs: string): LogRecord[] {
  return logs
    .split('\n')
    .filter(function (line) {
      return line.trim() !== '';
    })
    .flatMap(function (line) {
      try {
        const parsed = logRecordSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
}

/**
 * Waits until the record a test is about to assert the absence of
 * something in has reached disk. winston has no per transport flush, so
 * reading too early would pass because nothing was written yet rather than
 * because nothing leaked.
 */
async function readLogsOnce(
  dir: string,
  matches: (record: LogRecord) => boolean
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const logs = await readLogs(dir);
    if (recordsIn(logs).some(matches)) {
      return logs;
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 20);
    });
  }
  return expect.unreachable('the last record never reached the log file');
}
