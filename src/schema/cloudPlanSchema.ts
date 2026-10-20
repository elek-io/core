import { z } from '@hono/zod-openapi';
import { uuidSchema } from './baseSchema.js';

/** An organization's plan on elek.io Cloud. `hobby` is the free one */
export const cloudPlanSchema = z.enum(['hobby', 'pro', 'business']);
export type CloudPlan = z.infer<typeof cloudPlanSchema>;

/** A plan an organization pays for, which is every plan but `hobby` */
export const cloudPaidPlanSchema = cloudPlanSchema.exclude(['hobby']);
export type CloudPaidPlan = z.infer<typeof cloudPaidPlanSchema>;

/**
 * Where the browser goes after checkout: an absolute URL, or a path that
 * elek.io Cloud resolves against its own origin. elek.io Cloud refuses an
 * origin it does not allow
 */
const cloudReturnUrlSchema = z.union([
  z.url().max(2048),
  z
    .string()
    .max(2048)
    .regex(/^\/(?!\/)/, 'Must be an absolute URL or a path starting with /'),
]);

export const upgradeCloudPlanSchema = z.object({
  organizationId: uuidSchema,
  plan: cloudPaidPlanSchema,
  successUrl: cloudReturnUrlSchema,
  cancelUrl: cloudReturnUrlSchema,
});
export type UpgradeCloudPlanProps = z.infer<typeof upgradeCloudPlanSchema>;

/**
 * What upgrading answers: the page to open in the browser, where the person
 * pays. Only http and https, so a host never opens anything else it is handed
 *
 * @see ../../docs/cloud-projects.md
 */
export const cloudPlanCheckoutSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
});
export type CloudPlanCheckout = z.infer<typeof cloudPlanCheckoutSchema>;
