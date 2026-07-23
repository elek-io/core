import { z } from '@hono/zod-openapi';
import { assetExportSchema } from './assetSchema.js';
import {
  objectTypeSchema,
  supportedLanguageSchema,
  uuidSchema,
  versionSchema,
} from './baseSchema.js';
import { collectionExportSchema } from './collectionSchema.js';
import { componentExportSchema } from './componentSchema.js';
import { baseFileSchema } from './fileSchema.js';
import { gitCommitSchema, gitSwitchOptionsSchema } from './gitSchema.js';

export const projectSettingsSchema = z.object({
  language: z
    .object({
      default: supportedLanguageSchema,
      supported: z
        .array(supportedLanguageSchema)
        .nonempty()
        .check((ctx) => {
          if (new Set(ctx.value).size !== ctx.value.length) {
            ctx.issues.push({
              code: 'custom',
              message: 'Supported languages must not contain duplicates',
              input: ctx.value,
            });
          }
        }),
    })
    .check((ctx) => {
      if (!ctx.value.supported.includes(ctx.value.default)) {
        ctx.issues.push({
          code: 'custom',
          message: 'Default language must be one of the supported languages',
          input: ctx.value.default,
          path: ['default'],
        });
      }
    }),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

/**
 * The non-empty tuple of languages a Project supports. Derived from the
 * Project schema so that any change to the schema flows through the type.
 *
 * Used by strict entity factories and code generators to type the
 * `languages` parameter, carrying the non-empty guarantee end-to-end.
 */
export type ProjectLanguages = ProjectSettings['language']['supported'];

export const projectFolderSchema = z.enum([
  'assets',
  'collections',
  'components',
  'lfs',
  // 'logs',
  // 'public',
  // 'theme',
]);
export type ProjectFolder = z.infer<typeof projectFolderSchema>;

export const projectBranchSchema = z.enum(['production', 'work']);
export type ProjectBranch = z.infer<typeof projectBranchSchema>;

export const projectFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.project).readonly(),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  version: versionSchema,
  settings: projectSettingsSchema,
});
export type ProjectFile = z.infer<typeof projectFileSchema>;

export const projectSchema = projectFileSchema
  .extend({
    remoteOriginUrl: z.string().nullable().openapi({
      description: 'URL of the remote Git repository',
    }),
  })
  .openapi('Project');
export type Project = z.infer<typeof projectSchema>;

export const projectHistorySchema = z.object({
  id: uuidSchema.readonly(),
});
export type ProjectHistoryProps = z.infer<typeof projectHistorySchema>;

export const projectHistoryResultSchema = z.object({
  history: z.array(gitCommitSchema).openapi({
    description: 'Commit history of this Project',
  }),
  fullHistory: z.array(gitCommitSchema).openapi({
    description:
      'Full commit history of this Project including all Assets, Collections, Entries and other files',
  }),
});
export type ProjectHistoryResult = z.infer<typeof projectHistoryResultSchema>;

export const migrateProjectSchema = z.looseObject(
  projectFileSchema.pick({ id: true, coreVersion: true }).shape
);
export type MigrateProjectProps = z.infer<typeof migrateProjectSchema>;

export const projectExportSchema = projectSchema.extend({
  assets: z.array(assetExportSchema),
  collections: z.array(collectionExportSchema),
  components: z.array(componentExportSchema),
});
export type ProjectExport = z.infer<typeof projectExportSchema>;

export const createProjectSchema = projectSchema.pick({
  name: true,
  description: true,
  settings: true,
});
export type CreateProjectProps = z.infer<typeof createProjectSchema>;

export const readProjectSchema = z.object({
  id: uuidSchema.readonly(),
  commitHash: z.string().optional().readonly(),
});
export type ReadProjectProps = z.infer<typeof readProjectSchema>;

export const updateProjectSchema = projectSchema.pick({
  id: true,
  name: true,
  description: true,
  settings: true,
});
export type UpdateProjectProps = z.infer<typeof updateProjectSchema>;

export const upgradeProjectSchema = z.object({
  id: uuidSchema.readonly(),
  /**
   * Force the upgrade even if the Project is up-to-date
   */
  force: z.boolean().optional(),
});
export type UpgradeProjectProps = z.infer<typeof upgradeProjectSchema>;

export const deleteProjectSchema = readProjectSchema.extend({
  force: z.boolean().optional(),
});
export type DeleteProjectProps = z.infer<typeof deleteProjectSchema>;

export const cloneProjectSchema = z.object({
  url: z.string(),
});
export type CloneProjectProps = z.infer<typeof cloneProjectSchema>;

/**
 * The content state to provision: a branch or a Release version
 */
export const contentRefSchema = z.union([projectBranchSchema, versionSchema]);
export type ContentRef = z.infer<typeof contentRefSchema>;

export const ensureFromRemoteProjectSchema = z.object({
  id: uuidSchema,
  /**
   * The remote repository URL to provision from
   */
  url: z.string().trim().min(1),
  /**
   * The content state to provision
   *
   * @default 'production'
   */
  ref: contentRefSchema.optional(),
});
export type EnsureFromRemoteProjectProps = z.infer<
  typeof ensureFromRemoteProjectSchema
>;

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

export const searchProjectSchema = z.object({
  id: uuidSchema.readonly(),
  query: z.string(),
  language: supportedLanguageSchema,
  type: z.array(objectTypeSchema).optional(),
});
export type SearchProjectProps = z.infer<typeof searchProjectSchema>;
