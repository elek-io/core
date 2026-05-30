import { z } from '@hono/zod-openapi';
import {
  slugSchema,
  partialTranslatableStringSchema,
  uuidSchema,
  type Uuid,
} from './baseSchema.js';
import {
  buildMdAstSchemaForFeatures,
  markdownFeaturesSchema,
} from './buildMdAstSchema.js';
import { mdAstRootSchema, valueTypeSchema } from './valueSchema.js';

export const fieldTypeSchema = z.enum([
  // String Values
  'text',
  'textarea',
  'email',
  'url',
  'ipv4',
  'date',
  'time',
  'datetime',
  'telephone',
  // Number Values
  'number',
  'range',
  // Boolean Values
  'toggle',
  // Select Values (string or number)
  'select',
  // Reference Values
  'asset',
  'entry',
  // Dynamic Values (polymorphic blocks referencing Components)
  'dynamic',
  // Mdast Values (structured rich-text content)
  'markdown',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const fieldWidthSchema = z.enum(['12', '6', '4', '3']);

//
// Shared helpers reused by multiple schemas
//

const selectOptionSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({ value: valueSchema, label: partialTranslatableStringSchema });

const selectDefaultValueMustBeInOptionsRefinement: [
  (data: {
    defaultValue: string | number | null;
    options: { value: string | number }[];
  }) => boolean,
  { message: string; path: string[] },
] = [
  (data) =>
    data.defaultValue === null ||
    data.options.some((o) => o.value === data.defaultValue),
  {
    message: 'The default value must be one of the defined options',
    path: ['defaultValue'],
  },
];

const minMustBeLessOrEqualMaxRefinement: [
  (data: { min: number | null; max: number | null }) => boolean,
  { message: string; path: string[] },
] = [
  (data) => data.max === null || data.min === null || data.min <= data.max,
  { message: 'min must be less than or equal to max', path: ['min'] },
];

/**
 * Validates that fieldDefinition slugs are unique within their parent fieldDefinitions array.
 * Handles both FieldDefinitions and FieldDefinitionGroups.
 *
 * Use this refinement via the superRefine method, not the standard refine.
 */
export const fieldDefinitionSlugUniquenessSuperRefinement = (
  fieldDefinitionsOrGroups: FieldDefinitionOrGroup[],
  ctx: z.RefinementCtx
) => {
  const seen = new Set<string>();
  for (const [
    parentIndex,
    fieldDefinitionOrGroup,
  ] of fieldDefinitionsOrGroups.entries()) {
    if ('isGroup' in fieldDefinitionOrGroup) {
      for (const [
        childIndex,
        fieldDefinition,
      ] of fieldDefinitionOrGroup.fieldDefinitions.entries()) {
        if (seen.has(fieldDefinition.slug)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Slug already in use',
            path: [parentIndex, 'fieldDefinitions', childIndex, 'slug'],
          });
        }
        seen.add(fieldDefinition.slug);
      }
    } else {
      if (seen.has(fieldDefinitionOrGroup.slug)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Slug already in use',
          path: [parentIndex, 'slug'],
        });
      }
      seen.add(fieldDefinitionOrGroup.slug);
    }
  }
};

/**
 * Base Field definition
 * Contains all common properties across all Field definitions
 */
export const fieldDefinitionBaseSchema = z.object({
  id: uuidSchema.readonly(),
  slug: slugSchema,
  label: partialTranslatableStringSchema,
  description: partialTranslatableStringSchema.nullable(),
  isRequired: z.boolean(),
  isDisabled: z.boolean(),
  isUnique: z.boolean(),
  inputWidth: fieldWidthSchema,
});
export type FieldDefinitionBase = z.infer<typeof fieldDefinitionBaseSchema>;

//
// Direct Field definitions (basic fields of type string, number, boolean)
//

//
// String based Field definitions
//

export const stringFieldDefinitionBaseSchema = fieldDefinitionBaseSchema.extend(
  {
    valueType: z.literal(valueTypeSchema.enum.string),
    defaultValue: z.string().nullable(),
  }
);

