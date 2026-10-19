import { createHash, randomBytes } from 'node:crypto';
import Net from 'node:net';
import Path from 'node:path';
import Fs from 'fs-extra';
import type { LogService } from '../service/LogService.js';
import type { CloudClient } from './cloud.js';
import { CloudGitAccess } from './cloudGit.js';
import {
  CREDENTIAL_HELPER_SCRIPT,
  QUIT_ANSWER,
  RELAY_PORT_ENV,
  RELAY_TOKEN_ENV,
  credentialConfig,
  credentialHelperCommand,
  formatCredentialAnswer,
  gitConfigParameters,
  parseCredentialRequest,
  parseRelayMessage,
  projectIdOfCredentialPath,
  type GitCredentialMode,
  type GitCredentialRequest,
} from './gitCredential.js';
import type { PathTo } from './node.js';
import { CoreError } from './shared.js';

/** What one git invocation needs: its environment, and how it ends */
export interface GitCredentialInvocation {
  env: Record<string, string>;
  /** Ends the invocation. Its relay token answers `quit=1` from then on */
  finish: () => GitCredentialOutcome;
}

/** What the helper did during one git invocation */
export interface GitCredentialOutcome {
  /**
   * The git host refused a token elek.io Cloud minted, so a new
   * invocation asks Cloud again
   */
  isRetryable: boolean;
  /** Why the helper answered `quit=1`, the command's error if it failed */
  failure: CoreError | null;
  /** The Project each Cloud host was answered for, by host */
  answered: Map<string, string>;
}

/**
 * Answers git's credential requests for the git invocations Core runs,
 * through a helper git starts that forwards each request here over
 * loopback TCP. It answers elek.io Cloud's git hosts with the session's git
 * tokens, and every other host with `ELEK_IO_REMOTE_ACCESS_TOKEN` while it
 * is set. It hears `erase` and answers `quit=1` for that host for the rest
 * of the invocation, so git and git-lfs stop. A request arrives while git
 * holds Core's git queue, so nothing here may wait on it.
 *
 * @see ../../contributing/git-credentials.md
 */
export class GitCredentialRelay {
  /** The most a helper may send, far more than any request git writes */
  private static readonly maxMessageBytes = 64 * 1024;
  /** How long a helper may take to send its request */
  private static readonly receiveTimeoutMs = 10_000;

  private readonly cloudGitUrl: string | null;
  private readonly remoteToken: { token: string; user: string } | null;
  private readonly cloudClient: CloudClient;
  private readonly logService: LogService;
  private readonly scriptPath: string;
  private readonly access: CloudGitAccess;
  private readonly invocations = new Map<string, Invocation>();
  private server: Net.Server | null = null;
  private listening: Promise<number> | null = null;

  public constructor(props: {
    cloudGitUrl: string | null;
    remoteToken: { token: string; user: string } | null;
    cloudClient: CloudClient;
    logService: LogService;
    pathTo: PathTo;
  }) {
    this.cloudGitUrl = props.cloudGitUrl;
    this.remoteToken = props.remoteToken;
    this.cloudClient = props.cloudClient;
    this.logService = props.logService;
    this.access = new CloudGitAccess(props.cloudClient, props.logService);
    // Named after its content, so a Core of another version sharing the
    // data directory never runs a script it did not write
    const digest = createHash('sha256')
      .update(CREDENTIAL_HELPER_SCRIPT)
      .digest('hex')
      .slice(0, 12);
    this.scriptPath = Path.join(
      props.pathTo.tmp,
      `git-credential-${digest}.cjs`
    );
  }

  /** Whether `ELEK_IO_REMOTE_ACCESS_TOKEN` was set at construction */
  public get hasRemoteToken(): boolean {
    return this.remoteToken !== null;
  }

