import { z } from 'zod';
import { assetExportSchema } from './assetSchema.js';
import {
  objectTypeSchema,
  supportedLanguageSchema,
  uuidSchema,
  versionSchema,
} from './baseSchema.js';
import { collectionExportSchema } from './collectionSchema.js';
import { baseFileSchema } from './fileSchema.js';
import { gitSwitchOptionsSchema } from './gitSchema.js';

export const projectStatusSchema = z.enum(['foo', 'bar', 'todo']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectSettingsSchema = z.object({
  language: z.object({
    default: supportedLanguageSchema,
    supported: z.array(supportedLanguageSchema),
  }),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const projectFolderSchema = z.enum([
  'assets',
  'collections',
  'shared-values',
  'lfs',
  // 'logs',
  // 'public',
  // 'theme',
]);
export type ProjectFolder = z.infer<typeof projectFolderSchema>;

export const projectFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.Enum.project).readonly(),
  coreVersion: versionSchema,
  name: z.string().trim().min(1, 'shared.projectNameRequired'),
  description: z.string().trim().min(1, 'shared.projectDescriptionRequired'),
  version: versionSchema,
  status: projectStatusSchema,
  settings: projectSettingsSchema,
});
export type ProjectFile = z.infer<typeof projectFileSchema>;

export const projectSchema = projectFileSchema.extend({});
export type Project = z.infer<typeof projectSchema>;

export const projectExportSchema = projectSchema.extend({
  assets: z.array(assetExportSchema),
  collections: z.array(collectionExportSchema),
});
export type ProjectExport = z.infer<typeof projectExportSchema>;

export const createProjectSchema = projectSchema
  .pick({
    name: true,
    description: true,
    settings: true,
  })
  .partial({
    description: true,
    settings: true,
  });
export type CreateProjectProps = z.infer<typeof createProjectSchema>;

export const readProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type ReadProjectProps = z.infer<typeof readProjectSchema>;

export const updateProjectSchema = projectSchema
  .pick({
    id: true,
    name: true,
    description: true,
    settings: true,
  })
  .partial({
    name: true,
    description: true,
    settings: true,
  });
export type UpdateProjectProps = z.infer<typeof updateProjectSchema>;

export const upgradeProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type UpgradeProjectProps = z.infer<typeof upgradeProjectSchema>;

export const deleteProjectSchema = readProjectSchema.extend({});
export type DeleteProjectProps = z.infer<typeof deleteProjectSchema>;

export const projectUpgradeSchema = z.object({
  /**
   * The Core version the Project will be upgraded to
   */
  to: versionSchema.readonly(),
  /**
   * Function that will be executed in the process of upgrading a Project
   */
  run: z.function().args(projectFileSchema).returns(z.promise(z.void())),
});
export type ProjectUpgrade = z.infer<typeof projectUpgradeSchema>;

export const cloneProjectSchema = z.object({
  url: z.string(),
});
export type CloneProjectProps = z.infer<typeof cloneProjectSchema>;

export const listBranchesProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type ListBranchesProjectProps = z.infer<
  typeof listBranchesProjectSchema
>;

export const currentBranchProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type CurrentBranchProjectProps = z.infer<
  typeof currentBranchProjectSchema
>;

export const switchBranchProjectSchema = z.object({
  id: uuidSchema.readonly(),
  branch: z.string(),
  options: gitSwitchOptionsSchema.optional(),
});
export type SwitchBranchProjectProps = z.infer<
  typeof switchBranchProjectSchema
>;

export const getRemoteOriginUrlProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type GetRemoteOriginUrlProjectProps = z.infer<
  typeof getRemoteOriginUrlProjectSchema
>;

export const setRemoteOriginUrlProjectSchema = z.object({
  id: uuidSchema.readonly(),
  url: z.string(),
});
export type SetRemoteOriginUrlProjectProps = z.infer<
  typeof setRemoteOriginUrlProjectSchema
>;

export const getChangesProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type GetChangesProjectProps = z.infer<typeof getChangesProjectSchema>;

export const synchronizeProjectSchema = z.object({
  id: uuidSchema.readonly(),
});
export type SynchronizeProjectProps = z.infer<typeof synchronizeProjectSchema>;
