import { exec as gitExec, spawn as gitSpawn } from 'dugite';
import Fs from 'fs-extra';
import Http from 'node:http';
import Path from 'node:path';
import { onTestFinished } from 'vitest';
import { tmpDirPath } from './util.js';

/** One request the fake git host answered */
export interface GitHostRequest {
  host: string;
  /** The repository's path below the host, such as `projects/<id>.git` */
  repositoryPath: string;
  /** What followed the repository path, such as `/info/refs` */
  rest: string;
  method: string;
  username: string | null;
  password: string | null;
  status: number;
}

/** Decides one request, as a git host would: 200, 401 or 404 */
export type Authorize = (request: {
  host: string;
  repositoryPath: string;
  /** What followed the repository path, `/info/lfs/...` for Git LFS */
  rest: string;
  username: string | null;
  password: string | null;
}) => 200 | 401 | 404;

export interface FakeGitHost {
  /** Point `http_proxy` here, so any host name reaches this server */
  proxyUrl: string;
  /** Every request, in the order they arrived */
  requests: GitHostRequest[];
  /** Creates an empty bare repository and returns its remote URL */
  createRepository: (host: string, repositoryPath: string) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * A git host over plain HTTP for any number of host names, standing in for
 * elek.io Cloud's git hosts and for any other provider. It serves git
 * through `git http-backend` and Git LFS through the batch API, behind
 * basic auth that `authorize` decides.
 *
 * Every host name reaches it as a forward proxy through `http_proxy`,
 * which git and git-lfs both honor, so no DNS and no TLS is involved.
 */
export async function startFakeGitHost(
  authorize: Authorize
): Promise<FakeGitHost> {
  const root = tmpDirPath();
  const requests: GitHostRequest[] = [];

  const server = Http.createServer(function (req, res) {
    void handle(req, res).catch(function () {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
  });

  async function handle(
    req: Http.IncomingMessage,
    res: Http.ServerResponse
  ): Promise<void> {
    // A proxied request carries the absolute URL on its request line
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const host = url.host.toLowerCase();
    const match = /^\/(.+?\.git)(\/.*)?$/.exec(url.pathname);
    const repositoryPath = match?.[1] ?? '';
    const rest = match?.[2] ?? '';
    const credential = basicCredential(req.headers.authorization);
    const status =
      match === null
        ? 404
        : credential === null
          ? 401
          : authorize({ host, repositoryPath, rest, ...credential });
    requests.push({
      host,
      repositoryPath,
      rest,
      method: req.method ?? 'GET',
      username: credential?.username ?? null,
      password: credential?.password ?? null,
      status,
    });

    if (status === 401) {
      req.resume();
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="git"',
        'LFS-Authenticate': 'Basic realm="git"',
      });
      res.end();
      return;
    }
    if (status === 404) {
      req.resume();
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Repository not found');
      return;
    }

    const repository = Path.join(root, host, repositoryPath);
    if (rest.startsWith('/info/lfs/')) {
      await serveLfs(req, res, {
        repository,
        href: `http://${host}/${repositoryPath}/info/lfs/objects`,
        authorization: req.headers.authorization ?? '',
        rest: rest.slice('/info/lfs'.length),
      });
      return;
    }
    await serveGit(req, res, {
      root: Path.join(root, host),
      pathInfo: `/${repositoryPath}${rest}`,
      query: url.search.slice(1),
      username: credential?.username ?? 'anonymous',
    });
  }

  const port = await new Promise<number>(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      const address = server.address();
      resolve(
        typeof address === 'object' && address !== null ? address.port : 0
      );
    });
  });

  let isClosed = false;
  const close = async function (): Promise<void> {
    if (isClosed) {
      return;
    }
    isClosed = true;
    server.closeAllConnections();
    await new Promise<void>(function (resolve) {
      server.close(function () {
        resolve();
      });
    });
  };
  onTestFinished(close);

  return {
    proxyUrl: `http://127.0.0.1:${port}`,
    requests,
    createRepository: async function (host, repositoryPath) {
      const path = Path.join(root, host, repositoryPath);
      await Fs.ensureDir(path);
      const result = await gitExec(['init', '--bare', '--quiet'], path);
      if (result.exitCode !== 0) {
        throw new Error(`git init --bare failed: ${result.stderr}`);
      }
      return `http://${host}/${repositoryPath}`;
    },
    close,
  };
}