  /**
   * Starts one git invocation. Prompts and askpass are always off, so git
   * fails rather than ask a person. The helper is installed for a Cloud
   * pattern or a remote token, unless the invocation runs no git command
   * and so can never ask, and the person's own helpers keep the rest.
   */
  public async begin(hasCommand = true): Promise<GitCredentialInvocation> {
    const env: Record<string, string> = {
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
    };
    if (
      hasCommand === false ||
      (this.cloudGitUrl === null && this.remoteToken === null)
    ) {
      return { env, finish: () => emptyOutcome() };
    }

    const port = await this.listen();
    // Checked on every call, so a tmp directory another Core emptied heals
    if ((await Fs.pathExists(this.scriptPath)) === false) {
      await Fs.outputFile(this.scriptPath, CREDENTIAL_HELPER_SCRIPT);
    }

    const relayToken = randomBytes(32).toString('hex');
    const invocation = new Invocation();
    this.invocations.set(relayToken, invocation);

    const parameters = gitConfigParameters(
      credentialConfig({
        cloudGitUrl: this.cloudGitUrl,
        hasRemoteToken: this.remoteToken !== null,
        helper: (mode) =>
          credentialHelperCommand({
            execPath: process.execPath,
            scriptPath: this.scriptPath,
            mode,
            isElectron: process.versions['electron'] !== undefined,
          }),
      })
    );
    // Appended, as git's own -c does, so config the host process passes
    // git keeps applying and Core's entries come last
    const inherited = process.env['GIT_CONFIG_PARAMETERS']?.trim();
    env['GIT_CONFIG_PARAMETERS'] = inherited
      ? `${inherited} ${parameters}`
      : parameters;
    env[RELAY_PORT_ENV] = String(port);
    env[RELAY_TOKEN_ENV] = relayToken;

    return {
      env,
      finish: () => {
        this.invocations.delete(relayToken);
        return invocation.outcome();
      },
    };
  }

  /**
   * Forgets that a Project was granted on a host, after git answered
   * `repository not found` for it, so the next command asks Cloud again
   */
  public forget(host: string, projectId: string): void {
    this.access.forget(host, projectId);
  }

