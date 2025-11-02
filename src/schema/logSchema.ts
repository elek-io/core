import { z } from '@hono/zod-openapi';

export const logSourceSchema = z.enum(['core', 'desktop']);
export type LogSource = z.infer<typeof logSourceSchema>;

export const logSchema = z.object({
  source: logSourceSchema,
  message: z.string(),
  /**
   * Additional metadata for the log entry
   *
   * @example { userId: '12345', action: 'login' }
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
