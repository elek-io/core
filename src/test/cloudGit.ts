import type { FakeCloudRoute, Received, Respond } from './cloud.js';
import type { Authorize } from './gitHost.js';

/** One call to a git endpoint the fake Cloud answered */
export interface GitEndpointCall {
  endpoint: 'git-token' | 'git-access';
  projectId: string;
  /** The bearer token the call carried */
  session: string | null;
  status: number;
}

/**
 * elek.io Cloud's two git endpoints and the grants its git hosts honor, as
 * one model. The fake Cloud answers from it, and the fake git host asks it
 * whether a token reaches a repository.
 *
 * As on Cloud, each session holds one token per git host, a new token
 * replaces the older one with its grants, and a token reaches only the
 * Projects granted to it. An ungranted Project answers 404, as a git host
 * answers for a repository it does not show.
 */
export class FakeCloudGit {
  public readonly calls: GitEndpointCall[] = [];
  /** Answered instead of the model, in order, for the next calls */
  public readonly next: Response[] = [];
  /** Decides which requests a git host refuses whatever token they carry */
  public refuses: (host: string, rest: string) => boolean = () => false;
  private readonly projectHosts = new Map<string, string>();
  private readonly sessions = new Map<string, Map<string, HostToken>>();
  private minted = 0;

  /** Places a Project on a git host */
  public place(projectId: string, host: string): void {
    this.projectHosts.set(projectId, host);
  }

  /** The remote Cloud answers for a Project */
  public remoteUrl(projectId: string): string {
    return `http://${this.projectHosts.get(projectId)}/projects/${projectId}.git`;
  }

  /** Removes a Project, as Cloud does for one the caller cannot see any more */
  public remove(projectId: string): void {
    this.projectHosts.delete(projectId);
  }

  /** Takes a grant back from every session, leaving the tokens live */
  public takeBack(projectId: string): void {
    for (const hosts of this.sessions.values()) {
      for (const held of hosts.values()) {
        held.projectIds.delete(projectId);
      }
    }
  }

  /** The calls to one endpoint */
  public callsTo(endpoint: GitEndpointCall['endpoint']): GitEndpointCall[] {
    return this.calls.filter((call) => call.endpoint === endpoint);
  }

  /** The routes to hand `startFakeCloud` */
  public routes(): Partial<Record<FakeCloudRoute, Respond>> {
    return {
      'POST /management/v1/projects/:id/git-token': (received) =>
        this.answer('git-token', received),
      'PUT /management/v1/projects/:id/git-access': (received) =>
        this.answer('git-access', received),
    };
  }

  /** What the fake git host asks for every request */
  public readonly authorize: Authorize = ({
    host,
    repositoryPath,
    rest,
    password,
  }) => {
    if (this.refuses(host, rest)) {
      return 401;
    }
    const projectId = /^projects\/(.+)\.git$/.exec(repositoryPath)?.[1];
    for (const hosts of this.sessions.values()) {
      const held = hosts.get(host);
      if (held !== undefined && held.token === password) {
        return projectId !== undefined && held.projectIds.has(projectId)
          ? 200
          : 404;
      }
    }
    return 401;
  };

  private answer(
    endpoint: GitEndpointCall['endpoint'],
    received: Received
  ): Response {
    const projectId = /\/projects\/([^/]+)\//.exec(received.path)?.[1] ?? '';
    const session =
      received.headers['authorization']?.replace(/^Bearer /, '') ?? null;
    const response = this.respond(endpoint, projectId, session);
    this.calls.push({ endpoint, projectId, session, status: response.status });
    return response;
  }

  private respond(
    endpoint: GitEndpointCall['endpoint'],
    projectId: string,
    session: string | null
  ): Response {
    const canned = this.next.shift();
    if (canned !== undefined) {
      return canned;
    }
    if (session === null) {
      return Response.json({ code: 'unauthorized' }, { status: 401 });
    }
    const host = this.projectHosts.get(projectId);
    if (host === undefined) {
      return Response.json({ code: 'project_not_found' }, { status: 404 });
    }
    const hosts = this.sessions.get(session) ?? new Map<string, HostToken>();
    this.sessions.set(session, hosts);
    const username = `session-${session.slice(0, 6)}`;
    const remoteUrl = this.remoteUrl(projectId);

    if (endpoint === 'git-token') {
      this.minted += 1;
      const token = `git-token-${this.minted}`;
      hosts.set(host, { token, projectIds: new Set([projectId]) });
      return Response.json(
        { gitToken: { username, token, remoteUrl } },
        { status: 201 }
      );
    }
    hosts.get(host)?.projectIds.add(projectId);
    return Response.json({ gitAccess: { username, remoteUrl } });
  }
}

interface HostToken {
  token: string;
  projectIds: Set<string>;
}
