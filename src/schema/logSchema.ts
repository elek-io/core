import { z } from '@hono/zod-openapi';
import { versionSchema, type LogLevel } from './baseSchema.js';

export const logSourceSchema = z.enum(['core', 'desktop']);
export type LogSource = z.infer<typeof logSourceSchema>;

export const logSchema = z.object({
  source: logSourceSchema,
  message: z.string(),
  /**
   * Attributes of the log record, as flat dotted keys
   *
   * Semantic Convention names where one exists, the `elek.` namespace
   * for the rest. See contributing/logging.md.
   *
   * @example { 'elek.project.id': '...', 'code.function.name': 'Asset.create' }
   */
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * What a caller hands `core.logger`.
 *
 * The type is narrower than `logSchema` on purpose, and only for Core's
 * own records: an attribute name Core writes has to be one it declared,
 * which a build says and a running logger must not. `logSchema` stays
 * permissive at runtime, so a name nobody declared writes a wrong key
 * into a log file instead of throwing inside a log call. Every value the
 * type accepts is one the schema accepts, never the other way round.
 *
 * A host logging through Core keeps a free `meta`. Its shape arrives over
 * IPC and Core cannot type it, which is why the sink scrubs it rather
 * than trusting it. See contributing/logging.md.
 */
export type LogProps =
  | { source: 'core'; message: string; meta?: LogAttributes }
  | {
      source: Exclude<LogSource, 'core'>;
      message: string;
      meta?: Record<string, unknown>;
    };

export const logConsoleTransportSchema = logSchema.extend({
  timestamp: z.string(),
  level: z.string(),
});
export type LogConsoleTransportProps = z.infer<
  typeof logConsoleTransportSchema
>;

/**
 * The SeverityNumber of each level Core logs at
 *
 * OpenTelemetry fixes the ranges (TRACE 1-4, DEBUG 5-8, INFO 9-12,
 * WARN 13-16, ERROR 17-20, FATAL 21-24) and OTel-native tooling filters
 * on the number rather than the text. A level Core does not know maps to
 * 0, which is UNSPECIFIED.
 */
export const logSeverityNumbers: Record<LogLevel, number> = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
};

export const logSeverityNumberSchema = z.number().int().min(0).max(24);

/**
 * The OpenTelemetry Resource of a log record: what emitted it,
 * rather than what happened
 */
export const logResourceSchema = z.object({
  'service.name': logSourceSchema,
  /**
   * Only set for records Core emitted. Core does not know the version of
   * a host that logs through it
   */
  'service.version': versionSchema.optional(),
  'os.type': z.string(),
  'host.arch': z.string(),
});
export type LogResource = z.infer<typeof logResourceSchema>;

/**
 * Every attribute name Core writes.
 *
 * The record shape is enforced by `logRecordSchema` and the Resource by
 * `logResourceSchema`, but an attribute key would otherwise be a free
 * string, so a typo or a camelCase relapse would write itself into a log
 * file and be found by nobody: the line still parses and the query for it
 * just comes back empty.
 *
 * These names are the ones `LogProps` accepts for a record Core wrote, so
 * using one that is not here fails the build rather than the reader, and
 * `logSweep.test.ts` checks what actually reached a log file for the paths
 * a type cannot see.
 *
 * A Semantic Convention name is used wherever one exists, and the
 * `elek.` namespace for the rest, which is what Semantic Conventions
 * themselves prescribe for custom attributes. See contributing/logging.md.
 */
export const logAttributeNames = [
  // Semantic Conventions, stable as of semconv 1.43.0
  'code.function.name',
  'error.type',
  'exception.message',
  'exception.stacktrace',
  'exception.type',
  'http.request.method',
  'http.response.status_code',
  'url.full',

  // Semantic Conventions, still incubating as of semconv 1.43.0
  'file.directory',
  'file.name',
  'file.path',

  // elek.io's own, where no convention exists
  'elek.cache.cleared_count',
  'elek.collection.count',
  'elek.collection.id',
  'elek.duration_ms',
  'elek.entry.value.count',
  'elek.entry.value.slugs',
  'elek.error.status_code',
  'elek.git.command',
  'elek.git.ref',
  'elek.git.tag.type',
  'elek.method',
  'elek.object.id',
  'elek.object.type',
  'elek.options.data_dir',
  'elek.options.file.cache',
  'elek.options.is_read_only',
  'elek.options.log.has_process_error_handlers',
  'elek.options.log.level',
  'elek.project.count',
  'elek.project.id',
  'elek.release.bump',
  'elek.release.version',
  'elek.request.id',
  'elek.upgrade.from_version',
  'elek.upgrade.to_version',
] as const;
export type LogAttributeName = (typeof logAttributeNames)[number];

/** The attributes of a record Core wrote itself */
export type LogAttributes = Partial<Record<LogAttributeName, unknown>>;

/**
 * One line of a log file, following the OpenTelemetry Logs Data Model
 *
 * `level` and `message` keep their winston names, because that is what
 * an OTel winston bridge maps to SeverityText and Body. Everything Core
 * owns carries the OTel name. See contributing/logging.md.
 */
export const logRecordSchema = z.object({
  timestamp: z.iso.datetime(),
  level: z.string(),
  severityNumber: logSeverityNumberSchema,
  message: z.string(),
  resource: logResourceSchema,
  attributes: z.record(z.string(), z.unknown()).optional(),
  /**
   * Reserved. Nothing fills these until an OpenTelemetry SDK is part of
   * Core, so they stay unset rather than being written empty
   */
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  traceFlags: z.number().int().optional(),
});
export type LogRecord = z.infer<typeof logRecordSchema>;
