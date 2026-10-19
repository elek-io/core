import { GitError, parseError } from 'dugite';
import type { GitFileStatus } from '../schema/index.js';
import { CoreError } from './shared.js';

/**
 * Builds the environment for git commands.
 *
 * Terminal prompts are always disabled, so a missing or wrong token
 * fails a command instead of hanging it. With a token, GIT_ASKPASS
 * points at the askpass helper and the token travels by environment
 * variable only, never as an argument, a URL or repository config.
 *
 * @see ../../contributing/git-credentials.md for the design rationale and invariants
 */
export function buildCredentialEnv(
  token: string | null,
  tokenUser: string,
  askpassPath: string | null
): Record<string, string> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' };
  if (token === null || askpassPath === null) {
    return env;
  }
  return {
    ...env,
    GIT_ASKPASS: askpassPath,
    ELEK_IO_ASKPASS_TOKEN: token,
    ELEK_IO_ASKPASS_TOKEN_USER: tokenUser,
    // Configured credential helpers would take precedence over the
    // askpass fallback. An empty helper entry resets the list, so the
    // token is authoritative while it is set.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
  };
}

/**
 * Classifies an authentication failure from git's stderr, so a bad or
 * missing credential surfaces as a typed `Unauthorized` naming the fix
 * instead of raw git output. Returns null for everything else.
 *
 * SSH remotes authenticate through keys, not the token, so their
 * failures name the SSH setup instead of the token env vars.
 */
export function classifyAuthError(
  stderr: string,
  hasToken: boolean
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
    return CoreError.unauthorized(
      'The remote rejected SSH authentication. Provide a valid SSH key, for example through ssh-agent. ELEK_IO_REMOTE_ACCESS_TOKEN only applies to HTTP(S) remotes.'
    );
  }

  const isAuthError =
    parsed === GitError.HTTPSAuthenticationFailed ||
    // Prompts are disabled, so git fails to read credentials it would
    // otherwise ask for. dugite does not classify this case.
    /could not read (Username|Password) for/i.test(stderr) ||
    /terminal prompts disabled/i.test(stderr);
  if (!isAuthError) {
    return null;
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
    gitOutputCause(stderr, '')
  );
}

const REDACTED = '[redacted]';

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
    // scheme://userinfo@host, never the SSH shorthand git@host:org/repo,
    // where the user is part of the address rather than a credential
    return arg.replace(/^([a-zA-Z][\w+.-]*:\/\/)[^/@]+@/, `$1${REDACTED}@`);
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
