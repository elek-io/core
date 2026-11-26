import { GitError, parseError } from 'dugite';
import Path from 'node:path';
import type { GitFileStatus } from '../schema/index.js';
import { CoreError } from './shared.js';

/**
 * Classifies an authentication failure from git's stderr, so a bad or
 * missing credential surfaces as a typed `Unauthorized` naming the fix
 * instead of raw git output. Returns null for everything else.
 *
 * SSH remotes authenticate through keys, not the token, so their failures
 * name the SSH setup instead of the token env vars. With `isOwnGitAccess`
 * no message names the token either, because the command never got it.
 */
export function classifyAuthError(
  stderr: string,
  hasToken: boolean,
  isOwnGitAccess = false
): CoreError | null {
  const parsed = parseError(stderr);

  // git prints "Could not read from remote repository." for a rejected
  // key, an unreachable host and a missing repository alike, and dugite
  // maps all three to SSHPermissionDenied. Only a permission signal in
  // the ssh output makes it an authentication failure, the rest stays
  // a plain failure so callers can tell an outage from a bad key.
  if (
    parsed === GitError.SSHAuthenticationFailed ||
    (parsed === GitError.SSHPermissionDenied &&
      /permission denied/i.test(stderr))
  ) {
    if (isOwnGitAccess) {
      return CoreError.unauthorized(
        'The address rejected SSH authentication. Core reads it with your own git access, so provide a valid SSH key, for example through ssh-agent. Ask whoever maintains the address for access to it.'
      );
    }
    return CoreError.unauthorized(
      'The remote rejected SSH authentication. Provide a valid SSH key, for example through ssh-agent. ELEK_IO_REMOTE_ACCESS_TOKEN only applies to HTTP(S) remotes.'
    );
  }

  const isAuthError =
    parsed === GitError.HTTPSAuthenticationFailed ||
    // Prompts are disabled, so git fails to read credentials it would
    // otherwise ask for. dugite does not classify this case.
    /could not read (Username|Password) for/i.test(stderr) ||
    /terminal prompts disabled/i.test(stderr) ||
    // A helper answered quit=1 without the relay recording why, git's
    // own words and git-lfs's
    /told us to quit/i.test(stderr) ||
    /Git credentials for .+ not found/i.test(stderr);
  if (!isAuthError) {
    return null;
  }
  if (isOwnGitAccess) {
    return CoreError.unauthorized(
      'The address needs authentication. Core reads it with your own git access and never with ELEK_IO_REMOTE_ACCESS_TOKEN, so sign in with your own git credential helper or SSH key. Ask whoever maintains the address for access to it.'
    );
  }
  if (hasToken) {
    return CoreError.unauthorized(
      'The remote rejected the provided token. Check ELEK_IO_REMOTE_ACCESS_TOKEN and ELEK_IO_REMOTE_ACCESS_TOKEN_USER.'
    );
  }
  return CoreError.unauthorized(
    'The remote requires authentication. Set the ELEK_IO_REMOTE_ACCESS_TOKEN environment variable.'
  );
}

/**
 * A library the dynamic loader names when it fails, as in
 * `git-remote-https: error while loading shared libraries: libcurl-gnutls.so.4: cannot open shared object file`
 * or `/lib/libcurl.so.4: version 'CURL_OPENSSL_4' not found`. Matched on
 * the library name rather than the loader's words, which glibc localizes.
 */
const SHARED_LIBRARY_FAILURE = /[\s/](lib[^\s:/]+\.so(?:\.\d+)*): /;

/**
 * Classifies a git that could not start a program because the dynamic
 * loader failed, which on Linux is what an embedded git built against
 * another distribution's libraries does. Returns null for everything else.
 *
 * @see ../../contributing/peer-dependencies.md
 */
export function classifyLoadError(stderr: string): CoreError | null {
  const library = SHARED_LIBRARY_FAILURE.exec(stderr)?.[1];
  if (library === undefined) {
    return null;
  }
  return CoreError.preconditionFailed(
    `Git could not load the shared library "${library}". Install it, use dugite 3.2.3 or later, whose git links libcurl.so.4, or point LOCAL_GIT_DIRECTORY at another git installation.`,
    gitOutputCause(stderr, ''),
    'git_library_missing'
  );
}

const REDACTED = '[redacted]';

/**
 * The userinfo of an address, up to the last `@` of its authority.
 * Everything before that last one is the credential or part of one
 * whichever `@` the client reads as the delimiter, and a host name holds
 * none for this to swallow. Stopping at `?` and `#` keeps an `@` in a
 * query string out of it, and stopping at `/` keeps it inside one
 * authority.
 */
