import { describe, expect, it } from 'vitest';
import { cloudOrganizationSlugSchema } from '../schema/cloudOrganizationSchema.js';
import { refused, startFakeCloud, type FakeCloud } from '../test/cloud.js';
import { caughtCoreError, createTmpCore, readLogsUntil } from '../test/util.js';
import { uuid } from '../util/shared.js';

/**
 * The organizations of the account Core is signed in to, against a real HTTP
 * server standing in for elek.io Cloud. What was sent is read on the server
 * side, because what Core believes it sent is not evidence of it.
 */

const listRoute = 'GET /management/v1/organizations';
const checkSlugRoute = 'POST /api/auth/organization/check-slug';
const createRoute = 'POST /api/auth/organization/create';

const token = 'session-token';

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    name: 'Studio Penkuhl',
    slug: 'studio-penkuhl',
    roles: ['owner'],
    plan: 'hobby',
    projects: { count: 0, limit: 1 },
    ...overrides,
  };
}

/** A Core signed in to the fake Cloud, which answers only `routes` */
async function signedIn(routes: Parameters<typeof startFakeCloud>[0]) {
  const cloud = await startFakeCloud(routes);
  const { core } = createTmpCore({ cloud: { url: cloud.url, token } });
  return { cloud, core };
}

function bearers(cloud: FakeCloud): (string | undefined)[] {
  return cloud.received.map((received) => received.headers['authorization']);
}

