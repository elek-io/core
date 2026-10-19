import { describe, expect, it } from 'vitest';
import {
  refused,
  startFakeCloud,
  type FakeCloud,
  type Respond,
} from '../test/cloud.js';
import { caughtCoreError, createTmpCore, readLogsUntil } from '../test/util.js';
import { uuid } from '../util/shared.js';

/**
 * The Projects on elek.io Cloud, against a real HTTP server standing in for
 * it. What was sent is read on the server side, because what Core believes
 * it sent is not evidence of it.
 */

const token = 'session-token';
const organizationId = uuid();

function project(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides['id'] === 'string' ? overrides['id'] : uuid();
  return {
    id,
    organizationId,
    teamId: null,
    name: 'Website',
    remoteUrl: `https://cell-1.git.example.test/projects/${id}.git`,
    remoteStatus: 'pending',
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    ...overrides,
  };
}

const projectsRoute = `/management/v1/organizations/:orgId/projects` as const;
const projectRoute = `${projectsRoute}/:id` as const;

/** A Core signed in to a fake Cloud answering the five Project routes */
async function signedIn(routes: {
  create?: Respond;
  list?: Respond;
  read?: Respond;
  update?: Respond;
  remove?: Respond;
}) {
  const cloud = await startFakeCloud({
    ...(routes.create && { [`POST ${projectsRoute}`]: routes.create }),
    ...(routes.list && { 'GET /management/v1/projects': routes.list }),
    ...(routes.read && { [`GET ${projectRoute}`]: routes.read }),
    ...(routes.update && { [`PATCH ${projectRoute}`]: routes.update }),
    ...(routes.remove && { [`DELETE ${projectRoute}`]: routes.remove }),
  });
  const { core } = createTmpCore({ cloud: { url: cloud.url, token } });
  return { cloud, core };
}

/** What each request was, as `<method-less path>`, in the order sent */
function paths(cloud: FakeCloud): string[] {
  return cloud.received.map((received) => received.path);
}

describe('creating a Project', function () {
  it('sends the id and the name to the organization, and answers the Project', async function () {
    const created = project();
    const { cloud, core } = await signedIn({
      create: () => Response.json({ project: created }, { status: 201 }),
    });

    const answer = await core.cloud.projects.create({
      organizationId,
      id: created.id,
      name: '  Website ',
    });

    expect(answer).toEqual(created);
    expect(paths(cloud)).toEqual([
      `/management/v1/organizations/${organizationId}/projects`,
    ]);
    expect(cloud.received[0]?.rawBody).toBe(
      JSON.stringify({ id: created.id, name: 'Website' })
    );
    expect(cloud.received[0]?.headers['authorization']).toBe(`Bearer ${token}`);
  });

  it('takes a name of 200 and refuses one of 201 before anything is sent', async function () {
    const { cloud, core } = await signedIn({
      create: (received) =>
        Response.json(
          { project: project({ id: received.body['id'] }) },
          { status: 201 }
        ),
    });

    await core.cloud.projects.create({
      organizationId,
      id: uuid(),
      name: 'N'.repeat(200),
    });
    const error = await caughtCoreError(
      core.cloud.projects.create({
        organizationId,
        id: uuid(),
        name: 'N'.repeat(201),
      })
    );

    expect(error.type).toBe('BadRequest');
    expect(cloud.received).toHaveLength(1);
  });

  it.each([
    [402, 'project_quota_exceeded', 'QuotaExceeded'],
    [409, 'no_cell_available', 'PreconditionFailed'],
    [502, 'bad_gateway', 'PreconditionFailed'],
    [504, 'gateway_timeout', 'PreconditionFailed'],
    [403, 'forbidden', 'Unauthorized'],
    [403, 'not_a_member', 'Unauthorized'],
    [400, 'bad_request', 'BadRequest'],
    [500, 'internal', 'Internal'],
  ])(
    'turns a %i %s into %s, never repeating what it answered',
    async function (status, code, type) {
      const { core } = await signedIn({
        create: () =>
          refused(status, code, {
            detail: { plan: 'hobby', maxProjects: 1, currentProjects: 1 },
          }),
      });

      const error = await caughtCoreError(
        core.cloud.projects.create({ organizationId, id: uuid(), name: 'A' })
      );

      expect(error.type).toBe(type);
      expect(error.message).toContain(String(status));
      expect(error.message).not.toContain(code);
    }
  );

  it('keeps the session on a 403, which refuses one call rather than the session', async function () {
    const { core } = await signedIn({
      create: () => refused(403, 'forbidden'),
    });

    await caughtCoreError(
      core.cloud.projects.create({ organizationId, id: uuid(), name: 'A' })
    );

    expect(core.cloud.account.hasToken).toBe(true);
  });

  it('forgets the session on a 401', async function () {
    const { core } = await signedIn({
      create: () => refused(401, 'unauthorized'),
    });

    const error = await caughtCoreError(
      core.cloud.projects.create({ organizationId, id: uuid(), name: 'A' })
    );

    expect(error.type).toBe('Unauthorized');
    expect(core.cloud.account.hasToken).toBe(false);
  });

  it('says when to try again after a 429', async function () {
    const { core } = await signedIn({
      create: () =>
        refused(429, 'rate_limited', { headers: { 'Retry-After': '90' } }),
    });

    const error = await caughtCoreError(
      core.cloud.projects.create({ organizationId, id: uuid(), name: 'A' })
    );

    expect(error.type).toBe('RateLimited');
    expect(error.retryAt).toBeGreaterThan(Date.now() + 80_000);
  });

  it('throws Internal for a remote that is not http or https', async function () {
    const { core } = await signedIn({
      create: (received) =>
        Response.json(
          {
            project: project({
              id: received.body['id'],
              remoteUrl: 'file:///etc/passwd',
            }),
          },
          { status: 201 }
        ),
    });

    const error = await caughtCoreError(
      core.cloud.projects.create({ organizationId, id: uuid(), name: 'A' })
    );

    expect(error.type).toBe('Internal');
  });

  it('logs the ids, never the name', async function () {
    const created = project({ name: 'Zqx Canary Name' });
    const { core } = await signedIn({
      create: () => Response.json({ project: created }, { status: 201 }),
    });

    await core.cloud.projects.create({
      organizationId,
      id: created.id,
      name: 'Zqx Canary Name',
    });
    const logs = await readLogsUntil(
      core.util.pathTo.logs,
      'Created a Project on elek.io Cloud'
    );

    expect(logs).toContain(created.id);
    expect(logs).toContain(organizationId);
    expect(logs).not.toContain('Zqx Canary');
  });
});