const URL_CREDENTIALS = /:\/\/[^/?#\s]*@/g;

/** A character a scheme is written with, and the one it must hold */
const SCHEME_CHARACTER = /[\w+.-]/;
const SCHEME_LETTER = /[a-zA-Z]/;

/**
 * Takes the credentials out of every remote address in a text, so an
 * address a User or a pipeline put a password or a token into can be
 * written down. The host, the path and the rest of the text stay.
 *
 * The SSH shorthand `git@host:org/repo` carries no scheme, so its user
 * stays: there it is part of the address rather than a credential.
 *
 * @see ../../contributing/logging.md
 */
export function redactUrlCredentials(value: string): string {
  return value.replace(URL_CREDENTIALS, function (match, offset: number) {
    return hasSchemeBefore(value, offset) ? `://${REDACTED}@` : match;
  });
}

/**
 * Whether a scheme ends where the `://` at `end` begins, which is a run of
 * scheme characters holding at least one letter.
 *
 * Read backwards from the `://` rather than matched in front of it: a
 * pattern that matches the scheme first retries from every position of the
 * text, which costs a masker handed a stack or a whole file quadratic
 * time.
 */
function hasSchemeBefore(value: string, end: number): boolean {
  for (let index = end - 1; index >= 0; index--) {
    const character = value.charAt(index);
    if (SCHEME_LETTER.test(character)) {
      return true;
    }
    if (SCHEME_CHARACTER.test(character) === false) {
      return false;
    }
  }
  return false;
}

/**
 * A remote helper address, `<helper>::<argument>`. git hands the argument to
 * the program `git-remote-<helper>`, and the `ext` helper of them runs it as
 * a command.
 */
const REMOTE_HELPER_ADDRESS = /^[A-Za-z0-9][A-Za-z0-9+.-]*::/;

/**
 * The scheme and the userinfo of an address, up to the last `@` of its
 * authority, which is the one every client reads as the delimiter.
 */
const ADDRESS_USERINFO = /^([\w+.-]+):\/\/([^/?#\s]*)@/;

/**
 * Whether the userinfo of an address is a credential rather than part of the
 * address: a password under any scheme, and a user alone under http or
 * https, where that is how a token is handed over. `ssh://git@host/repo`
 * carries its user the way the shorthand `git@host:repo` does.
 */
function carriesCredential(address: string): boolean {
  const match = ADDRESS_USERINFO.exec(address);
  if (match === null) {
    return false;
  }
  const scheme = (match[1] ?? '').toLowerCase();
  const userinfo = match[2] ?? '';
  return userinfo.includes(':') || scheme === 'http' || scheme === 'https';
}

/**
 * Whether git reads an address as a path on this machine: everything that
 * names no scheme and is not the SSH shorthand, whose colon comes before any
 * slash. A drive letter is a path rather than a host.
 */
function isLocalPath(address: string): boolean {
  if (/^[\w+.-]+:\/\//.test(address)) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(address)) {
    return true;
  }
  const colon = address.indexOf(':');
  const slash = address.search(/[/\\]/);
  return colon === -1 || (slash !== -1 && slash < colon);
}

/**
 * Whether a path leads to one place wherever it is read from. Both path
 * flavors answer, so one address is refused or taken the same way on every
 * platform rather than by the one Core happens to run on.
 */
function isAbsolutePath(address: string): boolean {
  return Path.posix.isAbsolute(address) || Path.win32.isAbsolute(address);
}

/**
 * Why an address must not be handed to git, or null when it may be. Core
 * keeps the address of a theme in the Project, where a credential would
 * become a committed secret, and reads it with the person's own git access.
 *
 * @see ../../contributing/git-credentials.md
 */
export function classifyUnsafeAddress(address: string): CoreError | null {
  if (address.trim() === '') {
    return CoreError.badRequest('A git address must not be empty');
  }
  if (/\p{Cc}/u.test(address)) {
    return CoreError.badRequest(
      'A git address must not hold a control character'
    );
  }
  if (address.startsWith('-')) {
    return CoreError.badRequest(
      `Refusing the git address "${redactUrlCredentials(address)}", because git would read an address starting with "-" as one of its own options`
    );
  }
  const helper = REMOTE_HELPER_ADDRESS.exec(address)?.[0];
  if (helper !== undefined) {
    return CoreError.badRequest(
      `Refusing the git address "${redactUrlCredentials(address)}", because git runs a "${helper}" address through a remote helper, which can execute a command`
    );
  }
  if (carriesCredential(address)) {
    return CoreError.badRequest(
      `Refusing the git address "${redactUrlCredentials(address)}", because it carries a credential, which must not be kept in a Project. Use an address without one and let your own git access answer for it`
    );
  }
  if (isLocalPath(address) && isAbsolutePath(address) === false) {
    return CoreError.badRequest(
      `Refusing the git address "${redactUrlCredentials(address)}", because a path on this machine has to be absolute. A relative one leads somewhere else for every directory it is read from, and the Project keeps the address. Give its absolute path`
    );
  }
  return null;
}

/**
 * Redacts the User's identity out of a git command line before it is written
 * down, in a log record or in an error message.
 *
 * Core hands git the identity through the environment, so no command line it
 * builds carries one. This is the backstop for the shapes that would: `commit
 * --author`, `config user.name` and `config user.email`, and credentials in a
 * remote URL. Ids, paths and flags stay, they make a log line resolvable.
 *
 * @see ../../contributing/logging.md
 */
export function redactGitArgs(args: readonly string[]): string[] {
  return args.map((arg, index) => {
    if (arg.startsWith('--author=')) {
      return `--author=${REDACTED}`;
    }
    const previous = args[index - 1];
    if (previous === 'user.name' || previous === 'user.email') {
      return REDACTED;
    }
    return redactUrlCredentials(arg);
  });
}

/** The command line as it may be written down. */
export function redactedCommand(args: readonly string[]): string {
  return `git ${redactGitArgs(args).join(' ')}`;
}

/**
 * What git said, as the cause of the error rather than part of its
 * message. A message is read by whoever made the call and by whoever the
 * log file is handed to, and this text is only safe for the first.
 *
 * @see ../../contributing/logging.md
 */
export function gitOutputCause(stderr: string, stdout: string): Error {
  return new Error(`${stderr}\n${stdout}`.trim());
}

/**
 * The single letter porcelain v2 uses for a change, mapped onto the status a
 * caller reads. A copy is reported as an addition, because the file is new,
 * and a type change as a modification.
 */
const PORCELAIN_CHANGE_CODES: Record<string, GitFileStatus['status']> = {
  A: 'added',
  C: 'added',
  M: 'modified',
  T: 'modified',
  D: 'deleted',
  R: 'renamed',
};

/**
 * Parses one porcelain v2 line into a file status, returning null for the
 * header lines and for anything unrecognised.
 *
 * Read by line type rather than by a fixed field index, which is what the
 * four types differ in: a rename carries an extra similarity score and an
 * unmerged entry three more mode and hash columns. The path is the rest of
 * the line, so one holding a space survives.
 *
 * @see https://git-scm.com/docs/git-status#_porcelain_format_version_2
 */
export function parsePorcelainStatusLine(line: string): GitFileStatus | null {
  const [type, ...fields] = line.split(' ');

  // `? <path>` and `! <path>`, where the path starts right after the prefix.
  // Ignored entries only appear with --ignored, which Core does not pass
  if (type === '?' || type === '!') {
    const path = line.slice(type.length + 1);
    return path === '' ? null : { path, status: 'untracked', isStaged: false };
  }

  // `1 <XY> ...` and `2 <XY> ...` carry seven fields before the path, plus
  // the rename score on a `2`. `u <XY> ...` carries nine.
  const pathFieldIndex =
    type === '1' ? 8 : type === '2' ? 9 : type === 'u' ? 10 : -1;
  if (pathFieldIndex === -1) {
    return null;
  }

  const xy = fields[0];
  if (xy === undefined) {
    return null;
  }

  const path = fields
    .slice(pathFieldIndex - 1)
    .join(' ')
    // A rename entry names the new path and the old one, tab separated
    .split('\t')[0];
  if (path === undefined || path === '') {
    return null;
  }

  if (type === 'u') {
    return { path, status: 'unmerged', isStaged: false };
  }

  // X is the change staged in the index, Y the one still in the working
  // tree, and a dot means unchanged there. A file carrying both is one
  // entry, described by what is staged
  const staged = xy[0] ?? '.';
  const isStaged = staged !== '.';
  const code = isStaged ? staged : (xy[1] ?? '.');
  const status = PORCELAIN_CHANGE_CODES[code];

  return status ? { path, status, isStaged } : null;
}

/**
 * Commands that only ask the repository something. Everything else
 * changes it, a remote or the installation's configuration.
 */
const READING_GIT_COMMANDS = new Set([
  'status',
  'log',
  'show',
  'diff',
  'rev-parse',
  'rev-list',
  'merge-base',
  'ls-files',
  'ls-tree',
  'ls-remote',
  'cat-file',
  'check-ref-format',
  'check-ignore',
  'describe',
  'for-each-ref',
  'symbolic-ref',
  'shortlog',
  'blame',
  'var',
  'help',
]);

/** Flags that turn a ref command into a listing */
const LISTING_REF_FLAGS = new Set([
  '--list',
  '-l',
  '--show-current',
  '--contains',
  '--no-contains',
  '--points-at',
  '--merged',
  '--no-merged',
  '-a',
  '--all',
  '-v',
  '--verbose',
]);

/** Flags that turn a config command into a lookup */
const READING_CONFIG_FLAGS = new Set([
  '--get',
  '--get-all',
  '--get-regexp',
  '--get-urlmatch',
  '--list',
  '-l',
]);

const READING_REMOTE_SUBCOMMANDS = new Set(['show', 'get-url']);

/**
 * The line an atomic push prints for a ref rejected as not fast-forwarding.
 * git follows it with the refs it then gave up on, so dugite's own
 * `PushNotFastForward` pattern, which expects git's error line right after,
 * misses it.
 */
export const ATOMIC_NOT_FAST_FORWARD =
  /^ ! \[rejected\] .+ \((non-fast-forward|fetch first)\)$/m;

const READING_LFS_SUBCOMMANDS = new Set([
  'env',
  'version',
  'status',
  'ls-files',
  'locks',
]);

/**
 * Commands that change a repository but never write a commit or a tag, so
 * git records no identity for them. A reflog entry takes one when there is,
 * and goes on without it when there is not.
 */
const ANONYMOUS_GIT_COMMANDS = new Set([
  'add',
  'branch',
  'checkout',
  'clone',
  'config',
  'fetch',
  'init',
  'lfs',
  'push',
  'remote',
  'reset',
  'restore',
  'rm',
  'switch',
]);

/**
 * True when the command changes a repository, a remote or the git
 * configuration, which is what decides whether it is logged at `info` or
 * at `debug`.
 *
 * `info` is the whole of what a packaged elek.io Desktop records, so a
 * mutation belongs in it and a read does not. A command nobody classified
 * counts as a mutation: a noisy line is a smaller failure than a line
 * that should have been there and is not.
 *
 * @see ../../contributing/logging.md
 */
export function isMutatingGitCommand(args: readonly string[]): boolean {
  const nonFlags = args.filter((arg) => !arg.startsWith('-'));
  const command = nonFlags[0];

  if (command === undefined) {
    // `git --version` and `git --exec-path` ask the installation about itself
    return false;
  }
  if (READING_GIT_COMMANDS.has(command)) {
    return false;
  }

  switch (command) {
    case 'branch':
    case 'tag':
      // Listing, everything else creates, deletes or moves a ref
      return !args.some((arg) => LISTING_REF_FLAGS.has(arg));
    case 'config':
      return !args.some((arg) => READING_CONFIG_FLAGS.has(arg));
    case 'remote': {
      const subcommand = nonFlags[1];
      // `git remote` on its own lists the remotes
      return (
        subcommand !== undefined && !READING_REMOTE_SUBCOMMANDS.has(subcommand)
      );
    }
    case 'lfs': {
      const subcommand = nonFlags[1];
      return (
        subcommand !== undefined && !READING_LFS_SUBCOMMANDS.has(subcommand)
      );
    }
    default:
      return true;
  }
}

/**
 * True when the command may write a commit or a tag, so git has to be told
 * who the User is. A changing command nobody classified counts as one, so a
 * command added later cannot sign with whatever identity git finds on the
 * machine.
 *
 * @see ../../contributing/git-identity.md
 */
export function recordsGitIdentity(args: readonly string[]): boolean {
  if (isMutatingGitCommand(args) === false) {
    return false;
  }
  const command = args.find((arg) => !arg.startsWith('-'));
  return command !== undefined && !ANONYMOUS_GIT_COMMANDS.has(command);
}

/**
 * For every commit of a `git rev-list --parents --topo-order` walk, the first
 * of `releaseCommits` that contains it, by ancestry rather than by date.
 *
 * The walk lists a child before its parents, so reading it backwards reaches
 * a release commit before every release commit that descends from it. Marking
 * stops at a commit an earlier release already named, which both keeps the
 * earlier Release and bounds the whole pass by the length of the walk.
 *
 * @see ../../contributing/releases.md
 */
export function firstReleaseByCommit(
  walk: string,
  releaseCommits: ReadonlySet<string>
): Map<string, string> {
  const parentsOf = new Map<string, string[]>();
  const childrenFirst: string[] = [];

  for (const line of walk.split('\n')) {
    const [hash, ...parents] = line
      .trim()
      .split(/\s+/)
      .filter((part) => part !== '');
    if (hash === undefined) {
      continue;
    }
    parentsOf.set(hash, parents);
    childrenFirst.push(hash);
  }

  const releaseByCommit = new Map<string, string>();
  for (let index = childrenFirst.length - 1; index >= 0; index -= 1) {
    const releaseCommit = childrenFirst[index];
    if (releaseCommit === undefined || !releaseCommits.has(releaseCommit)) {
      continue;
    }
    const toMark = [releaseCommit];
    while (toMark.length > 0) {
      const commit = toMark.pop();
      if (commit === undefined || releaseByCommit.has(commit)) {
        continue;
      }
      releaseByCommit.set(commit, releaseCommit);
      toMark.push(...(parentsOf.get(commit) ?? []));
    }
  }

  return releaseByCommit;
}
