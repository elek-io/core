import { build as compileToJs } from 'tsdown';
import Path from 'node:path';
import Fs from 'fs-extra';
import CodeBlockWriter from 'code-block-writer';
import {
  flattenFieldDefinitions,
  makeComponentsContext,
  resolveOfComponents,
  CoreError,
  type ComponentsContext,
  type DynamicFieldDefinition,
  type FieldDefinition,
  type MarkdownFeatures,
  type Project,
  type GenerateTypesProps,
  type ValueType,
} from '../index.node.js';
import {
  core,
  watchProjects,
  AUTO_GENERATED_HEADER,
  toPascalCase,
  escapeForSingleQuotedString,
} from './index.js';

/**
 * Maps a valueType to the corresponding TypeScript type name from @elek-io/core.
 */
function getValueTypeName(valueType: ValueType): string {
  switch (valueType) {
    case 'string':
      return 'DirectStringValue';
    case 'number':
      return 'DirectNumberValue';
    case 'boolean':
      return 'DirectBooleanValue';
    case 'reference':
      return 'ReferencedValue';
    case 'component':
      return 'ComponentValue';
    case 'mdast':
      return 'MdAstValue';
  }
}

/**
 * Maps a valueType to a narrowed type string with project-scoped language keys.
 * Uses `Omit + &` to override the `content` field with `Record<ProjectLanguage, T>`.
 *
 * Typed parameter (not `string`) so adding a new `valueType` is a
 * compile-time error here until every case is handled.
 */
function getNarrowedValueType(valueType: ValueType): string {
  switch (valueType) {
    case 'string':
      return `Omit<DirectStringValue, 'content'> & { content: Record<ProjectLanguage, string> }`;
    case 'number':
      return `Omit<DirectNumberValue, 'content'> & { content: Record<ProjectLanguage, number> }`;
    case 'boolean':
      return `Omit<DirectBooleanValue, 'content'> & { content: Record<ProjectLanguage, boolean> }`;
    case 'reference':
      return 'ReferencedValue';
    case 'component':
      return 'ComponentValue';
    case 'mdast':
      // Broad narrowing: content is per-language MdAstRoot | null. The
      // per-field feature config (which node types are allowed) is
      // emitted as a literal in the fieldDefinitions tuple instead — see
      // writeFieldDefinitionNarrowing's markdown branch. Consumer
      // renderers walk the tree with the broad MdAst* types; the schema
      // layer guarantees disallowed node types never reach disk.
      return `Omit<MdAstValue, 'content'> & { content: Record<ProjectLanguage, MdAstRoot | null> }`;
  }
}

/**
 * Maps a fieldType + valueType to the corresponding FieldDefinition subtype name.
 */
function getFieldDefinitionTypeName(fieldDefinition: FieldDefinition): string {
  switch (fieldDefinition.fieldType) {
    case 'text':
      return 'TextFieldDefinition';
    case 'textarea':
      return 'TextareaFieldDefinition';
    case 'email':
      return 'EmailFieldDefinition';
    case 'url':
      return 'UrlFieldDefinition';
    case 'ipv4':
      return 'Ipv4FieldDefinition';
    case 'date':
      return 'DateFieldDefinition';
    case 'time':
      return 'TimeFieldDefinition';
    case 'datetime':
      return 'DatetimeFieldDefinition';
    case 'telephone':
      return 'TelephoneFieldDefinition';
    case 'number':
      return 'NumberFieldDefinition';
    case 'range':
      return 'RangeFieldDefinition';
    case 'toggle':
      return 'ToggleFieldDefinition';
    case 'select':
      return fieldDefinition.valueType === 'number'
        ? 'NumberSelectFieldDefinition'
        : 'StringSelectFieldDefinition';
    case 'asset':
      return 'AssetFieldDefinition';
    case 'entry':
      return 'EntryFieldDefinition';
    case 'dynamic':
      return 'DynamicFieldDefinition';
    case 'markdown':
      return 'MarkdownFieldDefinition';
  }
}

/**
 * Collects all FieldDefinition subtype names used across field definitions,
 * so we only import what's needed.
 */
function collectUsedFieldDefinitionTypes(
  fieldDefinitions: FieldDefinition[]
): Set<string> {
  const types = new Set<string>();
  for (const fieldDefinition of fieldDefinitions) {
    types.add(getFieldDefinitionTypeName(fieldDefinition));
  }
  return types;
}

