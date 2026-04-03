import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  translatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { valueSchema } from './valueSchema.js';
import {
  fieldDefinitionSchema,
  fieldDefinitionSlugUniquenessSuperRefinement,
} from './fieldSchema.js';
import { baseFileSchema } from './fileSchema.js';

export const componentFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.component).readonly(),
  name: translatableStringSchema,
  slug: slugSchema,
  description: translatableStringSchema.nullable(),
  fieldDefinitions: z
    .array(fieldDefinitionSchema)
    .superRefine(fieldDefinitionSlugUniquenessSuperRefinement),
});
export type ComponentFile = z.infer<typeof componentFileSchema>;

export const componentSchema = componentFileSchema.openapi('Component');
export type Component = z.infer<typeof componentSchema>;

export const componentHistorySchema = z.object({
  id: uuidSchema.readonly(),
  projectId: uuidSchema.readonly(),
});
export type ComponentHistoryProps = z.infer<typeof componentHistorySchema>;

export const componentExportSchema = componentSchema.extend({});
export type ComponentExport = z.infer<typeof componentExportSchema>;

export const createComponentSchema = componentFileSchema
  .omit({
    id: true,
    objectType: true,
    coreVersion: true,
    created: true,
    updated: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
  });
export type CreateComponentProps = z.infer<typeof createComponentSchema>;

export const readComponentSchema = z.object({
  id: uuidSchema.readonly(),
  projectId: uuidSchema.readonly(),
  commitHash: z.string().optional().readonly(),
});
export type ReadComponentProps = z.infer<typeof readComponentSchema>;

export const readBySlugComponentSchema = z.object({
  slug: slugSchema,
  projectId: uuidSchema.readonly(),
  commitHash: z.string().optional().readonly(),
});
export type ReadBySlugComponentProps = z.infer<
  typeof readBySlugComponentSchema
>;

export const updateComponentSchema = componentFileSchema
  .pick({
    id: true,
    name: true,
    slug: true,
    description: true,
    fieldDefinitions: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
    resolutions: z
      .record(uuidSchema, z.record(slugSchema, valueSchema))
      .optional(),
  });
export type UpdateComponentProps = z.infer<typeof updateComponentSchema>;

export const deleteComponentSchema = readComponentSchema.extend({});
export type DeleteComponentProps = z.infer<typeof deleteComponentSchema>;

export const countComponentsSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type CountComponentsProps = z.infer<typeof countComponentsSchema>;

export const migrateComponentSchema = z.looseObject(
  componentFileSchema.pick({ id: true, coreVersion: true }).shape
);
export type MigrateComponentProps = z.infer<typeof migrateComponentSchema>;

export const resolveComponentIdSchema = z.object({
  projectId: uuidSchema.readonly(),
  idOrSlug: z.string(),
});
export type ResolveComponentIdProps = z.infer<typeof resolveComponentIdSchema>;