describe('a taken id', function () {
  it('answers the Project the organization holds under it, so a create can be sent again', async function () {
    const existing = project({ name: 'Named earlier', remoteStatus: 'ready' });
    const { cloud, core } = await signedIn({
      create: () => refused(409, 'project_id_taken'),
      read: () => Response.json({ project: existing }),
    });

    const answer = await core.cloud.projects.create({
      organizationId,
      id: existing.id,
      name: 'Website',
    });

    expect(answer).toEqual(existing);
    expect(paths(cloud)).toEqual([
      `/management/v1/organizations/${organizationId}/projects`,
      `/management/v1/organizations/${organizationId}/projects/${existing.id}`,
    ]);
  });

  it('throws Conflict when the organization does not hold it, and never makes a fresh id', async function () {
    const id = uuid();
    const { cloud, core } = await signedIn({
      create: () => refused(409, 'project_id_taken'),
      read: () => refused(404, 'project_not_found'),
    });

    const error = await caughtCoreError(
      core.cloud.projects.create({ organizationId, id, name: 'Website' })
    );

    expect(error.type).toBe('Conflict');
    expect(error.message).toContain('another organization');
    expect(cloud.received.filter((received) => received.body['id'])).toEqual([
      expect.objectContaining({ body: { id, name: 'Website' } }),
    ]);
  });

  it.each([
    [401, 'unauthorized', 'Unauthorized'],
    [429, 'rate_limited', 'RateLimited'],
    [500, 'internal', 'Internal'],
  ])(
    'keeps a %i on the read as its own %s, since it does not say where the Project is',
    async function (status, code, type) {
      const { core } = await signedIn({
        create: () => refused(409, 'project_id_taken'),
        read: () => refused(status, code),
      });

      const error = await caughtCoreError(
        core.cloud.projects.create({ organizationId, id: uuid(), name: 'A' })
      );

      expect(error.type).toBe(type);
    }
  );

  it('keeps an unreachable elek.io Cloud on the read as PreconditionFailed', async function () {
    let close = async (): Promise<void> => {};
    const signed = await signedIn({
      create: () => refused(409, 'project_id_taken'),
      // The read's socket goes with the server, so it gets no answer at all
      read: () => {
        void close();
        return new Promise<Response>(() => {});
      },
    });
    close = signed.cloud.close;

    const error = await caughtCoreError(
      signed.core.cloud.projects.create({
        organizationId,
        id: uuid(),
        name: 'A',
      })
    );

    expect(error.type).toBe('PreconditionFailed');
  });
});

