import { z } from '@hono/zod-openapi';
import { uuidSchema, versionSchema } from './baseSchema.js';
import { logTailSchema } from './logSchema.js';
import { cloudUserSchema, localUserSchema } from './userSchema.js';

export const reportTypeSchema = z.enum(['bug', 'feedback']);
export type ReportType = z.infer<typeof reportTypeSchema>;

/*
 * Every string below is capped, because elek.io Cloud takes a report from
 * anybody and enforces the same caps. A length counts UTF-16 code units,
 * as `String.length` and a `maxlength` attribute do, so an emoji is two.
 * No field takes a control character, since Postgres refuses a NUL.
 */

/** A version a runtime reported, or the `unknown` Desktop sends instead */
const runtimeVersionSchema = z.string().max(64).regex(/^[0-9A-Za-z.+-]+$/);

export const createReportBaseSchema = z.object({
  type: reportTypeSchema,
  message: z
    .string()
    .min(10)
    .max(5000)
    .regex(
      /^(?:[^\p{Cc}]|[\t\n\r])*$/u,
      'Message must not contain control characters other than tabs and line breaks'
    ),
  /**
   * Who sent the report and who to answer
   *
   * Prefilled from `user.get()` and left editable, so somebody can be
   * reached at an address other than the one their commits are signed
   * with. Null when there is no User yet, which is when the button matters
   * most: elek.io Desktop keeps it reachable on a broken first run.
   *
   * Self-declared, and none of it is proof of anything. Whether a sender
   * is who they claim is what a session says once Cloud sign-in exists,
   * never what a body says.
   */
  user: z
    .discriminatedUnion('userType', [localUserSchema, cloudUserSchema])
    .nullable(),
  desktop: z.object({
    version: versionSchema.max(64),
    /**
     * Not semantic versions: a Chrome version has four segments, and
     * Desktop sends `unknown` for one Electron did not report
     */
    runtime: z.object({
      electron: runtimeVersionSchema,
      chrome: runtimeVersionSchema,
      node: runtimeVersionSchema,
    }),
  }),
});
export type CreateReportBase = z.infer<typeof createReportBaseSchema>;

export const createFeedbackReportSchema = createReportBaseSchema.extend({
  type: z.literal(reportTypeSchema.enum.feedback),
});
export type CreateFeedbackReportProps = z.infer<
  typeof createFeedbackReportSchema
>;

export const createBugReportSchema = createReportBaseSchema.extend({
  type: z.literal(reportTypeSchema.enum.bug),
  /** Consent to attaching a log tail */
  hasLogConsent: z.boolean(),
});
export type CreateBugReportProps = z.infer<typeof createBugReportSchema>;

export const createReportSchema = z.discriminatedUnion('type', [
  createFeedbackReportSchema,
  createBugReportSchema,
]);
export type CreateReportProps = z.infer<typeof createReportSchema>;

/**
 * The body Core sends to elek.io Cloud
 *
 * The same base a client validated against, so the caps a form enforces
 * and the caps Cloud is promised cannot drift apart, plus the two things
 * only Core knows.
 */
export const reportRequestSchema = createReportBaseSchema.extend({
  core: z.object({
    version: versionSchema.max(64),
    /** Node's spelling, such as `linux` or `x64` */
    platform: z.string().max(32).regex(/^[a-z0-9_]+$/),
    arch: z.string().max(32).regex(/^[a-z0-9_]+$/),
    /** Printable ASCII. Linux caps its own release string at 64 */
    osRelease: z.string().max(64).regex(/^[\x20-\x7E]+$/),
  }),
  /**
   * Only attach log tail when type is bug and hasLogConsent is true. The
   * data is capped at the ceiling the whole body is held to
   */
  logs: logTailSchema
    .extend({ data: z.base64().max(2 * 1024 * 1024) })
    .nullable(),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

/**
 * What elek.io Cloud answers a created report with
 *
 * A 201 whose body does not parse as this is an `Internal` error rather
 * than something handed back to a caller unvalidated.
 */
export const reportResponseSchema = z.object({
  id: uuidSchema,
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;
