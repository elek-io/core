import slugify from '@sindresorhus/slugify';
import { v4 as generateUuid } from 'uuid';
import { ResultAsync, Result, ok, err, okAsync, errAsync } from 'neverthrow';
import type { ZodType } from 'zod';
import { type Uuid } from '../schema/baseSchema.js';

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
 * Returns the slug of given string
 */
export function slug(string: string): string {
  return slugify(string, {
    separator: '-',
    lowercase: true,
    decamelize: true,
  });
}

// --- Error types ---

type CoreErrorBase = { message: string; cause?: unknown };

export type CoreError =
  | (CoreErrorBase & { type: 'NotFound'; statusCode: 404 })
  | (CoreErrorBase & { type: 'BadRequest'; statusCode: 400 })
  | (CoreErrorBase & { type: 'Unauthorized'; statusCode: 401 })
  | (CoreErrorBase & { type: 'Conflict'; statusCode: 409 })
  | (CoreErrorBase & { type: 'PreconditionFailed'; statusCode: 412 })
  | (CoreErrorBase & { type: 'UpgradeFailed'; statusCode: 422 })
  | (CoreErrorBase & { type: 'Internal'; statusCode: 500 });

export const CoreErrors = {
  notFound: (message: string, cause?: unknown): CoreError => ({
    type: 'NotFound',
    message,
    statusCode: 404,
    cause,
  }),
  badRequest: (message: string, cause?: unknown): CoreError => ({
    type: 'BadRequest',
    message,
    statusCode: 400,
    cause,
  }),
  unauthorized: (message: string, cause?: unknown): CoreError => ({
    type: 'Unauthorized',
    message,
    statusCode: 401,
    cause,
  }),
  conflict: (message: string, cause?: unknown): CoreError => ({
    type: 'Conflict',
    message,
    statusCode: 409,
    cause,
  }),
  preconditionFailed: (message: string, cause?: unknown): CoreError => ({
    type: 'PreconditionFailed',
    message,
    statusCode: 412,
    cause,
  }),
  upgradeFailed: (message: string, cause?: unknown): CoreError => ({
    type: 'UpgradeFailed',
    message,
    statusCode: 422,
    cause,
  }),
  internal: (message: string, cause?: unknown): CoreError => ({
    type: 'Internal',
    message,
    statusCode: 500,
    cause,
  }),
  fromUnknown: (e: unknown): CoreError => ({
    type: 'Internal',
    message: e instanceof Error ? e.message : String(e),
    statusCode: 500,
    cause: e,
  }),
};

// --- Result types ---

export type CoreResult<T> = ResultAsync<T, CoreError>;
export type CoreResultSync<T> = Result<T, CoreError>;

/**
 * Wraps Zod safeParse into a sync Result
 */
export function parseSchema<T>(
  schema: ZodType<T>,
  data: unknown
): CoreResultSync<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return ok(result.data);
  }
  return err(CoreErrors.badRequest(result.error.message, result.error));
}

export { ResultAsync, Result, ok, err, okAsync, errAsync };