/** The username and password of a basic authorization header */
function basicCredential(
  header: string | undefined
): { username: string; password: string } | null {
  if (header === undefined || !header.startsWith('Basic ')) {
    return null;
  }
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString(
    'utf8'
  );
  const separator = decoded.indexOf(':');
  if (separator === -1) {
    return null;
  }
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/** Runs `git http-backend` as the CGI program it is */
async function serveGit(
  req: Http.IncomingMessage,
  res: Http.ServerResponse,
  props: { root: string; pathInfo: string; query: string; username: string }
): Promise<void> {
  const env: Record<string, string> = {
    GIT_PROJECT_ROOT: props.root,
    GIT_HTTP_EXPORT_ALL: '1',
    PATH_INFO: props.pathInfo,
    QUERY_STRING: props.query,
    REQUEST_METHOD: req.method ?? 'GET',
    CONTENT_TYPE: req.headers['content-type'] ?? '',
    REMOTE_USER: props.username,
    REMOTE_ADDR: '127.0.0.1',
  };
  const protocol = req.headers['git-protocol'];
  if (typeof protocol === 'string') {
    env['GIT_PROTOCOL'] = protocol;
  }
  const encoding = req.headers['content-encoding'];
  if (typeof encoding === 'string') {
    env['HTTP_CONTENT_ENCODING'] = encoding;
  }
  const length = req.headers['content-length'];
  if (typeof length === 'string') {
    env['CONTENT_LENGTH'] = length;
  }

  const child = gitSpawn(['http-backend'], props.root, { env });
  req.pipe(child.stdin);

  await new Promise<void>(function (resolve, reject) {
    let head = Buffer.alloc(0);
    let isBody = false;
    child.stdout.on('data', function (chunk: Buffer) {
      if (isBody) {
        res.write(chunk);
        return;
      }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end === -1) {
        return;
      }
      isBody = true;
      let status = 200;
      const headers: Record<string, string> = {};
      for (const line of head.subarray(0, end).toString('utf8').split('\r\n')) {
        const separator = line.indexOf(':');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key.toLowerCase() === 'status') {
          status = Number.parseInt(value, 10);
        } else {
          headers[key] = value;
        }
      }
      res.writeHead(status, headers);
      res.write(head.subarray(end + 4));
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', function () {
      if (!isBody) {
        res.writeHead(500);
      }
      res.end();
      resolve();
    });
  });
}

/** The Git LFS batch API and the basic transfer it hands out */
async function serveLfs(
  req: Http.IncomingMessage,
  res: Http.ServerResponse,
  props: {
    repository: string;
    href: string;
    authorization: string;
    rest: string;
  }
): Promise<void> {
  const store = Path.join(props.repository, 'lfs-objects');
  const body = await new Promise<Buffer>(function (resolve) {
    const chunks: Buffer[] = [];
    req.on('data', function (chunk: Buffer) {
      chunks.push(chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
  });
  const json = { 'Content-Type': 'application/vnd.git-lfs+json' };

  if (req.method === 'POST' && props.rest === '/objects/batch') {
    const batch: unknown = JSON.parse(body.toString('utf8'));
    const operation =
      typeof batch === 'object' && batch !== null && 'operation' in batch
        ? batch.operation
        : '';
    const objects =
      typeof batch === 'object' &&
      batch !== null &&
      'objects' in batch &&
      Array.isArray(batch.objects)
        ? batch.objects.filter(isLfsObject)
        : [];
    const answered = await Promise.all(
      objects.map(async function (object) {
        const action = {
          href: `${props.href}/${object.oid}`,
          header: { Authorization: props.authorization },
        };
        const exists = await Fs.pathExists(Path.join(store, object.oid));
        if (operation === 'upload') {
          return { ...object, actions: exists ? {} : { upload: action } };
        }
        return exists
          ? { ...object, actions: { download: action } }
          : {
              ...object,
              error: { code: 404, message: 'Object does not exist' },
            };
      })
    );
    res.writeHead(200, json);
    res.end(JSON.stringify({ transfer: 'basic', objects: answered }));
    return;
  }
  if (req.method === 'POST' && props.rest === '/locks/verify') {
    res.writeHead(200, json);
    res.end(JSON.stringify({ ours: [], theirs: [] }));
    return;
  }
  const oid = /^\/objects\/([0-9a-f]{64})$/.exec(props.rest)?.[1];
  if (oid !== undefined && req.method === 'PUT') {
    await Fs.outputFile(Path.join(store, oid), body);
    res.writeHead(200);
    res.end();
    return;
  }
  if (oid !== undefined && req.method === 'GET') {
    const path = Path.join(store, oid);
    if (await Fs.pathExists(path)) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(await Fs.readFile(path));
      return;
    }
  }
  res.writeHead(404, json);
  res.end(JSON.stringify({ message: 'Not found' }));
}

function isLfsObject(value: unknown): value is { oid: string; size: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'oid' in value &&
    typeof value.oid === 'string' &&
    /^[0-9a-f]{64}$/.test(value.oid) &&
    'size' in value &&
    typeof value.size === 'number'
  );
}
