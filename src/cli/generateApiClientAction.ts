import { build as compileToJs } from 'tsdown';
import type { GenerateApiClientProps } from '../schema/index.js';
import {
  core,
  watchProjects,
  AUTO_GENERATED_HEADER,
  toPascalCase,
} from './index.js';
import { generateTypes } from './generateTypesAction.js';
import Path from 'node:path';
import Fs from 'fs-extra';
import CodeBlockWriter from 'code-block-writer';
import assert from 'node:assert';
import {
  flattenFieldDefinitions,
  type Collection,
  type Project,
} from '../index.node.js';

/**
 * API Client generator
 *
 * Generates an API client with full type safety in given folder
 * based on the locally available Projects, Collections and Entries.
 * Uses a generated schema based on the field definitions
 * of Collections to provide correct types for available Entries.
 *
 * @example
 * Usage: Import the generated client and use it to access the local content API
 *
 * ```ts
 * import { apiClient } from './.elek.io/client.js';
 *
 * const client = await apiClient({
 *   baseUrl: 'http://localhost:31310',
 *   apiKey: '<token>'
 * }).content.v1;
 *
 * const entries = await client
 *   .projects['d9920ad7-07b8-41c4-84f7-5d6babf0f800']
 *   .collections['blog-posts']
 *   .entries.list({
 *     limit: 10,
 *   })
 *
 * console.log(entries);
 * ```
 */
async function generateApiClient(
  outFile: string,
  typesMap: Map<string, string>
) {
  const startedAt = Date.now();
  const writer = new CodeBlockWriter({
    newLine: '\n',
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true,
  });

  // Pre-compute which entry types each types file provides,
  // so we can write the correct imports up front
  const projectsResult = await core.projects.list({ limit: 0 });
  if (projectsResult.isErr()) {
    console.error(projectsResult.error.message);
    process.exit(1);
  }
  const projects = projectsResult.value;
  const entryTypeImports = new Map<string, string[]>(); // typesFile -> entryTypeNames[]
  for (const project of projects.list) {
    const typesFile = typesMap.get(project.id);
    if (!typesFile) continue;

    const collectionsResult = await core.collections.list({
      projectId: project.id,
      limit: 0,
      offset: 0,
    });
    if (collectionsResult.isErr()) {
      console.error(collectionsResult.error.message);
      process.exit(1);
    }
    const collections = collectionsResult.value;
    const entryTypeNames = collections.list.map(
      (c) => `${toPascalCase(c.slug.plural)}Entry`
    );
    if (entryTypeNames.length > 0) {
      const existing = entryTypeImports.get(typesFile) ?? [];
      existing.push(...entryTypeNames);
      entryTypeImports.set(typesFile, existing);
    }
  }

  // Header
  writer.writeLine(AUTO_GENERATED_HEADER);
  writer.blankLine();

  // Import statements using schemas and types from Core
  writer.writeLine(
    `import { paginatedListOf, getEntrySchemaFromFieldDefinitions, paginationSchema, apiClientSchema, type PaginatedList, type PaginationProps, type ApiClientProps } from '@elek-io/core';`
  );

  // Import entry types for use in return type assertions,
  // and re-export all types for developer convenience
  const typesFileNames = [...typesMap.values()];
  if (typesFileNames.length === 1 && typesFileNames[0]) {
    const typesImport = typesFileNames[0].replace(/\.ts$/, '.js');
    // Import the entry types we reference in the function body
    const allEntryTypes = [...entryTypeImports.values()].flat();
    if (allEntryTypes.length > 0) {
      writer.writeLine(
        `import type { ${allEntryTypes.join(', ')} } from './${typesImport}';`
      );
    }
    // Re-export everything from the types file
    writer.writeLine(`export * from './${typesImport}';`);
  } else {
    // Multiple projects: import and re-export entry types from each file
    for (const [typesFile, entryTypes] of entryTypeImports) {
      const typesImport = typesFile.replace(/\.ts$/, '.js');
      writer.writeLine(
        `import type { ${entryTypes.join(', ')} } from './${typesImport}';`
      );
      writer.writeLine(
        `export type { ${entryTypes.join(', ')} } from './${typesImport}';`
      );
    }
  }
  writer.blankLine();

  // API client function
  writer.writeLine(`/**`);
  writer.writeLine(` * elek.io Client`);
  writer.writeLine(` * `);
  writer.writeLine(` * Used to access elek.io APIs.`);
  writer.writeLine(` */`);
  writer.writeLine(
    `export function apiClient({ baseUrl, apiKey }: ApiClientProps) {`
  );
  writer
    .indent(1)
    .write(`apiClientSchema.parse({ baseUrl, apiKey });`)
    .newLine();
  writer.blankLine();
  writer.indent(1).write(`return {`).newLine();
  writer.indent(2).write(`content: {`).newLine();
  writer.indent(3).write(`v1: {`).newLine();
  writer.indent(4).write(`projects: {`).newLine();
  await writeProjectsObject(writer);
  writer.indent(4).write(`}`).newLine();
  writer.indent(3).write(`}`).newLine();
  writer.indent(2).write(`}`).newLine();
  writer.indent(1).write(`}`).newLine();
  writer.writeLine(`}`);

  await Fs.writeFile(outFile, writer.toString());
  const duration = Date.now() - startedAt;
  core.logger.info({
    source: 'core',
    message: `Generated API Client in "${outFile}" in ${duration}ms`,
  });
}

