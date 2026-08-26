import { serve, type ServerType } from '@hono/node-server';
import Fs from 'fs-extra';
import { Hono } from 'hono';
import Crypto from 'node:crypto';
import Os from 'node:os';
import Path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  logRecordSchema,
  logTailSchema,
  type LogRecord,
} from '../schema/logSchema.js';
import type { CreateReportProps } from '../schema/reportSchema.js';
import { createTmpCore } from '../test/util.js';
import { CoreError, uuid } from '../util/shared.js';

/**
 * Sending a report is the first thing Core does over the network that is
 * not git, so what is asserted here is mostly what leaves the machine and
 * what happens when it cannot. The body is checked on the server side,
 * because a body Core believes it built is not evidence of what was sent.
 *
 * Core fills in exactly two things, the `core` block and `logs`.
 * Everything else passes through from the caller, validated.
 */

const user = {
  name: 'Nils',
  email: 'me@example.com',
  userType: 'local',
  language: 'en',
  id: null,
} as const;

const desktop = {
  version: '0.5.0',
  runtime: { electron: '40.1.0', chrome: '142.0.0.0', node: '24.12.0' },
} as const;

function bugReport(
  overrides: Partial<CreateReportProps> = {}
): CreateReportProps {
  return {
    type: 'bug',
    message: 'Deleting a Collection spins forever after confirming the dialog.',
    user,
    desktop,
    includeLogs: false,
    ...overrides,
  };
}

function feedbackReport(
  overrides: Record<string, unknown> = {}
): CreateReportProps {
  return {
    type: 'feedback',
    message: 'The Release view is the best part of this.',
    user,
    desktop,
    ...overrides,
  };
}