export const textFieldDefinitionSchema = stringFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.text),
    min: z.int().min(1).nullable(),
    max: z.int().min(1).nullable(),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type TextFieldDefinition = z.infer<typeof textFieldDefinitionSchema>;

export const textareaFieldDefinitionSchema = stringFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.textarea),
    min: z.int().min(1).nullable(),
    max: z.int().min(1).nullable(),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type TextareaFieldDefinition = z.infer<
  typeof textareaFieldDefinitionSchema
>;

export const emailFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.email),
    defaultValue: z.email().nullable(),
  });
export type EmailFieldDefinition = z.infer<typeof emailFieldDefinitionSchema>;

export const urlFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend({
  fieldType: z.literal(fieldTypeSchema.enum.url),
  defaultValue: z.url().nullable(),
});
export type UrlFieldDefinition = z.infer<typeof urlFieldDefinitionSchema>;

export const ipv4FieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.ipv4),
    defaultValue: z.ipv4().nullable(),
  }
);
export type Ipv4FieldDefinition = z.infer<typeof ipv4FieldDefinitionSchema>;

export const dateFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.date),
    defaultValue: z.iso.date().nullable(),
  }
);
export type DateFieldDefinition = z.infer<typeof dateFieldDefinitionSchema>;

export const timeFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.time),
    defaultValue: z.iso.time().nullable(),
  }
);
export type TimeFieldDefinition = z.infer<typeof timeFieldDefinitionSchema>;

export const datetimeFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.datetime),
    defaultValue: z.iso.datetime().nullable(),
  });
export type DatetimeFieldDefinition = z.infer<
  typeof datetimeFieldDefinitionSchema
>;

export const telephoneFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.telephone),
    defaultValue: z.e164().nullable(),
  });
export type TelephoneFieldDefinition = z.infer<
  typeof telephoneFieldDefinitionSchema
>;

export const stringSelectFieldDefinitionSchema = stringFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.select),
    options: z.array(selectOptionSchema(z.string())).min(1),
  })
  .refine(...selectDefaultValueMustBeInOptionsRefinement);
export type StringSelectFieldDefinition = z.infer<
  typeof stringSelectFieldDefinitionSchema
>;

export const stringFieldDefinitionSchema = z.union([
  textFieldDefinitionSchema,
  textareaFieldDefinitionSchema,
  emailFieldDefinitionSchema,
  urlFieldDefinitionSchema,
  ipv4FieldDefinitionSchema,
  dateFieldDefinitionSchema,
  timeFieldDefinitionSchema,
  datetimeFieldDefinitionSchema,
  telephoneFieldDefinitionSchema,
  stringSelectFieldDefinitionSchema,
]);
export type StringFieldDefinition = z.infer<typeof stringFieldDefinitionSchema>;

//
// Number based Field definitions
//

export const numberFieldDefinitionBaseSchema = fieldDefinitionBaseSchema.extend(
  {
    valueType: z.literal(valueTypeSchema.enum.number),
    min: z.number().nullable(),
    max: z.number().nullable(),
    isUnique: z.literal(false),
    defaultValue: z.number().nullable(),
  }
);

export const numberFieldDefinitionSchema = numberFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.number),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type NumberFieldDefinition = z.infer<typeof numberFieldDefinitionSchema>;

export const rangeFieldDefinitionSchema = numberFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.range),
    // Overwrite from nullable to required because a range needs min, max and default to work and is required, since it always returns a number
    isRequired: z.literal(true),
    min: z.number(),
    max: z.number(),
    defaultValue: z.number(),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type RangeFieldDefinition = z.infer<typeof rangeFieldDefinitionSchema>;

export const numberSelectFieldDefinitionSchema = numberFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.select),
    options: z.array(selectOptionSchema(z.number())).min(1),
    // min/max don't apply to a fixed option list
    min: z.literal(null),
    max: z.literal(null),
  })
  .refine(...selectDefaultValueMustBeInOptionsRefinement);
export type NumberSelectFieldDefinition = z.infer<
  typeof numberSelectFieldDefinitionSchema
>;

//
// Boolean based Field definitions
//

