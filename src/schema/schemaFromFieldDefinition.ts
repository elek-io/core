/**
 * Dynamic zod schema generation
 *
 * Altough everything is already strictly typed, a type of string might not be an email or text of a certain length.
 * To validate this, we need to generate zod schemas based on Field definitions the user created.
 */

import { z } from '@hono/zod-openapi';
import { CoreError, slug } from '../util/shared.js';
import { slugSchema, uuidSchema, type Uuid } from './baseSchema.js';
import type { ProjectLanguages } from './projectSchema.js';
import type {
  AssetFieldDefinition,
  DynamicFieldDefinition,
  EntryFieldDefinition,
  FieldDefinition,
  MarkdownFieldDefinition,
  NumberFieldDefinition,
  NumberSelectFieldDefinition,
  RangeFieldDefinition,
  StringFieldDefinition,
} from './fieldSchema.js';
import { fieldTypeSchema } from './fieldSchema.js';
import { buildMdAstSchemaForFeatures } from './buildMdAstSchema.js';
import {
  componentValueSchema,
  directBooleanValueSchema,
  directNumberValueSchema,
  directStringValueSchema,
  mdastValueSchema,
  referencedValueSchema,
  valueContentReferenceToAssetSchema,
  valueContentReferenceToEntrySchema,
  valueSchema,
  valueTypeSchema,
} from './valueSchema.js';

/**
 * Resolves a Component UUID to its flat array of FieldDefinitions.
 * Callers pre-load all referenced Components into a Map before calling schema generation,
 * keeping schema generation synchronous.
 */
export type ComponentResolver = (componentId: Uuid) => FieldDefinition[];

/**
 * Boolean Values are always either true or false, so we don't need the Field definition here
 */
function getBooleanValueContentSchemaFromFieldDefinition() {
  return z.boolean();
}

/**
 * An optional field returns `.nullable()`, not `.optional()`, so the language
 * slot still has to be present holding `null`.
 */
function getNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition:
    NumberFieldDefinition | RangeFieldDefinition | NumberSelectFieldDefinition
) {
  let schema = z.number();

  // Compared against null rather than truthiness, because a number bound is
  // the only one that can legitimately be 0
  if (fieldDefinition.min !== null) {
    schema = schema.min(fieldDefinition.min);
  }
  if (fieldDefinition.max !== null) {
    schema = schema.max(fieldDefinition.max);
  }

  if (fieldDefinition.isRequired === false) {
    return schema.nullable();
  }

  return schema;
}

/**
 * A required string always gets `.min(1)`, so an empty string is rejected
 * even with no `min` configured. An optional one is nullable rather than
 * optional, so the language slot still has to be present.
 *
 * A `slug` field takes a separate branch that ignores `min` and `max` and
 * demands a value already canonical for the field's `separator`, `lowercase`
 * and `decamelize` settings.
 */
function getStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition
) {
  // Slug values are validated as already-canonical via idempotency, adapting
  // to the field's configured separator/lowercase/decamelize. Has no min/max.
  // An input that slugifies to the empty string (whitespace, punctuation, a
  // non-Latin script) is unusable, so it is rejected with its own message
  // rather than a generic length error.
  if (fieldDefinition.fieldType === fieldTypeSchema.enum.slug) {
    const slugConfig = {
      separator: fieldDefinition.separator,
      lowercase: fieldDefinition.lowercase,
      decamelize: fieldDefinition.decamelize,
    };
    const slugSchemaForField = z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const canonical = slug(value, slugConfig);
        if (canonical === '') {
          ctx.addIssue({
            code: 'custom',
            message:
              'This value cannot be turned into a slug. Use one with URL-safe characters',
          });
          return;
        }
        if (value !== canonical) {
          ctx.addIssue({
            code: 'custom',
            message: `Value must be a canonical slug for this field (expected "${canonical}")`,
          });
        }
      });
    return fieldDefinition.isRequired === false
      ? slugSchemaForField.nullable()
      : slugSchemaForField;
  }

  let schema = null;

  switch (fieldDefinition.fieldType) {
    case fieldTypeSchema.enum.email:
      schema = z.email();
      break;
    case fieldTypeSchema.enum.url:
      schema = z.url();
      break;
    case fieldTypeSchema.enum.ipv4:
      schema = z.ipv4();
      break;
    case fieldTypeSchema.enum.date:
      schema = z.iso.date();
      break;
    case fieldTypeSchema.enum.time:
      schema = z.iso.time();
      break;
    case fieldTypeSchema.enum.datetime:
      schema = z.iso.datetime();
      break;
    case fieldTypeSchema.enum.telephone:
      schema = z.e164();
      break;
    case fieldTypeSchema.enum.text:
    case fieldTypeSchema.enum.textarea:
    case fieldTypeSchema.enum.select:
      schema = z.string().trim();
      break;
  }

  if ('min' in fieldDefinition && fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }
  if ('max' in fieldDefinition && fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  if (fieldDefinition.isRequired === false) {
    return schema.nullable();
  }

  return schema.min(1); // @see https://github.com/colinhacks/zod/issues/2466
}