/** What the fake Cloud saw, which is the only honest record of what was sent */
interface Received {
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

interface FakeCloud {
  url: string;
  received: Received[];
  close: () => Promise<void>;
}

/**
 * A real HTTP server standing in for elek.io Cloud.
 *
 * Core's suite has no HTTP mocking and does not need one, since hono and
 * `@hono/node-server` are already dependencies. Port 0 rather than the
 * per-worker port the local API uses, so test files running in parallel
 * cannot contend at all, and 127.0.0.1 explicitly because the default
 * binds `::`.
 */
async function startFakeCloud(
  respond: (received: Received) => Response | Promise<Response>
): Promise<FakeCloud> {
  const received: Received[] = [];
  const app = new Hono();

  app.post('/management/v1/reports', async function (context) {
    const entry: Received = {
      body: await context.req.json(),
      headers: Object.fromEntries(context.req.raw.headers),
    };
    received.push(entry);
    return respond(entry);
  });

  const { server, port } = await new Promise<{
    server: ServerType;
    port: number;
  }>(function (resolve) {
    const created = serve(
      { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
      function (info) {
        resolve({ server: created, port: info.port });
      }
    );
  });

  let isClosed = false;
  const close = async function (): Promise<void> {
    if (isClosed) {
      return;
    }
    isClosed = true;
    // A request the handler never answers holds its socket open, so the
    // sockets go before close() is awaited. Narrowed rather than cast,
    // since ServerType also covers the HTTP/2 servers this never creates
    if ('closeAllConnections' in server) {
      server.closeAllConnections();
    }
    await new Promise<void>(function (resolve) {
      server.close(function () {
        resolve();
      });
    });
  };
  onTestFinished(close);

  return { url: `http://127.0.0.1:${port}`, received, close };
}

/** The 201 elek.io Cloud answers a created report with */
function accepted(): Response {
  return Response.json({ id: uuid() }, { status: 201 });
}

async function expectCoreError(promise: Promise<unknown>): Promise<CoreError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CoreError);
    if (error instanceof CoreError) {
      return error;
    }
  }
  return expect.unreachable('the report should not have been accepted');
}

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
    .map(function (line): unknown {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .flatMap(function (line) {
      const parsed = logRecordSchema.safeParse(line);
      return parsed.success ? [parsed.data] : [];
    });
}

/**
 * Waits until the record a test is about to assert the absence of
 * something in has actually reached disk. winston has no per transport
 * flush, so reading too early would let the assertion pass because
 * nothing was written yet rather than because nothing leaked.
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
  return expect.unreachable('the boundary error never reached the log file');
}

describe('what leaves the machine', function () {
  it('sends the report to the reports endpoint of the configured Cloud', async function () {
    const cloud = await startFakeCloud(accepted);
    // With a trailing slash, since the option drops one and a path is
    // appended to what is left
    const { core } = createTmpCore({ cloud: { url: `${cloud.url}/` } });

    const response = await core.cloud.reports.create(bugReport());

    // Only the one route is registered, so an answer at all is the path
    expect(cloud.received).toHaveLength(1);
    expect(response.id).toEqual(expect.any(String));
  });

  it('says what it is and which Core sent it', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.reports.create(bugReport());

    expect(cloud.received[0]?.headers['content-type']).toContain(
      'application/json'
    );
    expect(cloud.received[0]?.headers['user-agent']).toBe(
      `elek.io-core/${core.coreVersion}`
    );
  });

  it('carries exactly the keys the request is made of', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.reports.create(bugReport({ includeLogs: true }));

    // includeLogs is consent to attaching a tail, not part of the report,
    // so it is answered by what `logs` holds and never sent on
    expect(Object.keys(cloud.received[0]?.body ?? {}).toSorted()).toEqual([
      'core',
      'desktop',
      'logs',
      'message',
      'type',
      'user',
    ]);
  });

  it('passes the caller through unchanged, since Core does not read the User', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    // Somebody reachable at an address other than the one their commits
    // are signed with, which is the whole reason the dialog stays editable
    const sender = { ...user, email: 'somewhere-else@example.com' };

    await core.cloud.reports.create(bugReport({ user: sender }));

    expect(cloud.received[0]?.body['user']).toEqual(sender);
    expect(cloud.received[0]?.body['desktop']).toEqual(desktop);
    expect(cloud.received[0]?.body['message']).toBe(bugReport().message);
  });

  it('sends a report from a machine with no User yet', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    // The button stays reachable on a broken first run, which is when a
    // report is worth most, so Cloud has to take a null sender
    const response = await core.cloud.reports.create(bugReport({ user: null }));

    expect(cloud.received[0]?.body['user']).toBeNull();
    expect(response.id).toEqual(expect.any(String));
  });

  it('describes the machine Core is running on, in the Node spellings', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.reports.create(bugReport());

    // `linux` and `x64`, not the `os.type` and `host.arch` a log record
    // carries. This is the machine, and it is not a log record
    expect(cloud.received[0]?.body['core']).toEqual({
      version: core.coreVersion,
      platform: process.platform,
      arch: process.arch,
      osRelease: Os.release(),
    });
  });

  it('still sends while Core is in read-only mode', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({
      isReadOnly: true,
      cloud: { url: cloud.url },
    });

    // Read-only protects a Project and its remote. A report mutates
    // nothing local, and being unable to write is a reason to send one
    const response = await core.cloud.reports.create(bugReport());

    expect(cloud.received).toHaveLength(1);
    expect(response.id).toEqual(expect.any(String));
  });
});

describe('the log tail a report may attach', function () {
  it('attaches one when a bug report consented to it', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.reports.create(bugReport({ includeLogs: true }));

    const logs = logTailSchema.safeParse(cloud.received[0]?.body['logs']);
    expect(logs.success).toBe(true);
    expect(logs.success && logs.data.encoding).toBe('gzip+base64');
    expect(logs.success && logs.data.data.length).toBeGreaterThan(0);
  });

  it('attaches none when a bug report did not consent', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await core.cloud.reports.create(bugReport({ includeLogs: false }));

    expect(cloud.received[0]?.body['logs']).toBeNull();
  });

  it('never attaches one to feedback, whatever the caller passes', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    // Feedback has no consent to give, so there is nothing that could
    // turn one on
    await core.cloud.reports.create(feedbackReport({ includeLogs: true }));

    expect(cloud.received[0]?.body['logs']).toBeNull();
    expect(cloud.received[0]?.body).not.toHaveProperty('includeLogs');
  });

  it('refuses a body over the cap rather than letting Cloud answer 413', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await seedIncompressibleLog(core.util.pathTo.logs);

    const error = await expectCoreError(
      core.cloud.reports.create(bugReport({ includeLogs: true }))
    );

    expect(error.type).toBe('BadRequest');
    // Refused here rather than on the wire, so nothing was sent
    expect(cloud.received).toHaveLength(0);
  }, 60000);
});

describe('what a caller is told when it does not arrive', function () {
  it.each([
    [400, 'BadRequest'],
    [413, 'BadRequest'],
    [401, 'Unauthorized'],
    [403, 'Unauthorized'],
    [429, 'RateLimited'],
    [500, 'Internal'],
  ])(
    'turns a %i from elek.io Cloud into a %s error',
    async function (status, type) {
      const cloud = await startFakeCloud(function () {
        return new Response(null, { status });
      });
      const { core } = createTmpCore({ cloud: { url: cloud.url } });

      const error = await expectCoreError(
        core.cloud.reports.create(bugReport())
      );

      expect(error.type).toBe(type);
    }
  );

  it('turns a Cloud that is not there into a PreconditionFailed', async function () {
    const cloud = await startFakeCloud(accepted);
    await cloud.close();
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await expectCoreError(core.cloud.reports.create(bugReport()));

    // Which is what the dialog keeps the User's text through, and it is
    // also the answer until Cloud has built the endpoint
    expect(error.type).toBe('PreconditionFailed');
  });

  it('waits 15 seconds for an answer and no longer', async function () {
    const cloud = await startFakeCloud(accepted);
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    onTestFinished(function () {
      timeout.mockRestore();
    });

    await core.cloud.reports.create(bugReport());

    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it('turns a Cloud that never answers into a PreconditionFailed', async function () {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(function () {
        return realTimeout(250);
      });
    onTestFinished(function () {
      timeout.mockRestore();
    });
    const cloud = await startFakeCloud(function () {
      return new Promise<Response>(function () {
        // Never answers, which is the case the 15 second ceiling is for
      });
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await expectCoreError(core.cloud.reports.create(bugReport()));

    expect(error.type).toBe('PreconditionFailed');
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
    const cloud = await startFakeCloud(function () {
      return new Promise<Response>(function () {
        // Answers nothing, so a retrying Core would show up twice
      });
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    await expectCoreError(core.cloud.reports.create(bugReport()));

    // A retry after a timeout can duplicate a report Cloud already
    // accepted, and Core cannot tell. Sending again is the User's call
    expect(cloud.received).toHaveLength(1);
  });

  it('refuses to hand back an accepted report it could not read', async function () {
    const cloud = await startFakeCloud(function () {
      return Response.json({ id: 'not-a-uuid' }, { status: 201 });
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await expectCoreError(core.cloud.reports.create(bugReport()));

    expect(error.type).toBe('Internal');
  });

  it('refuses an accepted report answered with something that is not JSON', async function () {
    const cloud = await startFakeCloud(function () {
      return new Response('created', { status: 201 });
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await expectCoreError(core.cloud.reports.create(bugReport()));

    expect(error.type).toBe('Internal');
  });
});

describe('the report itself stays off the machine it was sent from', function () {
  it('does not write what the User typed into a log file', async function () {
    // The whole feature is a privacy feature, and a rejected report is
    // where the text would leak: the service boundary logs the failure
    const sentinel = 'zqx-canary-9c31be-report';
    const cloud = await startFakeCloud(function () {
      return new Response(null, { status: 400 });
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await expectCoreError(
      core.cloud.reports.create(
        bugReport({ message: `Everything broke when I ${sentinel} the page.` })
      )
    );
    expect(error.type).toBe('BadRequest');

    const logs = await readLogsOnce(core.util.pathTo.logs, function (record) {
      return record.attributes?.['code.function.name'] === 'Report.create';
    });
    expect(logs).not.toContain(sentinel);
  });
});

/**
 * Writes a log file large enough that its tail cannot fit in a report.
 *
 * The content is random, so gzip cannot help and the blob really is this
 * big. A realistic tail is 1 to 25 KB, which is why the size ceiling is a
 * backstop rather than something a User meets. Yesterday's file name, so
 * this never races the transport writing today's.
 */
async function seedIncompressibleLog(dir: string): Promise<void> {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const timestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const lines: string[] = [];

  for (let index = 0; index < 48; index++) {
    lines.push(
      JSON.stringify({
        timestamp,
        level: 'info',
        severityNumber: 9,
        message: Crypto.randomBytes(48 * 1024).toString('base64'),
        resource: {
          'service.name': 'core',
          'service.version': '0.24.0',
          'os.type': 'linux',
          'host.arch': 'amd64',
        },
      })
    );
  }

  await Fs.mkdirp(dir);
  await Fs.writeFile(
    Path.join(dir, `${day.toISOString().slice(0, 10)}.log`),
    `${lines.join('\n')}\n`,
    'utf8'
  );
}
