import { z } from '@hono/zod-openapi';
import { toPascalCase } from '../cli/util.js';
import {
  makeComponentsContext,
  type Component,
  type ComponentsContext,
} from '../schema/componentSchema.js';
import {
  resolveOfComponents,
  type DynamicFieldDefinition,
  type FieldDefinition,
} from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import {
  getTranslatableBooleanValueContentSchemaFromFieldDefinition,
  getTranslatableMdAstValueContentSchemaFromFieldDefinition,
  getTranslatableNumberValueContentSchemaFromFieldDefinition,
  getTranslatableReferenceValueContentSchemaFromFieldDefinition,
  getTranslatableStringValueContentSchemaFromFieldDefinition,
} from '../schema/schemaFromFieldDefinition.js';
import { valueTypeSchema } from '../schema/valueSchema.js';

/**
 * Walks the Component graph reachable from `rootFieldDefinitions`, returning
 * the deduped list of Components in post-order (leaves first). Throws on
 * cycles and on `ofComponents` UUIDs that do not resolve to a Component.
 *
 * Cycle detection branches `inFlight` per descent so two sibling dynamic
 * fields referencing the same Component do not trigger a false positive.
 */
function walkReferencedComponents(
  rootFieldDefinitions: readonly FieldDefinition[],
  ctx: ComponentsContext
): readonly Component[] {
  const completed = new Set<string>();
  const result: Component[] = [];

  function visit(
    componentId: string,
    referencingSlug: string,
    inFlight: ReadonlySet<string>
  ) {
    if (inFlight.has(componentId)) {
      throw new Error(
        `Circular component reference detected: Component "${componentId}" is already in the schema generation chain`
      );
    }
    if (completed.has(componentId)) return;

    const component = ctx.componentMap.get(componentId);
    if (!component) {
      throw new Error(
        `Component "${componentId}" referenced by dynamic field "${referencingSlug}" not found in Project`
      );
    }

    const newInFlight = new Set(inFlight);
    newInFlight.add(componentId);

    for (const fieldDef of component.fieldDefinitions) {
      if (fieldDef.valueType === valueTypeSchema.enum.component) {
        for (const innerId of resolveOfComponents(fieldDef, ctx.allIds)) {
          visit(innerId, fieldDef.slug, newInFlight);
        }
      }
    }

    completed.add(componentId);
    result.push(component);
  }

  for (const fieldDef of rootFieldDefinitions) {
    if (fieldDef.valueType === valueTypeSchema.enum.component) {
      for (const id of resolveOfComponents(fieldDef, ctx.allIds)) {
        visit(id, fieldDef.slug, new Set());
      }
    }
  }

  return result;
}

/**
 * Builds the Zod schema for a single field's content. The component case
 * returns the array schema for nested component items (no envelope).
 */
function buildValueContentSchema(
  fieldDef: FieldDefinition,
  languages: ProjectLanguages,
  ctx: ComponentsContext
): z.ZodTypeAny {
  switch (fieldDef.valueType) {
    case valueTypeSchema.enum.string:
      return getTranslatableStringValueContentSchemaFromFieldDefinition(
        fieldDef,
        languages
      );
    case valueTypeSchema.enum.number:
      return getTranslatableNumberValueContentSchemaFromFieldDefinition(
        fieldDef,
        languages
      );
    case valueTypeSchema.enum.boolean:
      return getTranslatableBooleanValueContentSchemaFromFieldDefinition(
        languages
      );
    case valueTypeSchema.enum.reference:
      return getTranslatableReferenceValueContentSchemaFromFieldDefinition(
        fieldDef,
        languages
      );
    case valueTypeSchema.enum.component:
      return buildComponentArraySchema(fieldDef, languages, ctx);
    case valueTypeSchema.enum.mdast:
      return getTranslatableMdAstValueContentSchemaFromFieldDefinition(
        fieldDef,
        languages
      );
  }
}

/**
 * Builds a Zod schema for the array value of a dynamic (component) field.
 * The schema validates the *stripped* shape produced by `transformEntryValues`
 * (no Value envelopes), keyed only by the Component slugs the field references.
 *
 * Cycles must be rejected upstream by `walkReferencedComponents` - this builder
 * recurses eagerly and would otherwise loop forever.
 */
function buildComponentArraySchema(
  fieldDef: DynamicFieldDefinition,
  languages: ProjectLanguages,
  ctx: ComponentsContext
): z.ZodTypeAny {
  const componentIds = resolveOfComponents(fieldDef, ctx.allIds);

  const componentSchemas = componentIds.map((id) => {
    const component = ctx.componentMap.get(id);
    if (!component) {
      throw new Error(
        `Component "${id}" referenced by dynamic field "${fieldDef.slug}" not found in Project`
      );
    }

    const valuesShape: Record<string, z.ZodTypeAny> = {};
    for (const inner of component.fieldDefinitions) {
      valuesShape[inner.slug] = buildValueContentSchema(inner, languages, ctx);
    }

    return z.object({
      id: z.string(),
      componentId: z.literal(id),
      values: z.object(valuesShape),
    });
  });

  let itemSchema: z.ZodTypeAny;
  const [first, second, ...rest] = componentSchemas;
  if (!first) {
    // Project has no Components at all and `ofComponents` was open. No items can satisfy the field.
    itemSchema = z.never();
  } else if (!second) {
    itemSchema = first;
  } else {
    itemSchema = z.discriminatedUnion('componentId', [first, second, ...rest]);
  }

  let arr = z.array(itemSchema);
  if (fieldDef.min !== null) arr = arr.min(fieldDef.min);
  else if (fieldDef.isRequired) arr = arr.min(1);
  if (fieldDef.max !== null) arr = arr.max(fieldDef.max);
  return arr;
}

