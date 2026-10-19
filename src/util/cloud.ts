import type { ZodError, ZodType } from 'zod';
import { cloudErrorResponseSchema } from '../schema/cloudSchema.js';
import type { LogService } from '../service/LogService.js';
import { CoreError, type CoreErrorType } from './shared.js';

/**
 * A refusal one call reads differently from the shared mapping, such as the
 * 403 signing in answers for an address that is not verified yet.
 */
export interface CloudRefusal {
  status: number;
  /**
   * The `code` the answer has to carry for this to match, or absent to match
   * the status alone. Read to pick the type, never written into the message
   */
  code?: string;
  type: CoreErrorType;
  /** Says what was refused. The status is appended */
  message: string;
}

/** One call to elek.io Cloud, as `CloudClient.request()` takes it */
export interface CloudRequest {
  method: 'GET' | 'POST' | 'PUT';
  /** Appended to the configured Cloud URL, which never ends in a slash */
  path: string;
  /** The serialized JSON body, sent with its content type */
  body?: string;
  /** What is sent, as a noun the messages name, like `the report` */
  subject: string;
  /** Checked in order before the shared mapping */
  refusals?: readonly CloudRefusal[];
  /**
   * Sent without the token Core holds, for a call that starts a session
   * rather than uses one. Its 401 then says nothing about that session
   */
  isAnonymous?: boolean;
}

/**
 * Told the token Core keeps, or null once it drops one. A host persisting
 * the token updates its copy here, and may do so asynchronously
 */
export type CloudTokenListener = (token: string | null) => void | Promise<void>;

/**
 * The one seam every elek.io Cloud call goes through: the base URL, the
 * bearer token, the timeout and the mapping of a refusal onto a `CoreError`.
 * It holds the token in memory and nowhere else.
 *
 * It never retries, and it never reads an answer's body into a message,
 * because a body can echo what was sent and a message reaches a log file.
 *
 * @see ../../contributing/cloud.md
 */
export class CloudClient {
  /** How long a call waits for an answer. Nothing retries after it */
  public static readonly timeoutMs = 15_000;

  /** The longest a 429's Retry-After is taken at its word */
  public static readonly maxRetryAfterMs = 3_600_000;

  private readonly url: string;
  private readonly userAgent: string;
  private readonly logService: LogService;
  private readonly listeners = new Set<CloudTokenListener>();
  private token: string | null;
  private generation = 0;
  private retryAfter: number | null = null;

  public constructor(
    url: string,
    coreVersion: string,
    token: string | null,
    logService: LogService
  ) {
    this.url = url;
    this.userAgent = `elek.io-core/${coreVersion}`;
    this.token = token;
    this.logService = logService;
  }

  /** Whether Core holds a token, which every call but an anonymous one carries */
  public get hasToken(): boolean {
    return this.token !== null;
  }

  /**
   * Changes whenever the token does, so whatever was learned under one
   * session can tell it is not the session Core holds any more
   */
  public get tokenGeneration(): number {
    return this.generation;
  }

  /**
   * When the last 429 asked Core to call again, in epoch milliseconds, or
   * null when no 429 carried a Retry-After Core could read. Capped at an
   * hour from the answer, so a long running host cannot be locked out
   */
  public get notBefore(): number | null {
    return this.retryAfter;
  }

  /** Keeps a token for every later call, replacing the one held before */
  public keep(token: string): void {
    this.change(token);
  }

  /** Drops the token, so later calls carry none */
  public forget(): void {
    this.change(null);
  }

