import slugify from '@sindresorhus/slugify';
import { v4 as generateUuid } from 'uuid';
import { type Uuid } from '../schema/baseSchema.js';

// Framework-agnostic mdast rendering primitive, surfaced on the main
// @elek-io/core entry for both node and browser. Framework bindings such as
// @elek-io/core/astro wrap it. See docs/markdown-content.md.
export * from './mdastRender.js';

/**
 * Returns a new UUID
 */
export function uuid(): Uuid {
  return generateUuid();
}

/**
 * Returns a string representing date and time
 * in a simplified format based on ISO 8601.
 * The timezone is always UTC.
 *
 * - If value is not given, the current date and time is used
 * - If value is given, it's converted to above representation and UTC timezone
 *
 * @example 'YYYY-MM-DDTHH:mm:ss.sssZ'
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
 * @see https://en.wikipedia.org/wiki/ISO_8601
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
  | 'Internal';

const statusCodes: Record<CoreErrorType, number> = {
  NotFound: 404,
  BadRequest: 400,
  Unauthorized: 401,
  Conflict: 409,
  PreconditionFailed: 412,
  UpgradeFailed: 422,
  VersionSkew: 422,
  Internal: 500,
};

export class CoreError extends Error {
  public readonly type: CoreErrorType;
  public readonly statusCode: number;

  constructor(type: CoreErrorType, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'CoreError';
    this.type = type;
    this.statusCode = statusCodes[type];
  }

  static notFound(message: string, cause?: unknown) {
    return new CoreError('NotFound', message, cause);
  }
  static badRequest(message: string, cause?: unknown) {
    return new CoreError('BadRequest', message, cause);
  }
  static unauthorized(message: string, cause?: unknown) {
    return new CoreError('Unauthorized', message, cause);
  }
  static conflict(message: string, cause?: unknown) {
    return new CoreError('Conflict', message, cause);
  }
  static preconditionFailed(message: string, cause?: unknown) {
    return new CoreError('PreconditionFailed', message, cause);
  }
  static upgradeFailed(message: string, cause?: unknown) {
    return new CoreError('UpgradeFailed', message, cause);
  }
  static versionSkew(message: string, cause?: unknown) {
    return new CoreError('VersionSkew', message, cause);
  }
  static internal(message: string, cause?: unknown) {
    return new CoreError('Internal', message, cause);
  }
  static fromUnknown(e: unknown) {
    return new CoreError(
      'Internal',
      e instanceof Error ? e.message : String(e),
      e
    );
  }
}