export const booleanFieldDefinitionBaseSchema =
  fieldDefinitionBaseSchema.extend({
    valueType: z.literal(valueTypeSchema.enum.boolean),
    // Overwrite from nullable to required because a boolean needs a default to work and is required, since it always is either true or false
    isRequired: z.literal(true),
    defaultValue: z.boolean(),
    isUnique: z.literal(false),
  });

export const toggleFieldDefinitionSchema =
  booleanFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.toggle),
  });
export type ToggleFieldDefinition = z.infer<typeof toggleFieldDefinitionSchema>;

/**
 * Union of all direct Field definitions
 */
export const directFieldDefinitionSchema = z.union([
  stringFieldDefinitionSchema,
  numberFieldDefinitionSchema,
  rangeFieldDefinitionSchema,
  numberSelectFieldDefinitionSchema,
  toggleFieldDefinitionSchema,
]);
export type DirectFieldDefinition = z.infer<typeof directFieldDefinitionSchema>;

//
// Reference based Field definitions
//

export const referenceFieldDefinitionBaseSchema =
  fieldDefinitionBaseSchema.extend({
    valueType: z.literal(valueTypeSchema.enum.reference),
    isUnique: z.literal(false),
  });

export const assetFieldDefinitionSchema = referenceFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.asset),
    min: z.int().min(1).nullable(),
    max: z.int().min(1).nullable(),
    /**
     * Allowed MIME types for referenced Assets. Empty array = any MIME.
     * Enforced at write time by `EntryService.validateValueReferences`,
     * which reads each referenced Asset's `mimeType` and compares against
     * this list. Schema-level enforcement isn't possible because asset
     * references carry only `id` - MIME info lives on the asset file.
     */
    ofAssetMimeTypes: z.array(z.string()),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type AssetFieldDefinition = z.infer<typeof assetFieldDefinitionSchema>;

export const entryFieldDefinitionSchema = referenceFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.entry),
    ofCollections: z.array(uuidSchema),
    min: z.int().min(1).nullable(),
    max: z.int().min(1).nullable(),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type EntryFieldDefinition = z.infer<typeof entryFieldDefinitionSchema>;

/**
 * Union of all reference Field definitions
 */
export const referenceFieldDefinitionSchema = z.union([
  assetFieldDefinitionSchema,
  entryFieldDefinitionSchema,
]);
export type ReferenceFieldDefinition = z.infer<
  typeof referenceFieldDefinitionSchema
>;

/**
 * A dynamic field definition references one or more Components.
 * Entry data contains an ordered array of polymorphic component items.
 */
export const dynamicFieldDefinitionSchema = fieldDefinitionBaseSchema
  .extend({
    valueType: z.literal(valueTypeSchema.enum.component),
    fieldType: z.literal(fieldTypeSchema.enum.dynamic),
    isUnique: z.literal(false),
    ofComponents: z.array(uuidSchema),
    min: z.int().min(1).nullable(),
    max: z.int().min(1).nullable(),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement);
export type DynamicFieldDefinition = z.infer<
  typeof dynamicFieldDefinitionSchema
>;

//
// Mdast Field definitions (structured rich-text content)
//

/**
 * A markdown field stores rich body content as a structured mdast tree
 * (one tree per language). The writer experience is markdown-style; the
 * storage shape is the structured AST. See `docs/markdown-content.md`.
 *
 * The per-field schema (constructed by `buildMdAstSchemaForFeatures`) is
 * what actually validates an entry's tree at write time - it narrows the
 * permissive `mdAstRootSchema` to only the node types enabled in the
 * `features` config, enforces `ofCollections` structurally on
 * `entryReference` nodes, and applies block-count min/max.
 *
 * Existence + MIME validation lives in `EntryService.validateValueReferences`
 * because both require IO (read the target asset/entry file).
 */
export const markdownFieldDefinitionSchema = fieldDefinitionBaseSchema
  .extend({
    valueType: z.literal(valueTypeSchema.enum.mdast),
    fieldType: z.literal(fieldTypeSchema.enum.markdown),
    // Mdast trees can't be sensibly unique-indexed.
    isUnique: z.literal(false),
    /** Minimum number of top-level blocks. */
    min: z.int().min(1).nullable(),
    /** Maximum number of top-level blocks. */
    max: z.int().min(1).nullable(),
    features: markdownFeaturesSchema,
    /** Empty array = any Collection allowed for entryReference targets. */
    ofCollections: z.array(uuidSchema),
    /** Empty array = any MIME allowed for assetReference targets. */
    ofAssetMimeTypes: z.array(z.string()),
    /**
     * Single tree applied to every supported language at entry creation.
     * Same language-agnostic posture as `text.defaultValue` -
     * per-language translation of the default is an authoring concern.
     */
    defaultValue: mdAstRootSchema.nullable(),
  })
  .refine(...minMustBeLessOrEqualMaxRefinement)
  .superRefine((def, ctx) => {
    // Refinement 1: taskListItems requires lists
    if (def.features.taskListItems && !def.features.lists) {
      ctx.addIssue({
        code: 'custom',
        message: 'taskListItems requires lists to be enabled',
        path: ['features', 'taskListItems'],
      });
    }

    // Refinement 2: defaultValue (when non-null) must satisfy the
    // features-derived tree schema. Catches contradictory configs early
    // (e.g. defaultValue contains a `table` node but features.tables is
    // false). Mirrors `selectDefaultValueMustBeInOptionsRefinement`.
    if (def.defaultValue !== null) {
      const featureSchema = buildMdAstSchemaForFeatures({
        features: def.features,
        ofCollections: def.ofCollections,
        min: def.min,
        max: def.max,
        // For defaultValue validation, treat as required so we don't
        // accept `null` (we already know it's non-null here).
        isRequired: true,
      });
      const result = featureSchema.safeParse(def.defaultValue);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            message: `defaultValue: ${issue.message}`,
            path: ['defaultValue', ...issue.path],
          });
        }
      }
    }
  });