/**
 * Content is always an array and never `null`, so an optional field is an
 * empty array and `isRequired` only adds `min(1)` on top of `min` and `max`.
 *
 * An Entry reference is refined against `ofCollections` when that list is
 * non-empty, and left unconstrained when it is empty.
 */
function getReferenceValueContentSchemaFromFieldDefinition(
  fieldDefinition: AssetFieldDefinition | EntryFieldDefinition
) {
  let schema;

  switch (fieldDefinition.fieldType) {
    case fieldTypeSchema.enum.asset:
      {
        schema = z.array(valueContentReferenceToAssetSchema);
      }
      break;
    case fieldTypeSchema.enum.entry:
      {
        const entryRefSchema =
          fieldDefinition.ofCollections.length > 0
            ? valueContentReferenceToEntrySchema.refine(
                (ref) =>
                  fieldDefinition.ofCollections.includes(ref.collectionId),
                {
                  message:
                    'Referenced Entry must belong to one of the allowed Collections',
                }
              )
            : valueContentReferenceToEntrySchema;
        schema = z.array(entryRefSchema);
      }
      break;
  }

  if (fieldDefinition.isRequired) {
    schema = schema.min(1);
  }

  if (fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }

  if (fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  return schema;
}

/**
 * Lifts a single field's content schema into the per-language record every
 * Value carries. `z.record(z.enum(languages), ...)` requires exactly the
 * Project's languages, rejecting a missing key and a key outside the tuple,
 * which is what turns a partial record into a complete one at runtime.
 *
 * Each slot here holds a string bounded by the field's rules, or `null` when
 * the field is optional.
 *
 * @see ../../contributing/language-scoped-validation.md
 */
export function getTranslatableStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition,
  languages: ProjectLanguages
) {
  return z.record(
    z.enum(languages),
    getStringValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

/**
 * The same language-completeness envelope as the string wrapper above. Each
 * slot holds a number bounded by the field's `min` and `max`, or `null` when
 * the field is optional.
 */
export function getTranslatableNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition:
    NumberFieldDefinition | RangeFieldDefinition | NumberSelectFieldDefinition,
  languages: ProjectLanguages
) {
  return z.record(
    z.enum(languages),
    getNumberValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

/**
 * The same language-completeness envelope as the string wrapper above.
 *
 * It takes no field definition, because boolean fields are always required:
 * there is nothing to narrow, and no slot is ever `null`.
 */
export function getTranslatableBooleanValueContentSchemaFromFieldDefinition(
  languages: ProjectLanguages
) {
  return z.record(
    z.enum(languages),
    getBooleanValueContentSchemaFromFieldDefinition()
  );
}

/**
 * The same language-completeness envelope as the string wrapper above. Each
 * slot holds an array of Asset or Entry references rather than a nullable
 * scalar, so an optional field is an empty array.
 *
 * An Entry reference must belong to `ofCollections` when that list is
 * non-empty.
 */
export function getTranslatableReferenceValueContentSchemaFromFieldDefinition(
  fieldDefinition: AssetFieldDefinition | EntryFieldDefinition,
  languages: ProjectLanguages
) {
  return z.record(
    z.enum(languages),
    getReferenceValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

/**
 * The same language-completeness envelope as the string wrapper above. Each
 * slot holds `null`, when the field is not required, or an `MdAstRoot`
 * narrowed by the whole field definition.
 *
 * That is more than `features`: `min` and `max` apply as block counts, Entry
 * references are restricted to `ofCollections`, and an empty root, a root
 * holding only an empty paragraph and nesting past `MAX_MDAST_DEPTH` are all
 * rejected.
 */
export function getTranslatableMdAstValueContentSchemaFromFieldDefinition(
  fieldDefinition: MarkdownFieldDefinition,
  languages: ProjectLanguages
) {
  return z.record(
    z.enum(languages),
    buildMdAstSchemaForFeatures({
      features: fieldDefinition.features,
      ofCollections: fieldDefinition.ofCollections,
      min: fieldDefinition.min,
      max: fieldDefinition.max,
      isRequired: fieldDefinition.isRequired,
    })
  );
}

/**
 * Content schema for a dynamic field: an array of per-Component item schemas,
 * each discriminated by a `z.literal` componentId, unioned when the field
 * allows more than one Component.
 *
 * An item's `values` is a plain `z.object`, so a value slug the Component
 * does not declare is stripped rather than rejected.
 *
 * Throws a plain `Error`, not a `CoreError`, when the `visited` set catches a
 * Component repeating in the generation chain.
 */
function getComponentValueContentSchemaFromFieldDefinition(
  fieldDefinition: DynamicFieldDefinition,
  languages: ProjectLanguages,
  componentResolver: ComponentResolver,
  visited: Set<string>
) {
  const componentSchemas = fieldDefinition.ofComponents.map((componentId) => {
    if (visited.has(componentId)) {
      throw new Error(
        `Circular component reference detected: Component "${componentId}" is already in the schema generation chain`
      );
    }
    const branchedVisited = new Set(visited);
    branchedVisited.add(componentId);

    const fieldDefinitions = componentResolver(componentId);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const componentFieldDefinition of fieldDefinitions) {
      shape[componentFieldDefinition.slug] = getValueSchemaFromFieldDefinition(
        componentFieldDefinition,
        languages,
        componentResolver,
        branchedVisited
      );
    }
    return z.object({
      id: uuidSchema.readonly(),
      componentId: z.literal(componentId),
      values: z.object(shape),
    });
  });

  let itemSchema: z.ZodTypeAny;
  const [first, second, ...rest] = componentSchemas;
  if (!first) {
    // Empty ofComponents means "all components allowed" - use a permissive schema
    itemSchema = z.object({
      id: uuidSchema.readonly(),
      componentId: uuidSchema,
      values: z.record(slugSchema, valueSchema),
    });
  } else if (!second) {
    itemSchema = first;
  } else {
    itemSchema = z.discriminatedUnion('componentId', [first, second, ...rest]);
  }

  let schema = z.array(itemSchema);

  if (fieldDefinition.min !== null) {
    schema = schema.min(fieldDefinition.min);
  } else if (fieldDefinition.isRequired) {
    schema = schema.min(1);
  }
  if (fieldDefinition.max !== null) {
    schema = schema.max(fieldDefinition.max);
  }

  return schema;
}

/**
 * Builds the zod schema that checks one Value against its field definition.
 * A `component` field needs a `componentResolver` to reach its sub-field
 * definitions.
 *
 * Throws `Internal` for a `component` field passed without a resolver. The
 * two unreachable guards, a circular Component chain and an unhandled
 * `valueType`, still throw a plain `Error`.
 */
export function getValueSchemaFromFieldDefinition(
  fieldDefinition: FieldDefinition,
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver,
  visited: Set<string> = new Set()
) {
  switch (fieldDefinition.valueType) {
    case valueTypeSchema.enum.boolean:
      return directBooleanValueSchema.extend({
        content:
          getTranslatableBooleanValueContentSchemaFromFieldDefinition(
            languages
          ),
      });
    case valueTypeSchema.enum.number:
      return directNumberValueSchema.extend({
        content: getTranslatableNumberValueContentSchemaFromFieldDefinition(
          fieldDefinition,
          languages
        ),
      });
    case valueTypeSchema.enum.string:
      return directStringValueSchema.extend({
        content: getTranslatableStringValueContentSchemaFromFieldDefinition(
          fieldDefinition,
          languages
        ),
      });
    case valueTypeSchema.enum.reference:
      return referencedValueSchema.extend({
        content: getTranslatableReferenceValueContentSchemaFromFieldDefinition(
          fieldDefinition,
          languages
        ),
      });
    case valueTypeSchema.enum.component: {
      if (!componentResolver) {
        throw CoreError.internal(
          'componentResolver is required for dynamic (component) field definitions'
        );
      }
      return componentValueSchema.extend({
        content: getComponentValueContentSchemaFromFieldDefinition(
          fieldDefinition,
          languages,
          componentResolver,
          visited
        ),
      });
    }
    case valueTypeSchema.enum.mdast:
      return mdastValueSchema.extend({
        content: getTranslatableMdAstValueContentSchemaFromFieldDefinition(
          fieldDefinition,
          languages
        ),
      });
    default:
      throw new Error(
        // @ts-expect-error Code cannot be reached, but if we add a new ValueType and forget to update this function, we want to be notified about it
        `Error generating schema for unsupported ValueType "${fieldDefinition.valueType}"`
      );
  }
}

/**
 * Builds a z.object shape from field definitions, keyed by slug
 */
function getValuesShapeFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver,
  visited?: Set<string>
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const fieldDef of fieldDefinitions) {
    shape[fieldDef.slug] = getValueSchemaFromFieldDefinition(
      fieldDef,
      languages,
      componentResolver,
      visited
    );
  }
  return shape;
}

/**
 * Validates each field individually, then pipes through
 * `z.record(slugSchema, valueSchema)` so the output type is inferred as
 * `Record<string, Value>` rather than `Record<string, unknown>`.
 *
 * The `z.object` in front of that pipe is keyed by field definition slug, so
 * a Value whose slug matches no definition is stripped rather than rejected
 * and the Entry is written without it.
 *
 * @see ../../contributing/language-scoped-validation.md
 */
export function getValuesSchema(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver
) {
  return z
    .object(
      getValuesShapeFromFieldDefinitions(
        fieldDefinitions,
        languages,
        componentResolver
      )
    )
    .pipe(z.record(slugSchema, valueSchema));
}
