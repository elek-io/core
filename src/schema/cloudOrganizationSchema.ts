import { z } from '@hono/zod-openapi';
import { uuidSchema } from './baseSchema.js';
import { cloudPlanSchema } from './cloudPlanSchema.js';

/**
 * An organization's slug on elek.io Cloud: 2 to 48 lowercase letters, in
 * words joined by single hyphens, with no digit. elek.io Cloud refuses any
 * other on creating, so a host can check a slug under its field
 */
export const cloudOrganizationSlugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(
    /^[a-z]+(-[a-z]+)*$/,
    'A slug is 2 to 48 lowercase letters, with single hyphens between words'
  );
export type CloudOrganizationSlug = z.infer<typeof cloudOrganizationSlugSchema>;

/**
 * What a member may do in an organization. Only an `owner` or an `admin`
 * creates, renames or deletes a Project there, and only an `owner` changes
 * the plan
 */
export const cloudOrganizationRoleSchema = z.enum(['owner', 'admin', 'member']);
export type CloudOrganizationRole = z.infer<typeof cloudOrganizationRoleSchema>;

/**
 * An organization the session's account is a member of
 *
 * `roles` are the account's there, and a member can hold several. The
 * organization has room for another Project while `projects.count` is below
 * `projects.limit`, and `count` includes Projects the account cannot see.
 */
export const cloudOrganizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  roles: z.array(cloudOrganizationRoleSchema),
  plan: cloudPlanSchema,
  projects: z.object({
    count: z.number().int().min(0),
    limit: z.number().int().min(0),
  }),
});
export type CloudOrganization = z.infer<typeof cloudOrganizationSchema>;

/** What creating an organization answers */
export const createdCloudOrganizationSchema = cloudOrganizationSchema.pick({
  id: true,
  name: true,
  slug: true,
});
export type CreatedCloudOrganization = z.infer<
  typeof createdCloudOrganizationSchema
>;

export const createCloudOrganizationSchema = z.object({
  name: z.string().trim().min(1),
  slug: cloudOrganizationSlugSchema,
});
export type CreateCloudOrganizationProps = z.infer<
  typeof createCloudOrganizationSchema
>;

export const isSlugAvailableCloudOrganizationSchema = z.object({
  slug: cloudOrganizationSlugSchema,
});
export type IsSlugAvailableCloudOrganizationProps = z.infer<
  typeof isSlugAvailableCloudOrganizationSchema
>;

/**
 * What `GET /management/v1/organizations` answers. A role Core does not know
 * grants nothing Core knows of, so it is dropped rather than failing the list
 *
 * @see ../../contributing/cloud-projects.md
 */
export const cloudOrganizationListResponseSchema = z.object({
  organizations: z.array(
    cloudOrganizationSchema.extend({
      roles: z.array(z.string()).transform(function (roles) {
        return roles.flatMap(function (role) {
          const known = cloudOrganizationRoleSchema.safeParse(role);
          return known.success ? [known.data] : [];
        });
      }),
    })
  ),
});
export type CloudOrganizationListResponse = z.infer<
  typeof cloudOrganizationListResponseSchema
>;

/** What `POST /api/auth/organization/check-slug` answers for a free slug */
export const cloudSlugCheckResponseSchema = z.object({
  status: z.boolean(),
});
export type CloudSlugCheckResponse = z.infer<
  typeof cloudSlugCheckResponseSchema
>;