describe('listing, reading and renaming', function () {
  it('lists every Project the account can see', async function () {
    const listed = [project(), project({ organizationId: uuid() })];
    const { cloud, core } = await signedIn({
      list: () => Response.json({ projects: listed }),
    });

    expect(await core.cloud.projects.list()).toEqual(listed);
    expect(paths(cloud)).toEqual(['/management/v1/projects']);
  });

  it('reads one Project, and throws NotFound for one that is not there', async function () {
    const read = project();
    const { core } = await signedIn({
      read: (received) =>
        received.path.endsWith(read.id)
          ? Response.json({ project: read })
          : refused(404, 'project_not_found'),
    });

    expect(
      await core.cloud.projects.read({ organizationId, id: read.id })
    ).toEqual(read);
    expect(
      (
        await caughtCoreError(
          core.cloud.projects.read({ organizationId, id: uuid() })
        )
      ).type
    ).toBe('NotFound');
  });

  it('renames a Project, sending only the name', async function () {
    const renamed = project({ name: 'Shop' });
    const { cloud, core } = await signedIn({
      update: () => Response.json({ project: renamed }),
    });

    expect(
      await core.cloud.projects.update({
        organizationId,
        id: renamed.id,
        name: 'Shop',
      })
    ).toEqual(renamed);
    expect(cloud.received[0]?.rawBody).toBe('{"name":"Shop"}');
  });

  it('throws Unauthorized for a member renaming', async function () {
    const { core } = await signedIn({
      update: () => refused(403, 'forbidden'),
    });

    const error = await caughtCoreError(
      core.cloud.projects.update({ organizationId, id: uuid(), name: 'Shop' })
    );

    expect(error.type).toBe('Unauthorized');
    expect(error.message).toContain('owner or an admin');
  });
});

describe('deleting a Project', function () {
  it('sends a DELETE and answers nothing', async function () {
    const id = uuid();
    const { cloud, core } = await signedIn({
      remove: () => new Response(null, { status: 204 }),
    });

    await core.cloud.projects.delete({ organizationId, id });

    expect(paths(cloud)).toEqual([
      `/management/v1/organizations/${organizationId}/projects/${id}`,
    ]);
  });

  it.each([502, 504])(
    'throws PreconditionFailed for a %i, which keeps the Project to delete again',
    async function (status) {
      const { core } = await signedIn({
        remove: () => refused(status, 'git_host_unreachable'),
      });

      const error = await caughtCoreError(
        core.cloud.projects.delete({ organizationId, id: uuid() })
      );

      expect(error.type).toBe('PreconditionFailed');
      expect(error.message).toContain('Delete it again');
    }
  );

  it('throws NotFound for a Project that is not there', async function () {
    const { core } = await signedIn({
      remove: () => refused(404, 'project_not_found'),
    });

    const error = await caughtCoreError(
      core.cloud.projects.delete({ organizationId, id: uuid() })
    );

    expect(error.type).toBe('NotFound');
  });
});

describe('without a session, and in read-only mode', function () {
  it('refuses every call with Unauthorized before sending anything', async function () {
    const cloud = await startFakeCloud({});
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const id = uuid();

    const errors = await Promise.all([
      caughtCoreError(
        core.cloud.projects.create({ organizationId, id, name: 'A' })
      ),
      caughtCoreError(core.cloud.projects.list()),
      caughtCoreError(core.cloud.projects.read({ organizationId, id })),
      caughtCoreError(
        core.cloud.projects.update({ organizationId, id, name: 'A' })
      ),
      caughtCoreError(core.cloud.projects.delete({ organizationId, id })),
    ]);

    expect(errors.map((error) => error.type)).toEqual(
      Array(5).fill('Unauthorized')
    );
    expect(cloud.received).toHaveLength(0);
  });

  it('refuses creating, renaming and deleting, and still lists and reads', async function () {
    const read = project();
    const cloud = await startFakeCloud({
      'GET /management/v1/projects': () => Response.json({ projects: [read] }),
      [`GET ${projectRoute}`]: () => Response.json({ project: read }),
    });
    const { core } = createTmpCore({
      cloud: { url: cloud.url, token },
      isReadOnly: true,
    });
    const id = read.id;

    const errors = await Promise.all([
      caughtCoreError(
        core.cloud.projects.create({ organizationId, id, name: 'A' })
      ),
      caughtCoreError(
        core.cloud.projects.update({ organizationId, id, name: 'A' })
      ),
      caughtCoreError(core.cloud.projects.delete({ organizationId, id })),
    ]);

    expect(errors.map((error) => error.type)).toEqual(
      Array(3).fill('PreconditionFailed')
    );
    expect(await core.cloud.projects.list()).toEqual([read]);
    expect(await core.cloud.projects.read({ organizationId, id })).toEqual(
      read
    );
    expect(cloud.received).toHaveLength(2);
  });
});