/**
 * Collects all value type names used across field definitions.
 * Excludes `ComponentValue`: dynamic fields are emitted as inlined envelope
 * shapes referencing per-field discriminated unions, not as the broad type.
 */
function collectUsedValueTypes(
  fieldDefinitions: FieldDefinition[]
): Set<string> {
  const types = new Set<string>();
  for (const fieldDefinition of fieldDefinitions) {
    if (fieldDefinition.valueType === 'component') continue;
    types.add(getValueTypeName(fieldDefinition.valueType));
  }
  return types;
}

/**
 * Renders a single MarkdownFeatures value as a TypeScript literal. Typed
 * by `keyof MarkdownFeatures` so adding a new feature flag is a TS error
 * here until handled — this is the single point that has to change when
 * the feature shape evolves.
 */
function markdownFeatureLiteral<K extends keyof MarkdownFeatures>(
  features: MarkdownFeatures,
  key: K
): string {
  const value = features[key];
  if (Array.isArray(value)) {
    return `[${value.map((v) => String(v)).join(', ')}]`;
  }
  return String(value);
}

/**
 * Writes the narrowed properties of a field definition as an intersection type.
 * Narrows structural properties to literals, keeps labels as TranslatableString.
 *
 * Uses explicit line-by-line writing instead of inlineBlock() to preserve
 * the parent indentation context from the caller.
 */
function writeFieldDefinitionNarrowing(
  writer: CodeBlockWriter,
  fieldDefinition: FieldDefinition,
  baseIndent: number
): void {
  writer.write(` & {`).newLine();
  writer
    .indent(baseIndent + 1)
    .write(`label: Record<ProjectLanguage, string>;`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`description: Record<ProjectLanguage, string> | null;`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`slug: '${fieldDefinition.slug}';`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`isRequired: ${fieldDefinition.isRequired};`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`isDisabled: ${fieldDefinition.isDisabled};`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`isUnique: ${fieldDefinition.isUnique};`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`inputWidth: '${fieldDefinition.inputWidth}';`)
    .newLine();

  // defaultValue - present on direct fields
  if ('defaultValue' in fieldDefinition) {
    if (fieldDefinition.defaultValue === null) {
      writer
        .indent(baseIndent + 1)
        .write(`defaultValue: null;`)
        .newLine();
    } else if (typeof fieldDefinition.defaultValue === 'string') {
      writer
        .indent(baseIndent + 1)
        .write(
          `defaultValue: '${escapeForSingleQuotedString(fieldDefinition.defaultValue)}';`
        )
        .newLine();
    } else if (typeof fieldDefinition.defaultValue === 'object') {
      // mdast root tree. Emit the broad node type instead of serialising the
      // whole literal tree, matching the broad mdast posture in
      // getNarrowedValueType. MdAstRoot is imported whenever a markdown field
      // is present.
      writer
        .indent(baseIndent + 1)
        .write(`defaultValue: MdAstRoot;`)
        .newLine();
    } else {
      // number | boolean
      writer
        .indent(baseIndent + 1)
        .write(`defaultValue: ${fieldDefinition.defaultValue};`)
        .newLine();
    }
  }

  // min / max - present on text, number, range, asset, entry, dynamic
  if ('min' in fieldDefinition) {
    writer
      .indent(baseIndent + 1)
      .write(`min: ${fieldDefinition.min};`)
      .newLine();
  }
  if ('max' in fieldDefinition) {
    writer
      .indent(baseIndent + 1)
      .write(`max: ${fieldDefinition.max};`)
      .newLine();
  }

  // Select options - narrow values to literals
  if ('options' in fieldDefinition && Array.isArray(fieldDefinition.options)) {
    writer
      .indent(baseIndent + 1)
      .write(`options: [`)
      .newLine();
    for (const option of fieldDefinition.options) {
      const value =
        typeof option.value === 'string'
          ? `'${escapeForSingleQuotedString(option.value)}'`
          : option.value;
      writer
        .indent(baseIndent + 2)
        .write(`{ value: ${value}; label: Record<ProjectLanguage, string> },`)
        .newLine();
    }
    writer
      .indent(baseIndent + 1)
      .write(`];`)
      .newLine();
  }

  // ofCollections - for entry fields
  if (
    'ofCollections' in fieldDefinition &&
    Array.isArray(fieldDefinition.ofCollections)
  ) {
    writer
      .indent(baseIndent + 1)
      .write(
        `ofCollections: [${fieldDefinition.ofCollections.map((id) => `'${id}'`).join(', ')}];`
      )
      .newLine();
  }

  // ofComponents - for dynamic fields
  if (
    'ofComponents' in fieldDefinition &&
    Array.isArray(fieldDefinition.ofComponents)
  ) {
    writer
      .indent(baseIndent + 1)
      .write(
        `ofComponents: [${fieldDefinition.ofComponents.map((id) => `'${id}'`).join(', ')}];`
      )
      .newLine();
  }

  // ofAssetMimeTypes - for asset reference fields and markdown fields
  if (
    'ofAssetMimeTypes' in fieldDefinition &&
    Array.isArray(fieldDefinition.ofAssetMimeTypes)
  ) {
    writer
      .indent(baseIndent + 1)
      .write(
        `ofAssetMimeTypes: [${fieldDefinition.ofAssetMimeTypes.map((m) => `'${escapeForSingleQuotedString(m)}'`).join(', ')}];`
      )
      .newLine();
  }

  // features - for markdown fields. Emit each key as a literal so
  // consumers can introspect at compile time (e.g.
  // `if (fieldDef.features.assetReferences) { renderAssetRef(...) }`).
  if (fieldDefinition.fieldType === 'markdown') {
    const { features } = fieldDefinition;
    writer
      .indent(baseIndent + 1)
      .write(`features: {`)
      .newLine();
    // Sort keys for stable output across regenerations. Cast to the typed
    // key array so adding a new MarkdownFeatures flag is a TS error here.
    const keys = (
      Object.keys(features) as Array<keyof MarkdownFeatures>
    ).sort();
    for (const key of keys) {
      writer
        .indent(baseIndent + 2)
        .write(`${key}: ${markdownFeatureLiteral(features, key)};`)
        .newLine();
    }
    writer
      .indent(baseIndent + 1)
      .write(`};`)
      .newLine();
  }

  writer.indent(baseIndent).write(`}`);
}