export type MarkdownFieldDefinition = z.infer<
  typeof markdownFieldDefinitionSchema
>;

export const fieldDefinitionSchema = z.union([
  directFieldDefinitionSchema,
  referenceFieldDefinitionSchema,
  dynamicFieldDefinitionSchema,
  markdownFieldDefinitionSchema,
]);
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/**
 * A group of Field definitions, displayed as a named fieldset in the UI.
 * Groups are purely presentational and do not affect entry data or validation.
 * Ordering is determined by position in the parent array (supports drag-and-drop).
 * Groups can contain direct, reference and dynamic field definitions but not nested groups.
 */
export const fieldDefinitionGroupSchema = z.object({
  isGroup: z.literal(true),
  id: uuidSchema.readonly(),
  label: partialTranslatableStringSchema,
  description: partialTranslatableStringSchema.nullable(),
  fieldDefinitions: z.array(fieldDefinitionSchema), // No refinement for unique slugs here, since this takes place at the parent level in the collectionSchema (all definitions need to be compared together)
});
export type FieldDefinitionGroup = z.infer<typeof fieldDefinitionGroupSchema>;

/**
 * Union of a FieldDefinition or a FieldDefinitionGroup,
 */
export const fieldDefinitionOrGroupSchema = z.union([
  fieldDefinitionGroupSchema,
  fieldDefinitionSchema,
]);
export type FieldDefinitionOrGroup = z.infer<
  typeof fieldDefinitionOrGroupSchema
>;

/**
 * Flattens a mixed array of FieldDefinitions and FieldDefinitionGroups
 * into a flat array of FieldDefinitions.
 */
export function flattenFieldDefinitions(
  fieldDefinitionsOrGroups: FieldDefinitionOrGroup[]
): FieldDefinition[] {
  return fieldDefinitionsOrGroups.flatMap((fieldDefinitionOrGroup) =>
    'isGroup' in fieldDefinitionOrGroup
      ? fieldDefinitionOrGroup.fieldDefinitions
      : [fieldDefinitionOrGroup]
  );
}

/**
 * Resolves the effective list of Component IDs a dynamic field references.
 * An empty `ofComponents` array means "all Components in the Project".
 */
export function resolveOfComponents(
  fieldDefinition: DynamicFieldDefinition,
  allComponentIds: readonly Uuid[]
): readonly Uuid[] {
  return fieldDefinition.ofComponents.length > 0
    ? fieldDefinition.ofComponents
    : allComponentIds;
}