/**
 * Generates a flat Zod object schema from collection field definitions
 * for use with Astro's `parseData` validation.
 *
 * Each key is the field definition slug and each value schema
 * is the translatable content schema for that field type.
 */
export function buildEntryValuesSchema(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  components: readonly Component[]
) {
  const ctx = makeComponentsContext(components);
  // Cycle detection runs once at the top - `buildComponentArraySchema` itself
  // assumes no cycles when recursing.
  walkReferencedComponents(fieldDefinitions, ctx);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const fieldDef of fieldDefinitions) {
    shape[fieldDef.slug] = buildValueContentSchema(fieldDef, languages, ctx);
  }
  return z.object(shape);
}

/**
 * Generates a TypeScript type string from collection field definitions
 * for use with Astro's `createSchema` API.
 *
 * The generated string is written by Astro to a `.ts` file and imported
 * as the `Entry` type for the collection.
 */
export function buildEntryValuesTypeString(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  components: readonly Component[],
  collectionPascalName: string
): string {
  const ctx = makeComponentsContext(components);
  const referenced = walkReferencedComponents(fieldDefinitions, ctx);

  const lines: string[] = [];

  lines.push(
    `type ProjectLanguage = ${languages
      .map((language) => `"${language}"`)
      .join(' | ')};`
  );

  // Per-Component blocks: emit each Component's per-field Item types first
  // (forward-referenced by the Values type), then its Values type.
  for (const component of referenced) {
    const componentPascal = toPascalCase(component.slug);

    for (const fieldDef of component.fieldDefinitions) {
      if (fieldDef.valueType === valueTypeSchema.enum.component) {
        lines.push(
          renderItemUnion(
            `${componentPascal}${toPascalCase(fieldDef.slug)}Item`,
            fieldDef,
            ctx
          )
        );
      }
    }

    lines.push(
      renderComponentValuesType(componentPascal, component.fieldDefinitions)
    );
  }

  // Top-level (Collection-level) Item types
  for (const fieldDef of fieldDefinitions) {
    if (fieldDef.valueType === valueTypeSchema.enum.component) {
      lines.push(
        renderItemUnion(
          `${collectionPascalName}${toPascalCase(fieldDef.slug)}Item`,
          fieldDef,
          ctx
        )
      );
    }
  }

  if (fieldDefinitions.length === 0) {
    lines.push('export type Entry = Record<string, never>;');
    return lines.join('\n\n');
  }

  const entryFields = fieldDefinitions.map((fieldDef) => {
    if (fieldDef.valueType === valueTypeSchema.enum.component) {
      const itemTypeName = `${collectionPascalName}${toPascalCase(fieldDef.slug)}Item`;
      return `  "${fieldDef.slug}": Array<${itemTypeName}>`;
    }
    return `  "${fieldDef.slug}": Record<ProjectLanguage, ${valueTypeToTsType(fieldDef.valueType)}>`;
  });

  lines.push(
    [`export type Entry = {`, entryFields.join(';\n') + ';', `};`].join('\n')
  );

  return lines.join('\n\n');
}

function renderItemUnion(
  typeName: string,
  fieldDef: DynamicFieldDefinition,
  ctx: ComponentsContext
): string {
  const componentIds = resolveOfComponents(fieldDef, ctx.allIds);
  const variants = componentIds.map((id) => {
    const component = ctx.componentMap.get(id);
    if (!component) {
      throw new Error(
        `Component "${id}" referenced by dynamic field "${fieldDef.slug}" not found in Project`
      );
    }
    const innerPascal = toPascalCase(component.slug);
    return `  | { id: string; componentId: "${id}"; values: ${innerPascal}ComponentValues }`;
  });
  return [`type ${typeName} =`, variants.join('\n') + ';'].join('\n');
}

function renderComponentValuesType(
  componentPascal: string,
  flat: readonly FieldDefinition[]
): string {
  if (flat.length === 0) {
    return `type ${componentPascal}ComponentValues = Record<string, never>;`;
  }
  const fields = flat.map((fieldDef) => {
    if (fieldDef.valueType === valueTypeSchema.enum.component) {
      const itemTypeName = `${componentPascal}${toPascalCase(fieldDef.slug)}Item`;
      return `  "${fieldDef.slug}": Array<${itemTypeName}>`;
    }
    return `  "${fieldDef.slug}": Record<ProjectLanguage, ${valueTypeToTsType(fieldDef.valueType)}>`;
  });
  return [
    `type ${componentPascal}ComponentValues = {`,
    fields.join(';\n') + ';',
    `};`,
  ].join('\n');
}

function valueTypeToTsType(valueType: string): string {
  switch (valueType) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'reference':
      return 'Array<{ id: string; objectType: string }>';
    default:
      return 'unknown';
  }
}