/**
 * Writes a single field definition type entry within a tuple.
 * @param baseIndent - the indentation level of this entry within the tuple
 */
function writeFieldDefinitionTupleEntry(
  writer: CodeBlockWriter,
  fieldDefinition: FieldDefinition,
  baseIndent: number
): void {
  writer.write(`${getFieldDefinitionTypeName(fieldDefinition)}`);
  writeFieldDefinitionNarrowing(writer, fieldDefinition, baseIndent);
  writer.write(`,`);
  writer.newLine();
}

/**
 * Emits a discriminated union type for a dynamic field.
 * Used by both the Collection pass and the Component pass.
 * Throws if `ofComponents` references a Component not present in the project.
 */
function writeDynamicFieldItemUnion(
  writer: CodeBlockWriter,
  ownerPascalName: string,
  fieldDefinition: DynamicFieldDefinition,
  ctx: ComponentsContext
): string {
  const fieldPascal = toPascalCase(fieldDefinition.slug);
  const typeName = `${ownerPascalName}${fieldPascal}Item`;
  const componentIds = resolveOfComponents(fieldDefinition, ctx.allIds);

  writer.writeLine(
    `/** Discriminated union for dynamic field '${fieldDefinition.slug}' */`
  );
  writer.write(`export type ${typeName} =`).newLine();
  if (componentIds.length === 0) {
    // Open `ofComponents` with no Components in the Project: no item can ever
    // satisfy the field, so the union has no members. Emit `never` to keep the
    // type alias well-formed, mirroring the runtime schema's z.never().
    writer.indent(1).write('never;').newLine();
  } else {
    for (const [i, componentId] of componentIds.entries()) {
      const component = ctx.componentMap.get(componentId);
      if (!component) {
        throw new Error(
          `Component "${componentId}" referenced by dynamic field "${fieldDefinition.slug}" not found in Project`
        );
      }
      const compPascal = toPascalCase(component.slug);
      const separator = i < componentIds.length - 1 ? '' : ';';
      writer
        .indent(1)
        .write(
          `| { id: string; componentId: typeof ${compPascal}ComponentId; values: ${compPascal}ComponentValues }${separator}`
        )
        .newLine();
    }
  }
  writer.blankLine();
  return typeName;
}

