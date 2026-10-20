import { z } from '@hono/zod-openapi';
import { uuidSchema } from './baseSchema.js';
import {
  projectDescriptionSchema,
  projectNameSchema,
} from './projectSchema.js';

/**
 * Whether a Project's repository on elek.io Cloud can be reached yet. Only a
 * `ready` one can be cloned or pushed to
 */
export const cloudProjectRemoteStatusSchema = z.enum([
  'pending',
  'ready',
  'failed',
]);
export type CloudProjectRemoteStatus = z.infer<
  typeof cloudProjectRemoteStatusSchema
>;

/**
 * A Project on elek.io Cloud, under the id Core gave the local Project
 *
 * `remoteUrl` is the git remote to set as the local Project's `origin`. Names
 * may repeat, because a Project is found by its id. `description` is `null`
 * for a Project created without one.
 */
export const cloudProjectSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  teamId: uuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  remoteUrl: z.url({ protocol: /^https?$/ }),
  remoteStatus: cloudProjectRemoteStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CloudProject = z.infer<typeof cloudProjectSchema>;

export const readCloudProjectSchema = z.object({
  organizationId: uuidSchema,
  id: uuidSchema,
});
export type ReadCloudProjectProps = z.infer<typeof readCloudProjectSchema>;

export const createCloudProjectSchema = readCloudProjectSchema.extend({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional(),
});
export type CreateCloudProjectProps = z.infer<typeof createCloudProjectSchema>;

/** Takes a name, a description or both, and refuses neither before sending */
export const updateCloudProjectSchema = readCloudProjectSchema
  .extend({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.optional(),
  })
  .refine(
    (update) => update.name !== undefined || update.description !== undefined,
    'An update takes a name, a description or both'
  );
export type UpdateCloudProjectProps = z.infer<typeof updateCloudProjectSchema>;

export const deleteCloudProjectSchema = readCloudProjectSchema;
export type DeleteCloudProjectProps = z.infer<typeof deleteCloudProjectSchema>;

/** What creating, reading and updating a Project answer */
export const cloudProjectResponseSchema = z.object({
  project: cloudProjectSchema,
});
export type CloudProjectResponse = z.infer<typeof cloudProjectResponseSchema>;

/** What `GET /management/v1/projects` answers */
export const cloudProjectListResponseSchema = z.object({
  projects: z.array(cloudProjectSchema),
});
export type CloudProjectListResponse = z.infer<
  typeof cloudProjectListResponseSchema
>;