describe('listing organizations', function () {
  it('answers every organization with its roles, plan and room, carrying the session', async function () {
    const owned = organization();
    const joined = organization({
      slug: 'acme',
      roles: ['admin', 'member'],
      plan: 'business',
      projects: { count: 5, limit: 5 },
    });
    const { cloud, core } = await signedIn({
      [listRoute]: () => Response.json({ organizations: [owned, joined] }),
    });

    expect(await core.cloud.organizations.list()).toEqual([owned, joined]);
    expect(bearers(cloud)).toEqual([`Bearer ${token}`]);
  });

  it('answers an empty list for an account in no organization', async function () {
    const { core } = await signedIn({
      [listRoute]: () => Response.json({ organizations: [] }),
    });

    expect(await core.cloud.organizations.list()).toEqual([]);
  });

  it('drops a role Core does not know, rather than failing the list', async function () {
    const { core } = await signedIn({
      [listRoute]: () =>
        Response.json({
          organizations: [organization({ roles: ['billing', 'admin'] })],
        }),
    });

    const [listed] = await core.cloud.organizations.list();

    expect(listed?.roles).toEqual(['admin']);
  });

  it('throws Internal for a plan Core does not know', async function () {
    const { core } = await signedIn({
      [listRoute]: () =>
        Response.json({ organizations: [organization({ plan: 'galactic' })] }),
    });

    const error = await caughtCoreError(core.cloud.organizations.list());

    expect(error.type).toBe('Internal');
    expect(error.message).toContain('organizations.0.plan');
    expect(error.message).not.toContain('galactic');
  });

  it('throws Unauthorized without a session, sending nothing', async function () {
    const cloud = await startFakeCloud({
      [listRoute]: () => Response.json({ organizations: [] }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caughtCoreError(core.cloud.organizations.list());

    expect(error.type).toBe('Unauthorized');
    expect(cloud.received).toHaveLength(0);
  });

  it('forgets the session on a 401, as every elek.io Cloud call does', async function () {
    const { cloud, core } = await signedIn({
      [listRoute]: () => refused(401, 'UNAUTHORIZED'),
    });
    const told: (string | null)[] = [];
    core.cloud.account.onTokenChange((changed) => {
      told.push(changed);
    });

    expect((await caughtCoreError(core.cloud.organizations.list())).type).toBe(
      'Unauthorized'
    );
    expect(core.cloud.account.hasToken).toBe(false);
    expect(told).toEqual([null]);

    // The next call is refused before it is sent
    await caughtCoreError(core.cloud.organizations.list());
    expect(cloud.received).toHaveLength(1);
  });

  it('says when to try again after a 429', async function () {
    const { core } = await signedIn({
      [listRoute]: () =>
        refused(429, 'rate_limited', { headers: { 'Retry-After': '30' } }),
    });
    const before = Date.now();

    const error = await caughtCoreError(core.cloud.organizations.list());

    expect(error.type).toBe('RateLimited');
    expect(error.retryAt).toBeGreaterThanOrEqual(before + 30_000);
    expect(error.retryAt).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it('answers a null retryAt for a 429 without a Retry-After it can read', async function () {
    const { core } = await signedIn({
      [listRoute]: () =>
        refused(429, 'rate_limited', { headers: { 'Retry-After': 'soon' } }),
    });

    const error = await caughtCoreError(core.cloud.organizations.list());

    expect(error.type).toBe('RateLimited');
    expect(error.retryAt).toBeNull();
  });

  it('throws PreconditionFailed when elek.io Cloud cannot be reached', async function () {
    const { cloud, core } = await signedIn({});
    await cloud.close();

    expect((await caughtCoreError(core.cloud.organizations.list())).type).toBe(
      'PreconditionFailed'
    );
  });
});

describe('the slug rule', function () {
  it.each(['ab', 'acme', 'studio-penkuhl', 'a-b-c', 'a'.repeat(48)])(
    'takes %s',
    function (slug) {
      expect(cloudOrganizationSlugSchema.safeParse(slug).success).toBe(true);
    }
  );

  it.each([
    ['one letter', 'a'],
    ['49 letters', 'a'.repeat(49)],
    ['an uppercase letter', 'Acme'],
    ['a digit', 'acme-9'],
    ['a double hyphen', 'acme--studio'],
    ['a leading hyphen', '-acme'],
    ['a trailing hyphen', 'acme-'],
    ['an underscore', 'acme_studio'],
    ['a space', 'acme studio'],
    ['a letter outside a to z', 'äcme'],
  ])('refuses %s before anything is sent', async function (_, slug) {
    expect(cloudOrganizationSlugSchema.safeParse(slug).success).toBe(false);

    const { cloud, core } = await signedIn({
      [checkSlugRoute]: () => Response.json({ status: true }),
      [createRoute]: () => Response.json(organization()),
    });

    const checked = await caughtCoreError(
      core.cloud.organizations.isSlugAvailable({ slug })
    );
    const created = await caughtCoreError(
      core.cloud.organizations.create({ name: 'Acme', slug })
    );

    expect(checked.type).toBe('BadRequest');
    expect(created.type).toBe('BadRequest');
    expect(cloud.received).toHaveLength(0);
  });
});

describe('checking a slug', function () {
  it('answers true for a slug no organization holds, sending only the slug', async function () {
    const { cloud, core } = await signedIn({
      [checkSlugRoute]: () => Response.json({ status: true }),
    });

    expect(
      await core.cloud.organizations.isSlugAvailable({ slug: 'acme' })
    ).toBe(true);
    expect(cloud.received.map((received) => received.rawBody)).toEqual([
      '{"slug":"acme"}',
    ]);
  });

  it('answers false for a slug another organization holds', async function () {
    const { core } = await signedIn({
      [checkSlugRoute]: () => refused(400, 'ORGANIZATION_SLUG_ALREADY_TAKEN'),
    });

    expect(
      await core.cloud.organizations.isSlugAvailable({ slug: 'acme' })
    ).toBe(false);
  });

  it('throws BadRequest for any other 400', async function () {
    const { core } = await signedIn({
      [checkSlugRoute]: () => refused(400, 'VALIDATION_ERROR'),
    });

    const error = await caughtCoreError(
      core.cloud.organizations.isSlugAvailable({ slug: 'acme' })
    );

    expect(error.type).toBe('BadRequest');
  });
});

describe('creating an organization', function () {
  it('sends the name and slug, and answers the organization', async function () {
    const created = organization();
    const { cloud, core } = await signedIn({
      [createRoute]: () =>
        Response.json({
          id: created.id,
          name: created.name,
          slug: created.slug,
          logo: null,
          createdAt: new Date().toISOString(),
          members: [{ role: 'owner' }],
        }),
    });

    expect(
      await core.cloud.organizations.create({
        name: '  Studio Penkuhl ',
        slug: 'studio-penkuhl',
      })
    ).toEqual({ id: created.id, name: created.name, slug: created.slug });
    expect(cloud.received[0]?.body).toEqual({
      name: 'Studio Penkuhl',
      slug: 'studio-penkuhl',
    });
  });

  it('throws Conflict when another organization holds the slug, never naming it', async function () {
    const { core } = await signedIn({
      [createRoute]: () => refused(400, 'ORGANIZATION_ALREADY_EXISTS'),
    });

    const error = await caughtCoreError(
      core.cloud.organizations.create({ name: 'Acme', slug: 'acme-studio' })
    );

    expect(error.type).toBe('Conflict');
    expect(error.message).not.toContain('acme-studio');
    expect(error.message).not.toContain('ORGANIZATION_ALREADY_EXISTS');
  });

  it('throws BadRequest for a slug elek.io Cloud refuses', async function () {
    const { core } = await signedIn({
      [createRoute]: () => refused(400, 'VALIDATION_ERROR'),
    });

    const error = await caughtCoreError(
      core.cloud.organizations.create({ name: 'Acme', slug: 'acme' })
    );

    expect(error.type).toBe('BadRequest');
  });

  it('logs the id, never the name or the slug', async function () {
    const created = organization({
      name: 'Zqx Canary Name',
      slug: 'zqx-canary-slug',
    });
    const { core } = await signedIn({
      [createRoute]: () => Response.json(created),
    });

    await core.cloud.organizations.create({
      name: 'Zqx Canary Name',
      slug: 'zqx-canary-slug',
    });
    const log = await readLogsUntil(
      core.util.pathTo.logs,
      'Created an organization on elek.io Cloud'
    );

    expect(log).toContain(created.id);
    expect(log).not.toContain('zqx-canary');
  });
});