/**
 * Writes a single property line for a values interface. Handles both the
 * direct/reference case (`prop: NarrowedType;`) and the dynamic case
 * (inlined envelope referencing the prefixed Item type).
 */
function writeValuesProperty(
  writer: CodeBlockWriter,
  fieldDefinition: FieldDefinition,
  ownerPascalName: string
): void {
  const isRequired = fieldDefinition.isRequired ? ', required' : '';
  writer
    .indent(1)
    .write(
      `/** ${fieldDefinition.slug} (${fieldDefinition.fieldType}, ${fieldDefinition.valueType}${isRequired}) */`
    )
    .newLine();

  const propName = fieldDefinition.slug.includes('-')
    ? `'${fieldDefinition.slug}'`
    : fieldDefinition.slug;

  if (fieldDefinition.valueType === 'component') {
    const fieldPascal = toPascalCase(fieldDefinition.slug);
    const itemTypeName = `${ownerPascalName}${fieldPascal}Item`;
    writer.indent(1).write(`${propName}: {`).newLine();
    writer.indent(2).write(`objectType: 'value';`).newLine();
    writer.indent(2).write(`valueType: 'component';`).newLine();
    writer.indent(2).write(`content: ${itemTypeName}[];`).newLine();
    writer.indent(1).write(`};`).newLine();
  } else {
    writer
      .indent(1)
      .write(`${propName}: ${getNarrowedValueType(fieldDefinition.valueType)};`)
      .newLine();
  }
}

/**
 * Generates the types file content for a single project.
 */
