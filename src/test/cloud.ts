import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { onTestFinished } from 'vitest';

/** What the fake Cloud saw, which is the only honest record of what was sent */
export interface Received {
  /** The parsed JSON body, `{}` when there was none */
  body: Record<string, unknown>;
  /** The body exactly as it arrived, empty when there was none */
  rawBody: string;
  headers: Record<string, string>;
}

/** Answers one request the way elek.io Cloud would */
export type Respond = (received: Received) => Response | Promise<Response>;

/** A route as `<method> <path>`, so a test reads like the request it fakes */
export type FakeCloudRoute = `${'GET' | 'POST'} /${string}`;

export interface FakeCloud {
  url: string;
  /** Every request, in the order they arrived, whatever the route */
  received: Received[];
  close: () => Promise<void>;
}

/**
 * A real HTTP server standing in for elek.io Cloud, answering only the
 * routes it is given.
 *
 * Core's suite has no HTTP mocking and does not need one, since hono and
 * `@hono/node-server` are already dependencies. Port 0 rather than the
 * per-worker port the local API uses, so test files running in parallel
 * cannot contend at all, and 127.0.0.1 explicitly because the default
 * binds `::`.
 */
export async function startFakeCloud(
  routes: Partial<Record<FakeCloudRoute, Respond>>
): Promise<FakeCloud> {
  const received: Received[] = [];
  const app = new Hono();

  for (const [route, respond] of Object.entries(routes)) {
    const [method, path] = route.split(' ');
    if (respond === undefined || path === undefined) {
      continue;
    }
    app.on(method ?? 'GET', path, async function (context) {
      const rawBody = await context.req.text();
      const entry: Received = {
        body: parseBody(rawBody),
        rawBody,
        headers: Object.fromEntries(context.req.raw.headers),
      };
      received.push(entry);
      return respond(entry);
    });
  }

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

function parseBody(rawBody: string): Record<string, unknown> {
  if (rawBody === '') {
    return {};
  }
  const parsed: unknown = JSON.parse(rawBody);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return Object.fromEntries(Object.entries(parsed));
}