  /** Stops listening. A git invocation started afterwards listens again */
  public async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.listening = null;
    if (server === null) {
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  /**
   * Listens on a loopback port once, on the first invocation that needs
   * it. Unreferenced, so it never keeps a host's process alive
   */
  private listen(): Promise<number> {
    if (this.listening !== null) {
      return this.listening;
    }
    const listening = new Promise<number>((resolve, reject) => {
      // Half open, because the helper ends its side once it has sent the
      // request and still reads the answer
      const server = Net.createServer({ allowHalfOpen: true }, (socket) =>
        this.serve(socket)
      );
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.unref();
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('The credential relay has no TCP port'));
          return;
        }
        this.server = server;
        resolve(address.port);
      });
    });
    this.listening = listening;
    // A failed listen is not kept, so the next invocation tries again
    listening.catch(() => {
      if (this.listening === listening) {
        this.listening = null;
      }
    });
    return listening;
  }

  /** Reads one helper's message, then answers it and closes */
  private serve(socket: Net.Socket): void {
    const chunks: Buffer[] = [];
    let size = 0;
    socket.setTimeout(GitCredentialRelay.receiveTimeoutMs, () => {
      socket.destroy();
    });
    socket.on('error', () => undefined);
    socket.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > GitCredentialRelay.maxMessageBytes) {
        socket.destroy();
        return;
      }
      chunks.push(chunk);
    });
    socket.on('end', () => {
      socket.setTimeout(0);
      this.answer(Buffer.concat(chunks).toString('utf8')).then(
        (answer) => socket.end(answer),
        () => socket.end(QUIT_ANSWER)
      );
    });
  }

  /** The text the helper prints for one message */
  private async answer(raw: string): Promise<string> {
    const message = parseRelayMessage(raw);
    const invocation =
      message === null ? undefined : this.invocations.get(message.token);
    if (message === null || invocation === undefined) {
      return message?.action === 'erase' ? '' : QUIT_ANSWER;
    }
    const request = parseCredentialRequest(message.input);
    const host = request.host?.toLowerCase();
    if (host === undefined || host === '') {
      return message.action === 'get' ? QUIT_ANSWER : '';
    }

    const mode: GitCredentialMode | null =
      message.mode === 'cloud' || message.mode === 'token'
        ? message.mode
        : null;
    // Signed out, a Cloud host gets the remote token like any other host
    const isCloud =
      mode === 'cloud' &&
      (this.cloudClient.hasToken || this.remoteToken === null);
    if (message.action === 'get') {
      if (invocation.hasQuit(host)) {
        return QUIT_ANSWER;
      }
      if (mode === null) {
        return QUIT_ANSWER;
      }
      return isCloud
        ? this.cloudGet(invocation, host, request)
        : this.tokenGet(invocation, host);
    }
    if (message.action === 'erase' && mode !== null) {
      if (isCloud) {
        this.cloudErase(invocation, host, request);
      } else {
        invocation.quit(host, remoteTokenRefused());
      }
    }
    return '';
  }

  private async cloudGet(
    invocation: Invocation,
    host: string,
    request: GitCredentialRequest
  ): Promise<string> {
    if (this.cloudClient.hasToken === false) {
      return invocation.quit(
        host,
        CoreError.unauthorized(
          `Sign in to elek.io Cloud to reach its git host "${host}"`
        )
      );
    }
    const projectId = projectIdOfCredentialPath(request.path);
    if (projectId === null) {
      return invocation.quit(
        host,
        CoreError.preconditionFailed(
          `The remote on elek.io Cloud's git host "${host}" names no Project. Its path has to be projects/<id>.git.`
        )
      );
    }
    try {
      const credential = await this.access.credentialFor(host, projectId);
      const answer = formatCredentialAnswer(
        credential.username,
        credential.password
      );
      if (answer === null) {
        throw CoreError.internal(
          'elek.io Cloud answered a git credential with a line break'
        );
      }
      invocation.answered.set(host, projectId);
      return answer;
    } catch (error) {
      // The Cloud call's own error, so an outage stays PreconditionFailed
      return invocation.quit(
        host,
        error instanceof CoreError
          ? error
          : CoreError.internal(
              'Core could not answer git for elek.io Cloud',
              error
            )
      );
    }
  }

  private cloudErase(
    invocation: Invocation,
    host: string,
    request: GitCredentialRequest
  ): void {
    const isDropped = this.access.drop(host, request.password);
    invocation.isRetryable = true;
    invocation.quit(
      host,
      CoreError.unauthorized(
        `The git host "${host}" refused the git token elek.io Cloud answered`
      )
    );
    this.logService.info({
      source: 'core',
      message: isDropped
        ? 'A git host refused a git token, so Core dropped it'
        : 'A git host refused a git token Core no longer held',
      meta: { 'server.address': host },
    });
  }

  private tokenGet(invocation: Invocation, host: string): string {
    if (this.remoteToken === null) {
      return QUIT_ANSWER;
    }
    const answer = formatCredentialAnswer(
      this.remoteToken.user,
      this.remoteToken.token
    );
    if (answer === null) {
      return invocation.quit(
        host,
        CoreError.badRequest(
          'ELEK_IO_REMOTE_ACCESS_TOKEN and ELEK_IO_REMOTE_ACCESS_TOKEN_USER must not hold a line break'
        )
      );
    }
    return answer;
  }
}

/**
 * The state of one git invocation and the git-lfs processes under it: the
 * hosts the helper now answers `quit=1` for, and why
 */
class Invocation {
  public isRetryable = false;
  public readonly answered = new Map<string, string>();
  private readonly quitHosts = new Set<string>();
  private failure: CoreError | null = null;

  public hasQuit(host: string): boolean {
    return this.quitHosts.has(host);
  }

  /** Answers `quit=1` for the host from now on, keeping the first reason */
  public quit(host: string, reason: CoreError): string {
    this.quitHosts.add(host);
    this.failure ??= reason;
    return QUIT_ANSWER;
  }

  public outcome(): GitCredentialOutcome {
    return {
      isRetryable: this.isRetryable,
      failure: this.failure,
      answered: this.answered,
    };
  }
}

function emptyOutcome(): GitCredentialOutcome {
  return { isRetryable: false, failure: null, answered: new Map() };
}

function remoteTokenRefused(): CoreError {
  return CoreError.unauthorized(
    'The remote rejected the provided token. Check ELEK_IO_REMOTE_ACCESS_TOKEN and ELEK_IO_REMOTE_ACCESS_TOKEN_USER.'
  );
}
