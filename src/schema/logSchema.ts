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
export type LogProps = z.infer<typeof logSchema>;

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