export async function generateTypesForProject(
  project: Project
): Promise<string> {
  const writer = new CodeBlockWriter({
    newLine: '\n',
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true,
  });

  // Load all collections and components
  const { list: collections } = await core.collections.list({
    projectId: project.id,
    limit: 0,
  });
  const { list: components } = await core.components.list({
    projectId: project.id,
    limit: 0,
  });

  // Build component lookup context for dynamic field typing
  const ctx = makeComponentsContext(components);

  // Collect all used types for imports
  const allFieldDefs: FieldDefinition[] = [];
  for (const collection of collections) {
    allFieldDefs.push(...flattenFieldDefinitions(collection.fieldDefinitions));
  }
  for (const component of components) {
    allFieldDefs.push(...component.fieldDefinitions);
  }

  const usedValueTypes = collectUsedValueTypes(allFieldDefs);
  const usedFieldDefinitionTypes =
    collectUsedFieldDefinitionTypes(allFieldDefs);

  // Header
  writer.writeLine(AUTO_GENERATED_HEADER);
  writer.blankLine();

  // Imports
  const coreImports: string[] = ['Entry', 'Collection', 'Component'];
  for (const valueType of usedValueTypes) {
    if (!coreImports.includes(valueType)) coreImports.push(valueType);
  }
  for (const fieldDefinitionType of usedFieldDefinitionTypes) {
    if (!coreImports.includes(fieldDefinitionType))
      coreImports.push(fieldDefinitionType);
  }

  // Always import FieldDefinitionGroup if any collection uses groups
  const hasGroups = collections.some((collection) =>
    collection.fieldDefinitions.some(
      (fieldDefinitionOrGroup) => 'isGroup' in fieldDefinitionOrGroup
    )
  );
  if (hasGroups && !coreImports.includes('FieldDefinitionGroup')) {
    coreImports.push('FieldDefinitionGroup');
  }

  // `MdAstRoot` is referenced inside the narrowed mdast value type
  // (`Record<ProjectLanguage, MdAstRoot | null>`) emitted by
  // `getNarrowedValueType('mdast')`. Add to imports when any markdown
  // field is present.
  const hasMarkdownField = allFieldDefs.some(
    (fieldDef) => fieldDef.valueType === 'mdast'
  );
  if (hasMarkdownField && !coreImports.includes('MdAstRoot')) {
    coreImports.push('MdAstRoot');
  }

  writer.writeLine(`import type {`);
  for (const coreImport of coreImports) {
    writer.indent(1).write(`${coreImport},`).newLine();
  }
  writer.writeLine(`} from '@elek-io/core';`);
  writer.blankLine();

  // Project ID
  writer.writeLine(`// ─── Project ───`);
  writer.blankLine();
  writer.writeLine(`export const ProjectId = '${project.id}' as const;`);
  writer.blankLine();

  // Project Language type - narrowed to this project's supported languages
  const languageUnion = project.settings.language.supported
    .map((language) => `'${language}'`)
    .join(' | ');
  writer.writeLine(`export type ProjectLanguage = ${languageUnion};`);
  writer.blankLine();

  // Components
  if (components.length > 0) {
    writer.writeLine(`// ─── Components ───`);
    writer.blankLine();

    for (const component of components) {
      const pascalName = toPascalCase(component.slug);

      // ID constant
      writer.writeLine(
        `/** Component: ${Object.values(component.name).find((v) => v) || component.slug} (${component.slug}) */`
      );
      writer.writeLine(
        `export const ${pascalName}ComponentId = '${component.id}' as const;`
      );
      writer.blankLine();

      // Per-field discriminated unions for any nested dynamic fields
      for (const fieldDefinition of component.fieldDefinitions) {
        if (fieldDefinition.valueType === 'component') {
          writeDynamicFieldItemUnion(writer, pascalName, fieldDefinition, ctx);
        }
      }

      // Values interface
      writer.writeLine(`export interface ${pascalName}ComponentValues {`);
      for (const fieldDefinition of component.fieldDefinitions) {
        writeValuesProperty(writer, fieldDefinition, pascalName);
      }
      writer.writeLine(`}`);
      writer.blankLine();

      // Component wrapper with narrowed fieldDefinitions and project-scoped language types
      writer.writeLine(
        `export type ${pascalName}Component = Omit<Component, 'name' | 'description' | 'fieldDefinitions'> & {`
      );
      writer
        .indent(1)
        .write(`name: Record<ProjectLanguage, string>;`)
        .newLine();
      writer
        .indent(1)
        .write(`description: Record<ProjectLanguage, string> | null;`)
        .newLine();
      writer.indent(1).write(`fieldDefinitions: [`).newLine();
      for (const fieldDefinition of component.fieldDefinitions) {
        writer.indent(2);
        writeFieldDefinitionTupleEntry(writer, fieldDefinition, 2);
      }
      writer.indent(1).write(`];`).newLine();
      writer.writeLine(`}`);
      writer.blankLine();
    }
  }

  // Collections
  if (collections.length > 0) {
    writer.writeLine(`// ─── Collections ───`);
    writer.blankLine();

    for (const collection of collections) {
      const pascalName = toPascalCase(collection.slug.plural);
      const flatFieldDefinitions = flattenFieldDefinitions(
        collection.fieldDefinitions
      );

      // ID constant
      const collectionName =
        Object.values(collection.name.singular).find((v) => v) ||
        collection.slug.singular;
      writer.writeLine(
        `/** Collection: ${collectionName} (${collection.slug.singular}) */`
      );
      writer.writeLine(
        `export const ${pascalName}CollectionId = '${collection.id}' as const;`
      );
      writer.blankLine();

      // Dynamic field item types (discriminated unions for component fields)
      for (const fieldDefinition of flatFieldDefinitions) {
        if (fieldDefinition.valueType === 'component') {
          writeDynamicFieldItemUnion(writer, pascalName, fieldDefinition, ctx);
        }
      }

      // Values interface
      writer.writeLine(`export interface ${pascalName}Values {`);
      for (const fieldDefinition of flatFieldDefinitions) {
        writeValuesProperty(writer, fieldDefinition, pascalName);
      }
      writer.writeLine(`}`);
      writer.blankLine();

      // Entry type (using Omit + intersection to avoid index signature conflict with Record<string, Value>)
      writer.writeLine(
        `export type ${pascalName}Entry = Omit<Entry, 'values'> & {`
      );
      writer.indent(1).write(`values: ${pascalName}Values;`).newLine();
      writer.writeLine(`};`);
      writer.blankLine();

      // Collection wrapper with narrowed fieldDefinitions and project-scoped language types
      writer.writeLine(
        `export type ${pascalName}Collection = Omit<Collection, 'name' | 'description' | 'fieldDefinitions'> & {`
      );
      writer
        .indent(1)
        .write(
          `name: { singular: Record<ProjectLanguage, string>; plural: Record<ProjectLanguage, string> };`
        )
        .newLine();
      writer
        .indent(1)
        .write(`description: Record<ProjectLanguage, string>;`)
        .newLine();
      writer.indent(1).write(`fieldDefinitions: [`).newLine();
      for (const fieldDefinitionOrGroup of collection.fieldDefinitions) {
        if ('isGroup' in fieldDefinitionOrGroup) {
          // FieldDefinitionGroup
          writer.indent(2).write(`FieldDefinitionGroup & {`).newLine();
          writer.indent(3).write(`isGroup: true;`).newLine();
          writer
            .indent(3)
            .write(`label: Record<ProjectLanguage, string>;`)
            .newLine();
          writer
            .indent(3)
            .write(`description: Record<ProjectLanguage, string> | null;`)
            .newLine();
          writer.indent(3).write(`fieldDefinitions: [`).newLine();
          for (const fieldDefinition of fieldDefinitionOrGroup.fieldDefinitions) {
            writer.indent(4);
            writeFieldDefinitionTupleEntry(writer, fieldDefinition, 4);
          }
          writer.indent(3).write(`];`).newLine();
          writer.indent(2).write(`},`).newLine();
        } else {
          writer.indent(2);
          writeFieldDefinitionTupleEntry(writer, fieldDefinitionOrGroup, 2);
        }
      }
      writer.indent(1).write(`];`).newLine();
      writer.writeLine(`}`);
      writer.blankLine();
    }
  }

  return writer.toString();
}

