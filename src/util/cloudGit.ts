import {
  cloudGitAccessResponseSchema,
  cloudGitTokenResponseSchema,
} from '../schema/cloudSchema.js';
import type { LogService } from '../service/LogService.js';
import type { CloudClient, CloudRefusal } from './cloud.js';
import { CoreError } from './shared.js';

/** A username and a token, as git is handed them for one git host */
export interface GitCredential {
  username: string;
  password: string;
}

/**
 * The tokens this process holds for elek.io Cloud's git hosts, one per
 * host, and the Projects each one was granted, all asked of Cloud through
 * `CloudClient`. Everything is forgotten when the session changes, because
 * the old session's tokens and grants went with it.
 *
 * It never has two requests to one host in flight, since a second
 * `git-token` would revoke the first one's token.
 *
 * @see ../../contributing/git-credentials.md
 */
export class CloudGitAccess {
  private readonly cloudClient: CloudClient;
  private readonly logService: LogService;
  private readonly hosts = new Map<string, HeldGitToken>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private generation: number;
  private backoff: { until: number; error: CoreError } | null = null;

  public constructor(cloudClient: CloudClient, logService: LogService) {
    this.cloudClient = cloudClient;
    this.logService = logService;
    this.generation = cloudClient.tokenGeneration;
  }

  /**
   * The credential for a Project on a git host, asking Cloud only the
   * first time this session meets the Project: `git-token` while it holds
   * no token for the host, `git-access` once it does.
   *
   * Throws the Cloud call's `CoreError`, and `PreconditionFailed` when
   * Cloud places the Project on another host than the one git asked.
   */
  public credentialFor(
    host: string,
    projectId: string
  ): Promise<GitCredential> {
    const previous = this.queues.get(host) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.resolve(host, projectId));
    this.queues.set(host, next);
    // The queue only orders the calls, so it settles either way and is
    // dropped once nothing waits behind it
    void next
      .catch(() => undefined)
      .then(() => {
        if (this.queues.get(host) === next) {
          this.queues.delete(host);
        }
      });
    return next;
  }

  /**
   * Drops the host's token when it is the one git reports as refused, so
   * a newer token survives an older command's failure. Returns whether it
   * dropped one.
   */
  public drop(host: string, password: string | null): boolean {
    this.followSession();
    const held = this.hosts.get(host);
    if (held === undefined || held.token !== password) {
      return false;
    }
    this.hosts.delete(host);
    return true;
  }

  /** Forgets that a Project was granted, so the next command asks again */
  public forget(host: string, projectId: string): void {
    this.followSession();
    this.hosts.get(host)?.projectIds.delete(projectId);
  }

  private async resolve(
    host: string,
    projectId: string
  ): Promise<GitCredential> {
    this.followSession();
    const held = this.hosts.get(host);
    if (held?.projectIds.has(projectId) === true) {
      return { username: held.username, password: held.token };
    }
    if (this.backoff !== null && Date.now() < this.backoff.until) {
      throw this.backoff.error;
    }
    const generation = this.generation;

    if (held === undefined) {
      const minted = await this.gitToken(projectId);
      this.assertSession(generation);
      return this.hold(host, projectId, minted);
    }

    const access = await this.gitAccess(projectId);
    this.assertSession(generation);
    const accessHost = hostOf(access.remoteUrl);
    if (accessHost === host) {
      held.username = access.username;
      held.projectIds.add(projectId);
      return { username: held.username, password: held.token };
    }

    // Cloud placed the Project on another host. A token held there reaches
    // it now, and without one it needs a token of its own
    const other = this.hosts.get(accessHost);
    if (other === undefined) {
      const minted = await this.gitToken(projectId);
      this.assertSession(generation);
      return this.hold(host, projectId, minted);
    }
    other.username = access.username;
    other.projectIds.add(projectId);
    throw elsewhere(projectId, host, access.remoteUrl);
  }

  /**
   * Keeps a token Cloud minted for the host its remote names, replacing
   * the one held there with its grants, as Cloud does
   */
  private hold(host: string, projectId: string, minted: Minted): GitCredential {
    const mintedHost = hostOf(minted.remoteUrl);
    this.hosts.set(mintedHost, {
      username: minted.username,
      token: minted.token,
      projectIds: new Set([projectId]),
    });
    if (mintedHost !== host) {
      throw elsewhere(projectId, host, minted.remoteUrl);
    }
    return { username: minted.username, password: minted.token };
  }

  private async gitToken(projectId: string): Promise<Minted> {
    const subject = 'the git token request';
    const response = await this.call(projectId, 'POST', 'git-token', subject);
    const answer = await this.cloudClient.parse(
      response,
      cloudGitTokenResponseSchema,
      subject
    );
    this.logService.info({
      source: 'core',
      message: 'Got a git token from elek.io Cloud',
      meta: {
        'elek.project.id': projectId,
        'server.address': hostOf(answer.gitToken.remoteUrl),
      },
    });
    return answer.gitToken;
  }

  private async gitAccess(
    projectId: string
  ): Promise<{ username: string; remoteUrl: string }> {
    const subject = 'the git access request';
    const response = await this.call(projectId, 'PUT', 'git-access', subject);
    const answer = await this.cloudClient.parse(
      response,
      cloudGitAccessResponseSchema,
      subject
    );
    this.logService.info({
      source: 'core',
      message: 'Got git access to a Project from elek.io Cloud',
      meta: {
        'elek.project.id': projectId,
        'server.address': hostOf(answer.gitAccess.remoteUrl),
      },
    });
    return answer.gitAccess;
  }

  /**
   * Sends one of the two calls, asking once more when access changed while
   * it was granted, and remembering a 429's Retry-After so nothing is asked
   * before it passes
   */
  private async call(
    projectId: string,
    method: 'POST' | 'PUT',
    endpoint: 'git-token' | 'git-access',
    subject: string
  ): Promise<Response> {
    const send = () =>
      this.cloudClient.request({
        method,
        path: `/management/v1/projects/${projectId}/${endpoint}`,
        body: '{}',
        subject,
        refusals: refusalsFor(projectId),
      });
    try {
      try {
        return await send();
      } catch (error) {
        // Only the refusal below maps to Conflict, every other 409 is Internal
        if (error instanceof CoreError && error.type === 'Conflict') {
          return await send();
        }
        throw error;
      }
    } catch (error) {
      const until = this.cloudClient.notBefore;
      if (
        error instanceof CoreError &&
        error.type === 'RateLimited' &&
        until !== null
      ) {
        this.backoff = { until, error };
      }
      throw error;
    }
  }

  /** Forgets everything learned under a session Core no longer holds */
  private followSession(): void {
    if (this.generation === this.cloudClient.tokenGeneration) {
      return;
    }
    this.generation = this.cloudClient.tokenGeneration;
    this.hosts.clear();
    this.backoff = null;
  }

  /**
   * Throws when the session changed while Cloud was asked, so an answer
   * for one session never lands in another's state
   */
  private assertSession(generation: number): void {
    if (generation !== this.cloudClient.tokenGeneration) {
      throw CoreError.unauthorized(
        'The elek.io Cloud session changed while Core asked for git access, ask again'
      );
    }
  }
}

