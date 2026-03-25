/**
 * Dynamic zod schema generation
 *
 * Altough everything is already strictly typed, a type of string might not be an email or text of a certain length.
 * To validate this, we need to generate zod schemas based on Field definitions the user created.
 */

import { z } from '@hono/zod-openapi';
import {
  slugSchema,
  supportedLanguageSchema,
  uuidSchema,
  type Uuid,
} from './baseSchema.js';
import {
  createEntrySchema,
  entrySchema,
  updateEntrySchema,
} from './entrySchema.js';
import type {
  AssetFieldDefinition,
  DynamicFieldDefinition,
  EntryFieldDefinition,
  FieldDefinition,
  NumberFieldDefinition,
  NumberSelectFieldDefinition,
  RangeFieldDefinition,
  StringFieldDefinition,
} from './fieldSchema.js';
import { fieldTypeSchema } from './fieldSchema.js';
import {
  componentValueSchema,
  directBooleanValueSchema,
  directNumberValueSchema,
  directStringValueSchema,
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
 * Number Values can have min and max values and can be required or not
 */
function getNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition:
    | NumberFieldDefinition
    | RangeFieldDefinition
    | NumberSelectFieldDefinition
) {
  let schema = z.number();

  if (fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }
  if (fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  if (fieldDefinition.isRequired === false) {
    return schema.nullable();
  }

  return schema;
}

/**
 * String Values can have different formats (email, url, ipv4, date, time, ...)
 * and can have min and max length and can be required or not
 */
function getStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition
) {
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
 * Reference Values can reference either Assets or Entries,
 * can have min / max number of references and can be required or not
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

export function getTranslatableStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getStringValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

export function getTranslatableNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition:
    | NumberFieldDefinition
    | RangeFieldDefinition
    | NumberSelectFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getNumberValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

export function getTranslatableBooleanValueContentSchemaFromFieldDefinition() {
  return z.partialRecord(
    supportedLanguageSchema,
    getBooleanValueContentSchemaFromFieldDefinition()
  );
}

export function getTranslatableReferenceValueContentSchemaFromFieldDefinition(
  fieldDefinition: AssetFieldDefinition | EntryFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getReferenceValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

/**
 * Generates the content schema for a dynamic (component) field.
 * For each referenced Component, builds a per-component item schema with a
 * z.literal componentId discriminator and a strict values object.
 * Returns a z.array of the union (or single schema if only one component).
 */
function getComponentValueContentSchemaFromFieldDefinition(
  fieldDefinition: DynamicFieldDefinition,
  componentResolver: ComponentResolver,
  visited: Set<string>
) {
  const componentSchemas = fieldDefinition.ofComponents.map((componentId) => {
    const fieldDefinitions = componentResolver(componentId);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const fieldDefinition of fieldDefinitions) {
      shape[fieldDefinition.slug] = getValueSchemaFromFieldDefinition(
        fieldDefinition,
        componentResolver,
        visited
      );
    }
    return z.object({
      componentId: z.literal(componentId),
      values: z.object(shape),
    });
  });

  let itemSchema: z.ZodTypeAny;
  const [first, second, ...rest] = componentSchemas;
  if (!first) {
    // Empty ofComponents means "all components allowed" - use a permissive schema
    itemSchema = z.object({
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
 * Generates a zod schema to check a Value based on given Field definition.
 * For component (dynamic) fields, requires a componentResolver to look up
 * sub-field definitions and a visited set for circular reference protection.
 */
export function getValueSchemaFromFieldDefinition(
  fieldDefinition: FieldDefinition,
  componentResolver?: ComponentResolver,
  visited: Set<string> = new Set()
) {
  switch (fieldDefinition.valueType) {
    case valueTypeSchema.enum.boolean:
      return directBooleanValueSchema.extend({
        content: getTranslatableBooleanValueContentSchemaFromFieldDefinition(),
      });
    case valueTypeSchema.enum.number:
      return directNumberValueSchema.extend({
        content:
          getTranslatableNumberValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case valueTypeSchema.enum.string:
      return directStringValueSchema.extend({
        content:
          getTranslatableStringValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case valueTypeSchema.enum.reference:
      return referencedValueSchema.extend({
        content:
          getTranslatableReferenceValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case valueTypeSchema.enum.component: {
      if (!componentResolver) {
        throw new Error(
          'componentResolver is required for dynamic (component) field definitions'
        );
      }
      // Circular reference protection during schema generation
      for (const cid of fieldDefinition.ofComponents) {
        if (visited.has(cid)) {
          throw new Error(
            `Circular component reference detected: Component "${cid}" is already in the schema generation chain`
          );
        }
        visited.add(cid);
      }
      return componentValueSchema.extend({
        content: getComponentValueContentSchemaFromFieldDefinition(
          fieldDefinition,
          componentResolver,
          visited
        ),
      });
    }
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
  componentResolver?: ComponentResolver,
  visited?: Set<string>
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const fieldDef of fieldDefinitions) {
    shape[fieldDef.slug] = getValueSchemaFromFieldDefinition(
      fieldDef,
      componentResolver,
      visited
    );
  }
  return shape;
}

/**
 * Generates a schema for an Entry based on the given Field definitions and Values
 */
export function getEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...entrySchema.shape,
    values: getValuesSchema(fieldDefinitions, componentResolver),
  });
}

/**
 * Generates a schema for creating a new Entry based on the given Field definitions and Values
 */
export function getCreateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...createEntrySchema.shape,
    values: getValuesSchema(fieldDefinitions, componentResolver),
  });
}

/**
 * Generates a schema for updating an existing Entry based on the given Field definitions and Values
 */
export function getUpdateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...updateEntrySchema.shape,
    values: getValuesSchema(fieldDefinitions, componentResolver),
  });
}

/**
 * Builds a values schema that validates each field individually
 * and pipes through `z.record(slugSchema, valueSchema)` so
 * the output type is correctly inferred as `Record<string, Value>`.
 */
function getValuesSchema(
  fieldDefinitions: FieldDefinition[],
  componentResolver?: ComponentResolver
) {
  return z
    .object(
      getValuesShapeFromFieldDefinitions(fieldDefinitions, componentResolver)
    )
    .pipe(z.record(slugSchema, valueSchema));
}
