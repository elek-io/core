import { build as compileToJs } from 'tsdown';
import Path from 'node:path';
import Fs from 'fs-extra';
import CodeBlockWriter from 'code-block-writer';
import {
  flattenFieldDefinitions,
  type Component,
  type FieldDefinition,
  type Project,
  type GenerateTypesProps,
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
function getValueTypeName(valueType: string): string {
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
    default:
      return 'Value';
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
  for (const fd of fieldDefinitions) {
    types.add(getFieldDefinitionTypeName(fd));
  }
  return types;
}

/**
 * Collects all value type names used across field definitions.
 */
function collectUsedValueTypes(
  fieldDefinitions: FieldDefinition[]
): Set<string> {
  const types = new Set<string>();
  for (const fd of fieldDefinitions) {
    types.add(getValueTypeName(fd.valueType));
  }
  return types;
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
  fd: FieldDefinition,
  baseIndent: number
): void {
  writer.write(` & {`).newLine();
  writer
    .indent(baseIndent + 1)
    .write(`slug: '${fd.slug}';`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`isRequired: ${fd.isRequired};`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`isDisabled: ${fd.isDisabled};`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`isUnique: ${fd.isUnique};`)
    .newLine();
  writer
    .indent(baseIndent + 1)
    .write(`inputWidth: '${fd.inputWidth}';`)
    .newLine();

  // defaultValue - present on direct fields
  if ('defaultValue' in fd) {
    const dv = fd.defaultValue;
    if (dv === null) {
      writer
        .indent(baseIndent + 1)
        .write(`defaultValue: null;`)
        .newLine();
    } else if (typeof dv === 'string') {
      writer
        .indent(baseIndent + 1)
        .write(`defaultValue: '${escapeForSingleQuotedString(dv)}';`)
        .newLine();
    } else {
      writer
        .indent(baseIndent + 1)
        .write(`defaultValue: ${dv};`)
        .newLine();
    }
  }

  // min / max - present on text, number, range, asset, entry, dynamic
  if ('min' in fd) {
    writer
      .indent(baseIndent + 1)
      .write(`min: ${fd.min};`)
      .newLine();
  }
  if ('max' in fd) {
    writer
      .indent(baseIndent + 1)
      .write(`max: ${fd.max};`)
      .newLine();
  }

  // Select options - narrow values to literals
  if ('options' in fd && Array.isArray(fd.options)) {
    writer
      .indent(baseIndent + 1)
      .write(`options: [`)
      .newLine();
    for (const opt of fd.options) {
      const val =
        typeof opt.value === 'string'
          ? `'${escapeForSingleQuotedString(opt.value)}'`
          : opt.value;
      writer
        .indent(baseIndent + 2)
        .write(`{ value: ${val}; label: TranslatableString },`)
        .newLine();
    }
    writer
      .indent(baseIndent + 1)
      .write(`];`)
      .newLine();
  }

  // ofCollections - for entry fields
  if ('ofCollections' in fd && Array.isArray(fd.ofCollections)) {
    writer
      .indent(baseIndent + 1)
      .write(
        `ofCollections: [${fd.ofCollections.map((id) => `'${id}'`).join(', ')}];`
      )
      .newLine();
  }

  // ofComponents - for dynamic fields
  if ('ofComponents' in fd && Array.isArray(fd.ofComponents)) {
    writer
      .indent(baseIndent + 1)
      .write(
        `ofComponents: [${fd.ofComponents.map((id) => `'${id}'`).join(', ')}];`
      )
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
  fd: FieldDefinition,
  baseIndent: number
): void {
  writer.write(`${getFieldDefinitionTypeName(fd)}`);
  writeFieldDefinitionNarrowing(writer, fd, baseIndent);
  writer.write(`,`);
  writer.newLine();
}

/**
 * Generates the types file content for a single project.
 */
async function generateTypesForProject(project: Project): Promise<string> {
  const writer = new CodeBlockWriter({
    newLine: '\n',
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true,
  });

  // Load all collections and components
  const collectionsResult = await core.collections.list({ projectId: project.id, limit: 0 });
  if (collectionsResult.isErr()) {
    console.error(collectionsResult.error.message);
    process.exit(1);
  }
  const collections = collectionsResult.value.list;
  const componentsResult = await core.components.list({ projectId: project.id, limit: 0 });
  if (componentsResult.isErr()) {
    console.error(componentsResult.error.message);
    process.exit(1);
  }
  const components = componentsResult.value.list;

  // Build component map for dynamic field typing
  const componentMap = new Map<string, Component>();
  for (const component of components) {
    componentMap.set(component.id, component);
  }

  // Collect all used types for imports
  const allFieldDefs: FieldDefinition[] = [];
  for (const collection of collections) {
    allFieldDefs.push(...flattenFieldDefinitions(collection.fieldDefinitions));
  }
  for (const component of components) {
    allFieldDefs.push(...component.fieldDefinitions);
  }

  const usedValueTypes = collectUsedValueTypes(allFieldDefs);
  const usedFdTypes = collectUsedFieldDefinitionTypes(allFieldDefs);

  // Header
  writer.writeLine(AUTO_GENERATED_HEADER);
  writer.blankLine();

  // Imports
  const coreImports: string[] = ['Entry', 'Collection', 'Component'];
  for (const vt of usedValueTypes) {
    if (!coreImports.includes(vt)) coreImports.push(vt);
  }
  for (const fdt of usedFdTypes) {
    if (!coreImports.includes(fdt)) coreImports.push(fdt);
  }

  // Always import TranslatableString since it's used in field definition groups
  if (!coreImports.includes('TranslatableString')) {
    coreImports.push('TranslatableString');
  }
  // Always import FieldDefinitionGroup if any collection uses groups
  const hasGroups = collections.some((c) =>
    c.fieldDefinitions.some((fdOrGroup) => 'isGroup' in fdOrGroup)
  );
  if (hasGroups && !coreImports.includes('FieldDefinitionGroup')) {
    coreImports.push('FieldDefinitionGroup');
  }

  writer.writeLine(`import type {`);
  for (const imp of coreImports) {
    writer.indent(1).write(`${imp},`).newLine();
  }
  writer.writeLine(`} from '@elek-io/core';`);
  writer.blankLine();

  // Project ID
  writer.writeLine(`// ─── Project ───`);
  writer.blankLine();
  writer.writeLine(`export const ProjectId = '${project.id}' as const;`);
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

      // Values interface
      writer.writeLine(`export interface ${pascalName}ComponentValues {`);
      for (const fd of component.fieldDefinitions) {
        const isRequired = fd.isRequired ? ', required' : '';
        writer
          .indent(1)
          .write(
            `/** ${fd.slug} (${fd.fieldType}, ${fd.valueType}${isRequired}) */`
          )
          .newLine();

        const propName = fd.slug.includes('-') ? `'${fd.slug}'` : fd.slug;

        if (fd.valueType === 'component') {
          // Dynamic field within component - type as ComponentValue for simplicity
          // (deeply nested component typing would require recursive generation)
          writer.indent(1).write(`${propName}: ComponentValue;`).newLine();
        } else {
          writer
            .indent(1)
            .write(`${propName}: ${getValueTypeName(fd.valueType)};`)
            .newLine();
        }
      }
      writer.writeLine(`}`);
      writer.blankLine();

      // Component wrapper with narrowed fieldDefinitions
      writer.writeLine(
        `export interface ${pascalName}Component extends Component {`
      );
      writer.indent(1).write(`fieldDefinitions: [`).newLine();
      for (const fd of component.fieldDefinitions) {
        writer.indent(2);
        writeFieldDefinitionTupleEntry(writer, fd, 2);
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
      const flatFieldDefs = flattenFieldDefinitions(
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
      for (const fd of flatFieldDefs) {
        if (fd.valueType === 'component') {
          const fieldPascal = toPascalCase(fd.slug);
          const typeName = `${pascalName}${fieldPascal}Item`;

          // Resolve component IDs
          const componentIds =
            fd.ofComponents.length > 0
              ? fd.ofComponents
              : components.map((c) => c.id);

          writer.writeLine(
            `/** Discriminated union for dynamic field '${fd.slug}' */`
          );
          writer.write(`export type ${typeName} =`).newLine();
          for (const [i, cid] of componentIds.entries()) {
            const comp = componentMap.get(cid);
            if (!comp) continue;
            const compPascal = toPascalCase(comp.slug);
            const separator = i < componentIds.length - 1 ? '' : ';';
            writer
              .indent(1)
              .write(
                `| { componentId: typeof ${compPascal}ComponentId; values: ${compPascal}ComponentValues }${separator}`
              )
              .newLine();
          }
          writer.blankLine();
        }
      }

      // Values interface
      writer.writeLine(`export interface ${pascalName}Values {`);
      for (const fd of flatFieldDefs) {
        const isRequired = fd.isRequired ? ', required' : '';
        writer
          .indent(1)
          .write(
            `/** ${fd.slug} (${fd.fieldType}, ${fd.valueType}${isRequired}) */`
          )
          .newLine();

        const propName = fd.slug.includes('-') ? `'${fd.slug}'` : fd.slug;

        if (fd.valueType === 'component') {
          const fieldPascal = toPascalCase(fd.slug);
          const itemTypeName = `${pascalName}${fieldPascal}Item`;
          writer.indent(1).write(`${propName}: {`).newLine();
          writer.indent(2).write(`objectType: 'value';`).newLine();
          writer.indent(2).write(`valueType: 'component';`).newLine();
          writer.indent(2).write(`content: ${itemTypeName}[];`).newLine();
          writer.indent(1).write(`};`).newLine();
        } else {
          writer
            .indent(1)
            .write(`${propName}: ${getValueTypeName(fd.valueType)};`)
            .newLine();
        }
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

      // Collection wrapper with narrowed fieldDefinitions (preserving groups)
      writer.writeLine(
        `export interface ${pascalName}Collection extends Collection {`
      );
      writer.indent(1).write(`fieldDefinitions: [`).newLine();
      for (const fdOrGroup of collection.fieldDefinitions) {
        if ('isGroup' in fdOrGroup) {
          // FieldDefinitionGroup
          writer.indent(2).write(`FieldDefinitionGroup & {`).newLine();
          writer.indent(3).write(`isGroup: true;`).newLine();
          writer.indent(3).write(`fieldDefinitions: [`).newLine();
          for (const fd of fdOrGroup.fieldDefinitions) {
            writer.indent(4);
            writeFieldDefinitionTupleEntry(writer, fd, 4);
          }
          writer.indent(3).write(`];`).newLine();
          writer.indent(2).write(`},`).newLine();
        } else {
          writer.indent(2);
          writeFieldDefinitionTupleEntry(writer, fdOrGroup, 2);
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
    const projectsListResult = await core.projects.list({ limit: 0 });
    if (projectsListResult.isErr()) {
      console.error(projectsListResult.error.message);
      process.exit(1);
    }
    projectsToGenerate.push(...projectsListResult.value.list);
  } else {
    for (const projectId of projects) {
      const projectResult = await core.projects.read({ id: projectId });
      if (projectResult.isErr()) {
        console.error(projectResult.error.message);
        process.exit(1);
      }
      projectsToGenerate.push(projectResult.value);
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
};
