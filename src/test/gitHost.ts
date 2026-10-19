import { exec as gitExec, spawn as gitSpawn } from 'dugite';
import Fs from 'fs-extra';
import Http from 'node:http';
import Path from 'node:path';
import Zlib from 'node:zlib';
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
 * elek.io Cloud's git hosts and for any other provider. It serves git's
 * smart HTTP protocol and Git LFS through the batch API, behind basic auth
 * that `authorize` decides.
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
      repository,
      rest,
      service: new URLSearchParams(url.search).get('service'),
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

/**
 * git's smart HTTP protocol, served by running `upload-pack` and
 * `receive-pack` with `--stateless-rpc`, which is all `git http-backend`
 * does for them. MinGit, the git dugite bundles on Windows, ships no
 * `git-http-backend`, while both of these are builtins of every git.
 *
 * @see https://git-scm.com/docs/http-protocol
 */
async function serveGit(
  req: Http.IncomingMessage,
  res: Http.ServerResponse,
  props: { repository: string; rest: string; service: string | null }
): Promise<void> {
  const isAdvertisement = props.rest === '/info/refs';
  const service = isAdvertisement ? props.service : props.rest.slice(1);
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
    req.resume();
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not a git service');
    return;
  }
  const command = service.slice('git-'.length);
  const protocol = req.headers['git-protocol'];
  const env: Record<string, string> =
    typeof protocol === 'string' ? { GIT_PROTOCOL: protocol } : {};

  const child = gitSpawn(
    isAdvertisement
      ? [command, '--stateless-rpc', '--advertise-refs', props.repository]
      : [command, '--stateless-rpc', props.repository],
    props.repository,
    { env }
  );
  const closed = new Promise<void>(function (resolve, reject) {
    child.on('error', reject);
    child.on('close', function () {
      resolve();
    });
  });
  child.stderr.resume();

  res.writeHead(200, {
    'Content-Type': `application/x-${service}-${isAdvertisement ? 'advertisement' : 'result'}`,
    'Cache-Control': 'no-cache',
  });
  if (isAdvertisement) {
    req.resume();
    child.stdin.end();
    // Protocol v2 answers with its capabilities alone, as http-backend does
    if (!(
      command === 'upload-pack' && /version=2/.test(env['GIT_PROTOCOL'] ?? '')
    )) {
      res.write(`${pktLine(`# service=${service}\n`)}0000`);
    }
  } else if (req.headers['content-encoding'] === 'gzip') {
    // git compresses a large fetch request
    req.pipe(Zlib.createGunzip()).pipe(child.stdin);
  } else {
    req.pipe(child.stdin);
  }
  child.stdout.pipe(res);
  await closed;
}

/** One packet of git's pkt-line format, its length counting itself */
function pktLine(text: string): string {
  return `${(Buffer.byteLength(text) + 4).toString(16).padStart(4, '0')}${text}`;
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
