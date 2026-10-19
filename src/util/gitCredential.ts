import { uuidSchema } from '../schema/baseSchema.js';

/**
 * Helpers for the credential helper Core installs for git, and the relay
 * behind it. Everything here is pure, so it is tested without git.
 *
 * @see ../../contributing/git-credentials.md
 */

/** What a helper answers on `get` to make git stop asking anyone else */
export const QUIT_ANSWER = 'quit=1\n';

/**
 * How the helper was installed, which git passes as its first argument:
 * scoped to elek.io Cloud's git hosts, or for every host while
 * `ELEK_IO_REMOTE_ACCESS_TOKEN` is set
 */
export type GitCredentialMode = 'cloud' | 'token';

/** The environment variables that carry the relay's address and token */
export const RELAY_PORT_ENV = 'ELEK_IO_CREDENTIAL_PORT';
export const RELAY_TOKEN_ENV = 'ELEK_IO_CREDENTIAL_TOKEN';

/** The keys of git's credential request Core reads, null when absent */
export interface GitCredentialRequest {
  protocol: string | null;
  host: string | null;
  path: string | null;
  username: string | null;
  password: string | null;
}

/**
 * Reads one request of git's credential protocol, `key=value` per line.
 * A key Core does not read is skipped, which covers the `capability[]`
 * and `wwwauth[]` lines git-lfs sends.
 *
 * @see https://git-scm.com/docs/git-credential#IOFMT
 */
export function parseCredentialRequest(input: string): GitCredentialRequest {
  const request: GitCredentialRequest = {
    protocol: null,
    host: null,
    path: null,
    username: null,
    password: null,
  };
  for (const line of input.split('\n')) {
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).replace(/\r$/, '');
    if (
      key === 'protocol' ||
      key === 'host' ||
      key === 'path' ||
      key === 'username' ||
      key === 'password'
    ) {
      request[key] = value;
    }
  }
  return request;
}

/**
 * The answer to a `get` that hands git a credential, or null when either
 * value holds a control character, which could break the protocol's lines
 */
export function formatCredentialAnswer(
  username: string,
  password: string
): string | null {
  if (/\p{Cc}/u.test(username) || /\p{Cc}/u.test(password)) {
    return null;
  }
  return `username=${username}\npassword=${password}\n`;
}

/**
 * The Project id a remote on one of elek.io Cloud's git hosts names, read
 * from the `projects/<id>.git` path git sends, or null for any other path
 */
export function projectIdOfCredentialPath(path: string | null): string | null {
  if (path === null) {
    return null;
  }
  const id = /^projects\/([^/]+?)(?:\.git)?(?:\/info\/lfs)?\/?$/.exec(
    path
  )?.[1];
  if (id === undefined) {
    return null;
  }
  const parsed = uuidSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

/**
 * Quotes a value for a POSIX shell and for `GIT_CONFIG_PARAMETERS`, which
 * both read single quotes the same way
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Config entries as `GIT_CONFIG_PARAMETERS` carries them, in order. It
 * reaches every process under git, git-lfs included, which `-c` would not.
 */
export function gitConfigParameters(
  entries: ReadonlyArray<readonly [string, string]>
): string {
  return entries
    .map(([key, value]) => `${shellQuote(key)}=${shellQuote(value)}`)
    .join(' ');
}

/**
 * The helper as git runs it: a shell snippet, so a path with a space
 * survives, starting Node on the relay script. Inside Electron it is the
 * app's own binary run as Node, which needs the `RunAsNode` fuse on.
 */
export function credentialHelperCommand(props: {
  execPath: string;
  scriptPath: string;
  mode: GitCredentialMode;
  isElectron: boolean;
}): string {
  const runAsNode = props.isElectron ? 'ELECTRON_RUN_AS_NODE=1 ' : '';
  return `!${runAsNode}${shellQuote(props.execPath)} ${shellQuote(props.scriptPath)} ${props.mode}`;
}

/**
 * The credential config of one git invocation, in the order git applies
 * it. An empty helper resets the list, so a matching host is asked of
 * Core's helper alone and never of the person's keychain.
 *
 * - With the remote token, every host is answered by Core's helper.
 * - With a Cloud pattern, its hosts are answered by Core's helper scoped
 *   to them, with the path, which names the Project. The scoped reset
 *   comes later, so it wins over the token for those hosts.
 */
export function credentialConfig(props: {
  cloudGitUrl: string | null;
  hasRemoteToken: boolean;
  helper: (mode: GitCredentialMode) => string;
}): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (props.hasRemoteToken) {
    entries.push(
      ['credential.helper', ''],
      ['credential.helper', props.helper('token')]
    );
  }
  if (props.cloudGitUrl !== null) {
    const scope = `credential.${props.cloudGitUrl}`;
    entries.push(
      [`${scope}.helper`, ''],
      [`${scope}.helper`, props.helper('cloud')],
      [`${scope}.useHttpPath`, 'true']
    );
  }
  return entries;
}

/**
 * Reads the message the helper sends the relay: the relay token, the mode
 * and git's action one per line, then git's request as it arrived. Null
 * when it is cut short.
 */
export function parseRelayMessage(message: string): {
  token: string;
  mode: string;
  action: string;
  input: string;
} | null {
  const [token, mode, action, ...input] = message.split('\n');
  if (token === undefined || mode === undefined || action === undefined) {
    return null;
  }
  return { token, mode, action, input: input.join('\n') };
}

/**
 * The helper git runs, as CommonJS for plain Node and Electron alike. It
 * forwards `get` and `erase` to the relay and prints the answer, and
 * answers `store` and anything else with nothing. Without a relay it
 * answers `quit=1`, so git never falls through to a prompt.
 *
 * It holds no secret. The relay's port and the token valid for this one
 * invocation reach it through git's environment.
 */
export const CREDENTIAL_HELPER_SCRIPT = `'use strict';
// Written by elek.io Core. Relays one request of git's credential protocol
// to the Core that started git and prints its answer.
const net = require('node:net');
const args = process.argv.slice(2);
const mode = args[0] || '';
const action = args[args.length - 1] || '';
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  if (action === 'get' || action === 'erase') {
    relay(Buffer.concat(chunks).toString('utf8'));
  }
});
function relay(input) {
  let isDone = false;
  const finish = (answer) => {
    if (isDone) return;
    isDone = true;
    if (action === 'get') process.stdout.write(answer);
  };
  const port = Number(process.env['${RELAY_PORT_ENV}']);
  const token = process.env['${RELAY_TOKEN_ENV}'];
  if (!Number.isInteger(port) || port <= 0 || !token) {
    finish('${QUIT_ANSWER.replace('\n', '\\n')}');
    return;
  }
  const answer = [];
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.on('data', (chunk) => answer.push(chunk));
  socket.on('end', () => finish(Buffer.concat(answer).toString('utf8')));
  socket.on('error', () => finish('${QUIT_ANSWER.replace('\n', '\\n')}'));
  socket.end(token + '\\n' + mode + '\\n' + action + '\\n' + input);
}
`;