/**
 * Generates type files for the given projects into the output directory.
 * Returns a map of project ID -> output file path (relative to outDir).
 */
export async function generateTypes({
  outDir,
  projects,
}: Omit<GenerateTypesProps, 'options' | 'language'>): Promise<
  Map<string, string>
> {
  const resolvedOutDir = Path.resolve(outDir);
  await Fs.ensureDir(resolvedOutDir);

  const projectsToGenerate: Project[] = [];

  if (projects === 'all') {
    const { list } = await core.projects.list({ limit: 0 });
    projectsToGenerate.push(...list);
  } else {
    for (const projectId of projects) {
      const project = await core.projects.read({ id: projectId });
      projectsToGenerate.push(project);
    }
  }

  const result = new Map<string, string>();

  for (const project of projectsToGenerate) {
    const startedAt = Date.now();
    const content = await generateTypesForProject(project);
    const fileName =
      projectsToGenerate.length === 1 ? 'types.ts' : `types-${project.id}.ts`;
    const outFile = Path.join(resolvedOutDir, fileName);

    await Fs.writeFile(outFile, content);
    result.set(project.id, fileName);

    const duration = Date.now() - startedAt;
    core.logger.info({
      source: 'core',
      message: `Generated types in "${outFile}" in ${duration}ms`,
    });
  }

  return result;
}

async function generateTypesAs({
  outDir,
  language,
  projects,
}: Omit<GenerateTypesProps, 'options'>) {
  const typesMap = await generateTypes({ outDir, projects });

  if (language === 'js') {
    const startedAt = Date.now();
    const resolvedOutDir = Path.resolve(outDir);

    // Convert file paths into POSIX-style (forward slashes - even on Windows),
    // since tsdown treats these as glob patterns
    // @see https://tsdown.dev/options/entry#using-glob-patterns
    const toPosix = (p: string) => p.split(Path.sep).join(Path.posix.sep);

    const tsFiles = [...typesMap.values()].map((fileName) =>
      Path.join(resolvedOutDir, fileName)
    );
    const normalizedEntries = tsFiles.map(toPosix);

    await compileToJs({
      config: false,
      external: ['@elek-io/core'],
      entry: normalizedEntries,
      outDir: resolvedOutDir,
      format: 'esm',
      platform: 'neutral',
      clean: false,
      dts: true,
    });

    // Remove the generated TS sources after compiling to JS
    for (const tsFile of tsFiles) {
      await Fs.remove(tsFile);
    }
    const duration = Date.now() - startedAt;
    core.logger.info({
      source: 'core',
      message: `Compiled types to JavaScript in ${duration}ms`,
    });
  }
}

export const generateTypesAction = async ({
  outDir,
  language,
  projects,
  options,
}: GenerateTypesProps) => {
  try {
    await generateTypesAs({ outDir, language, projects });

    if (options.watch === true) {
      core.logger.info({
        source: 'core',
        message: 'Watching for changes to regenerate types',
      });

      watchProjects().on('all', (event, path) => {
        core.logger.info({
          source: 'core',
          message: `Regenerating types due to ${event} on "${path}"`,
        });
        void generateTypesAs({ outDir, language, projects });
      });
    }
  } catch (error) {
    console.error(error instanceof CoreError ? error.message : String(error));
    process.exit(1);
  }
};
