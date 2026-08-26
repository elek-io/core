import slugify from '@sindresorhus/slugify';
import { v4 as generateUuid } from 'uuid';
import { type Uuid } from '../schema/baseSchema.js';

// Framework-agnostic mdast rendering primitive, surfaced on the main
// @elek-io/core entry for both node and browser. Framework bindings such as
// @elek-io/core/astro wrap it. See docs/markdown-content.md.
export * from './mdastRender.js';

/**
 * A v4, randomly generated id.
 *
 * The one reason a consumer calls it: field-definition ids are
 * caller-supplied, so `collections.create()` and `components.create()` expect
 * one `uuid()` per field definition.
 */
export function uuid(): Uuid {
  return generateUuid();
}

/**
 * Returns a string representing date and time in a simplified format based on
 * ISO 8601, always in UTC. Any falsy value counts as absent and yields the
 * current date and time, `0` and the empty string included.
 *
 * @example 'YYYY-MM-DDTHH:mm:ss.sssZ'
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
 */
export function datetime(value?: number | string | Date) {
  if (!value) {
    return new Date().toISOString();
  }
  return new Date(value).toISOString();
}

/**
 * Options controlling how a string is slugified.
 * A subset of @sindresorhus/slugify's options, defaulting to Core's
 * conventional slug format.
 */
export interface SlugOptions {
  separator?: string;
  lowercase?: boolean;
  decamelize?: boolean;
}

/**
 * Returns the slug of given string.
 *
 * Without options the conventional format is used (separator "-",
 * lowercase, decamelize). A `slug` field passes its configured options so
 * its values can be validated as already-canonical via idempotency.
 */
export function slug(string: string, options?: SlugOptions): string {
  return slugify(string, {
    // An empty separator is valid (no separator), so we keep it via ??
    separator: options?.separator ?? '-',
    lowercase: options?.lowercase ?? true,
    decamelize: options?.decamelize ?? true,
  });
}

// --- Error types ---

export type CoreErrorType =
  | 'NotFound'
  | 'BadRequest'
  | 'Unauthorized'
  | 'Conflict'
  | 'PreconditionFailed'
  | 'UpgradeFailed'
  | 'VersionSkew'
  | 'RateLimited'
  | 'Internal';

const statusCodes: Record<CoreErrorType, number> = {
  NotFound: 404,
  BadRequest: 400,
  Unauthorized: 401,
  Conflict: 409,
  PreconditionFailed: 412,
  UpgradeFailed: 422,
  VersionSkew: 422,
  RateLimited: 429,
  Internal: 500,
};

/**
 * The only error a service method throws, so `error instanceof CoreError` is
 * the whole catch.
 *
 * `type` is the nine-way discriminant to branch on. `statusCode` is the HTTP
 * status the local API answers with and is not unique, `UpgradeFailed` and
 * `VersionSkew` are both 422. `cause` keeps whatever was originally thrown.
 *
 * The factories below only pick a `type`, so none of them repeats this.
 *
 * @see ../../docs/error-handling.md
 */
export class CoreError extends Error {
  public readonly type: CoreErrorType;
  public readonly statusCode: number;

  constructor(type: CoreErrorType, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'CoreError';
    this.type = type;
    this.statusCode = statusCodes[type];
  }

  /** The Project, entity or git object the id or slug names is not on disk. */
  static notFound(message: string, cause?: unknown) {
    return new CoreError('NotFound', message, cause);
  }
  /**
   * Input Core cannot accept: a failed boundary parse, whose `ZodError`
   * arrives as `cause`, an unsupported Asset MIME type, a malformed
   * `ELEK_IO_` value.
   */
  static badRequest(message: string, cause?: unknown) {
    return new CoreError('BadRequest', message, cause);
  }
  /**
   * No User is configured for a commit, or the remote rejected the
   * credential. The remote refusing, as opposed to `preconditionFailed`,
   * which is Core refusing.
   */
  static unauthorized(message: string, cause?: unknown) {
    return new CoreError('Unauthorized', message, cause);
  }
  /**
   * The input is valid but the current state refuses it: a slug or unique
   * Value another Entry already holds, uncommitted changes, or deleting
   * content something still references.
   */
  static conflict(message: string, cause?: unknown) {
    return new CoreError('Conflict', message, cause);
  }
  /**
   * The write is refused before it runs, in read-only mode, on a provisioned
   * copy, or with no remote configured. `mutating()` raises it before the
   * input is even parsed.
   */
  static preconditionFailed(message: string, cause?: unknown) {
    return new CoreError('PreconditionFailed', message, cause);
  }
  /**
   * A Project upgrade cannot run: the Project file carries no readable Core
   * version, the Project is newer than the installed Core, or it is already
   * current and `force` was not set.
   */
  static upgradeFailed(message: string, cause?: unknown) {
    return new CoreError('UpgradeFailed', message, cause);
  }
  /**
   * Data on disk was written by a newer Core than the one installed, so
   * migrations refuse to run and the fix is a dependency bump. Shares 422
   * with `UpgradeFailed`, which is why `type` is the discriminant.
   */
  static versionSkew(message: string, cause?: unknown) {
    return new CoreError('VersionSkew', message, cause);
  }
  /**
   * elek.io Cloud refused because this client passed its rate limit. Only
   * reporting reaches the Cloud, so nothing else raises it.
   */
  static rateLimited(message: string, cause?: unknown) {
    return new CoreError('RateLimited', message, cause);
  }
  /**
   * Core's own failure, or one nobody planned for: a failed git command, an
   * unreadable file, a Cloud 5xx. Not a caller's to fix, which is what
   * separates it from `badRequest`.
   */
  static internal(message: string, cause?: unknown) {
    return new CoreError('Internal', message, cause);
  }
  /**
   * Wraps anything caught into `Internal`, taking the message from
   * `e.message` for an `Error` and `String(e)` otherwise, keeping the
   * original as `cause`.
   *
   * It does not pass a `CoreError` through, it flattens one to `Internal` and
   * 500, so guard the way `AbstractService.validated()` does.
   */
  static fromUnknown(e: unknown) {
    return new CoreError(
      'Internal',
      e instanceof Error ? e.message : String(e),
      e
    );
  }
}
