import { z } from '@hono/zod-openapi';
import { uuidSchema, versionSchema } from './baseSchema.js';
import { logTailSchema } from './logSchema.js';
import { cloudUserSchema, localUserSchema } from './userSchema.js';

export const reportTypeSchema = z.enum(['bug', 'feedback']);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const createReportBaseSchema = z.object({
  type: reportTypeSchema,
  message: z.string().min(10).max(5000),
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
    version: versionSchema,
    /**
     * Plain strings rather than versions: a Chrome version has four
     * segments, and Desktop sends `unknown` for one Electron did not
     * report
     */
    runtime: z.object({
      electron: z.string(),
      chrome: z.string(),
      node: z.string(),
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
    version: versionSchema,
    platform: z.string(),
    arch: z.string(),
    osRelease: z.string(),
  }),
  /** Only attach log tail when type is bug and hasLogConsent is true */
  logs: logTailSchema.nullable(),
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