  /**
   * Tells `listener` every token Core keeps and drops from here on, never
   * the one it started with. Returns the function that removes it again.
   */
  public onTokenChange(listener: CloudTokenListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Sends one request and returns the answer when Cloud accepted it.
   *
   * Throws `PreconditionFailed` when Cloud is unreachable or silent for 15
   * seconds, and the type a refusal maps to otherwise. A 401 forgets the
   * token it was sent with first, because it means the session is gone.
   */
  public async request(request: CloudRequest): Promise<Response> {
    const url = `${this.url}${request.path}`;
    const sentToken = request.isAnonymous === true ? null : this.token;
    const headers: Record<string, string> = { 'User-Agent': this.userAgent };
    if (request.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (sentToken !== null) {
      headers['Authorization'] = `Bearer ${sentToken}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: request.method,
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: AbortSignal.timeout(CloudClient.timeoutMs),
      });
    } catch (error) {
      throw CoreError.preconditionFailed(
        `Could not reach elek.io Cloud at "${url}"`,
        error
      );
    }

    if (response.ok) {
      return response;
    }
    if (response.status === 429) {
      this.retryAfter = retryAfterOf(response);
    }
    // Compared rather than only checked, so a token kept while this call
    // was in flight is not the one forgotten
    if (response.status === 401 && sentToken !== null) {
      if (this.token === sentToken) {
        this.change(null);
        this.logService.info({
          source: 'core',
          message:
            'Forgot the elek.io Cloud token, because elek.io Cloud answered 401',
          meta: { 'http.response.status_code': response.status },
        });
      }
    }
    throw await refusalOf(response, request, url);
  }

  /**
   * Reads an accepted answer through `schema`, or throws `Internal` rather
   * than hand a caller something unvalidated.
   */
  public async parse<T>(
    response: Response,
    schema: ZodType<T>,
    subject: string
  ): Promise<T> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw CoreError.internal(
        `elek.io Cloud accepted ${subject} but did not answer with JSON`,
        error
      );
    }

    const parsed = schema.safeParse(payload);
    if (parsed.success === false) {
      throw CoreError.internal(
        `elek.io Cloud accepted ${subject} but answered with something else at ${issuesOf(parsed.error)}`,
        parsed.error
      );
    }
    return parsed.data;
  }

  /**
   * Sets the token and tells every listener, when it changed. A listener is
   * the host's, so one that fails is logged and the others still run.
   */
  private change(token: string | null): void {
    if (this.token === token) {
      return;
    }
    this.token = token;
    this.generation += 1;
    for (const listener of this.listeners) {
      try {
        void Promise.resolve(listener(token)).catch(() => {
          this.listenerFailed();
        });
      } catch {
        this.listenerFailed();
      }
    }
  }

  /** What a failed listener leaves in the log. Its error is the host's text */
  private listenerFailed(): void {
    this.logService.warn({
      source: 'core',
      message: 'A listener of the elek.io Cloud token failed',
    });
  }
}

/**
 * Where an answer went wrong, as the path and code of each issue. Never the
 * issue messages, so what Cloud answered cannot reach a message however the
 * schema reports it
 */
function issuesOf(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'} (${issue.code})`)
    .join(', ');
}

/**
 * The error a refusal is handed back as. A refusal the call names wins over
 * the shared mapping, and the body is read only when one could match.
 */
async function refusalOf(
  response: Response,
  request: CloudRequest,
  url: string
): Promise<CoreError> {
  const candidates = (request.refusals ?? []).filter(function (refusal) {
    return refusal.status === response.status;
  });
  if (candidates.length > 0) {
    const code = await codeOf(response);
    const match = candidates.find(function (refusal) {
      return refusal.code === undefined || refusal.code === code;
    });
    if (match !== undefined) {
      return new CoreError(match.type, `${match.message} (${response.status})`);
    }
  }

  const retryAfter = retryAfterOf(response);
  const detail =
    response.status === 429 && retryAfter !== null
      ? `elek.io Cloud answered 429 to ${request.subject} at "${url}", call again in ${Math.ceil((retryAfter - Date.now()) / 1000)} seconds`
      : `elek.io Cloud answered ${response.status} to ${request.subject} at "${url}"`;
  switch (response.status) {
    // The body was rejected, which is something a caller can act on
    case 400:
    case 413:
      return CoreError.badRequest(detail);
    // No credential, one that is gone, or one that does not carry this
    case 401:
    case 403:
      return CoreError.unauthorized(detail);
    case 429:
      return CoreError.rateLimited(detail);
    // 5xx, and anything else nobody planned for. Not a caller's to fix
    default:
      return CoreError.internal(detail);
  }
}

/**
 * When an answer's Retry-After asks to call again, in epoch milliseconds,
 * from seconds or an HTTP date, capped at `CloudClient.maxRetryAfterMs`.
 * Null when there is none or it cannot be read.
 */
function retryAfterOf(response: Response): number | null {
  const value = response.headers.get('retry-after')?.trim();
  if (value === undefined || value === '') {
    return null;
  }
  const now = Date.now();
  const at = /^\d+$/.test(value)
    ? now + Number(value) * 1000
    : Date.parse(value);
  if (Number.isNaN(at)) {
    return null;
  }
  return Math.min(Math.max(at, now), now + CloudClient.maxRetryAfterMs);
}

/** The `code` of a refusal, or null when the answer carries none */
async function codeOf(response: Response): Promise<string | null> {
  try {
    const parsed = cloudErrorResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.code : null;
  } catch {
    return null;
  }
}