/** The token held for one git host, and the Projects it was granted */
interface HeldGitToken {
  username: string;
  token: string;
  projectIds: Set<string>;
}

/** A token Cloud minted, and the remote of the Project it was minted for */
interface Minted {
  username: string;
  token: string;
  remoteUrl: string;
}

/** The host and port a remote names, as git's credential request names it */
function hostOf(remoteUrl: string): string {
  return new URL(remoteUrl).host.toLowerCase();
}

/** The refusals both calls read differently from the shared mapping */
function refusalsFor(projectId: string): CloudRefusal[] {
  return [
    {
      status: 404,
      code: 'project_not_found',
      type: 'NotFound',
      message: `elek.io Cloud has no Project "${projectId}" this session can see`,
    },
    {
      status: 409,
      code: 'git_access_changed',
      type: 'Conflict',
      message: `Access to Project "${projectId}" changed while elek.io Cloud granted it`,
    },
    {
      status: 502,
      type: 'PreconditionFailed',
      message: 'elek.io Cloud could not reach the git host',
    },
    {
      status: 504,
      type: 'PreconditionFailed',
      message: 'elek.io Cloud could not reach the git host',
    },
  ];
}

/** The refusal for a remote pointing at another host than Cloud's answer */
function elsewhere(
  projectId: string,
  host: string,
  remoteUrl: string
): CoreError {
  return CoreError.preconditionFailed(
    `Project "${projectId}" is not on the git host "${host}" its remote names. Set its remote to "${remoteUrl}".`
  );
}