async function writeProjectsObject(writer: CodeBlockWriter) {
  const projectsResult = await core.projects.list({ limit: 0 });
  if (projectsResult.isErr()) {
    console.error(projectsResult.error.message);
    process.exit(1);
  }
  const projects = projectsResult.value;

  for (let index = 0; index < projects.list.length; index++) {
    const project = projects.list[index];
    assert(project, 'Project not found by index');

    writer.indent(1).quote(project.id).write(`: {`).newLine();
    writer.indent(2).write(`collections: {`).newLine();
    await writeCollectionsObject(writer, project);
    writer.indent(2).write(`},`).newLine();
    writer.indent(1).write(`},`).newLine();
  }
}

async function writeCollectionsObject(
  writer: CodeBlockWriter,
  project: Project
) {
  const collectionsResult = await core.collections.list({
    projectId: project.id,
    limit: 0,
  });
  if (collectionsResult.isErr()) {
    console.error(collectionsResult.error.message);
    process.exit(1);
  }
  const collections = collectionsResult.value;

  for (let index = 0; index < collections.list.length; index++) {
    const collection = collections.list[index];
    assert(collection, 'Collection not found by index');

    writer.indent(3).quote(collection.slug.plural).write(`: {`).newLine();
    writer.indent(4).write(`entries: {`).newLine();
    writeEntriesObject(writer, project, collection);
    writer.indent(4).write(`},`).newLine();
    writer.indent(3).write(`},`).newLine();
  }
}

function writeEntriesObject(
  writer: CodeBlockWriter,
  project: Project,
  collection: Collection
) {
  writer
    .indent(5)
    .write(`list: async (props?: PaginationProps) => {`)
    .newLine();
  writer.indent(6).write(`paginationSchema.parse(props);`).newLine();
  writer
    .indent(6)
    .write(
      `const entrySchema = paginatedListOf(getEntrySchemaFromFieldDefinitions(`
    )
    .newLine();
  writer.setIndentationLevel(6);
  writer.indent(() => {
    writer
      .write(
        JSON.stringify(
          flattenFieldDefinitions(collection.fieldDefinitions),
          null,
          2
        )
      )
      .newLine();
  });
  writer.setIndentationLevel(0);
  writer.indent(6).write(`));`).newLine();
  writer.blankLine();
  writeFetch(
    writer,
    `/content/v1/projects/${project.id}/collections/${collection.slug.plural}/entries`
  );
  writer.blankLine();
  // The Zod schema validates the shape at runtime, but its inferred type is wider
  // than the generated entry type - the double cast is safe because Zod guarantees
  // the data matches the schema, and the generated type is a strict narrowing of it.
  const entryTypeName = `${toPascalCase(collection.slug.plural)}Entry`;
  writer
    .indent(6)
    .write(
      `return entrySchema.parse(entries) as unknown as PaginatedList<${entryTypeName}>;`
    )
    .newLine();
  writer.indent(5).write(`},`).newLine();
}

function writeFetch(
  writer: CodeBlockWriter,
  to: string,
  method: Request['method'] = 'GET'
) {
  writer
    .write('const response = await fetch(`${baseUrl}')
    .write(to)
    .write('`, ')
    .block(() => {
      writer.writeLine(`method: '${method}',`);
      writer
        .write(`headers: `)
        .block(() => {
          writer.writeLine(`'Authorization': \`Bearer \${apiKey}\`,`);
          writer.writeLine(`'Content-Type': 'application/json'`);
        })
        .newLine();
    })
    .write(`);`)
    .newLine();
  writer.writeLine(`const entries = await response.json();`);
}

async function generateApiClientAs({
  outDir,
  language,
  format,
  target,
}: GenerateApiClientProps) {
  const resolvedOutDir = Path.resolve(outDir);
  await Fs.ensureDir(resolvedOutDir);

  // Generate types first, then import them in the client
  const typesMap = await generateTypes({ outDir, projects: 'all' });

  const outFileTs = Path.join(resolvedOutDir, 'client.ts');
  await generateApiClient(outFileTs, typesMap);

  if (language === 'js') {
    const startedAt = Date.now();
    // Convert file paths into POSIX-style (forward slashes - even on Windows),
    // since tsdown treats these as glob patterns
    // @see https://tsdown.dev/options/entry#using-glob-patterns
    const toPosix = (p: string) => p.split(Path.sep).join(Path.posix.sep);

    // Collect all generated TS files (client + types) as entry points
    const tsFiles = [outFileTs];
    for (const typesFileName of typesMap.values()) {
      tsFiles.push(Path.join(resolvedOutDir, typesFileName));
    }
    const normalizedEntries = tsFiles.map(toPosix);

    // Use tsdown to compile the generated TS files
    // to JS in the specified module format and target environment
    await compileToJs({
      config: false, // Do not use tsdown config file of Core
      external: ['@elek-io/core', 'zod'], // These are peer dependencies of the generated client
      entry: normalizedEntries,
      outDir: resolvedOutDir,
      format,
      target,
      platform: 'neutral',
      sourcemap: true,
      clean: false,
      dts: true,
      minify: true,
    });

    // Remove the generated TS sources after compiling to JS
    for (const tsFile of tsFiles) {
      await Fs.remove(tsFile);
    }
    const duration = Date.now() - startedAt;
    core.logger.info({
      source: 'core',
      message: `Compiled API Client and types to JavaScript in ${duration}ms`,
    });
  }
}

export const generateApiClientAction = async ({
  outDir,
  language,
  format,
  target,
  options,
}: GenerateApiClientProps) => {
  await generateApiClientAs({ outDir, language, format, target, options });

  if (options.watch === true) {
    core.logger.info({
      source: 'core',
      message: 'Watching for changes to regenerate the API Client',
    });

    watchProjects().on('all', (event, path) => {
      core.logger.info({
        source: 'core',
        message: `Regenerating API Client due to ${event} on "${path}"`,
      });
      void generateApiClientAs({ outDir, language, format, target, options });
    });
  }
};
