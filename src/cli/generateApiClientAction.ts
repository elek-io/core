import { build as compileToJs } from 'tsdown';
import {
  generateApiClientActionSchema,
  GenerateApiClientAsProps,
} from '../schema/cliSchema.js';
import { core, watchProjects } from './index.js';
import Path from 'path';
import Fs from 'fs-extra';
import CodeBlockWriter from 'code-block-writer';
import assert from 'assert';
import { Collection, Project } from '../index.node.js';

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
 * import { apiClient } from './.elek-io/client.js';
 *
 * const client = await apiClient({
 *   baseUrl: 'http://localhost:31310',
 *   apiKey: '<token>'
 * }).content.v1;
 *
 * const entries = await client
 *   .projects['d9920ad7-07b8-41c4-84f7-5d6babf0f800']
 *   .collections['7fc70100-82b3-41f8-b4de-705a84b0a95d']
 *   .entries.list({
 *     limit: 10,
 *   })
 *
 * console.log(entries);
 * ```
 */
async function generateApiClient(outFile: string) {
  const writer = new CodeBlockWriter({
    newLine: '\n',
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true,
  });

  // Import statements
  writer.writeLine(
    `import { paginatedListOf, getEntrySchemaFromFieldDefinitions } from '@elek-io/core';`
  );
  writer.writeLine(`import { z } from 'zod';`);
  writer.blankLine();

  // Schema definitions
  writer.writeLine(
    `const listSchema = z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional();`
  );
  writer.writeLine(`type ListProps = z.infer<typeof listSchema>;`);
  writer.blankLine();
  writer.writeLine(
    `const apiClientSchema = z.object({ baseUrl: z.url(), apiKey: z.string() });`
  );
  writer.writeLine(`type ApiClientProps = z.infer<typeof apiClientSchema>;`);
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
  core.logger.info(`Generated API Client in "${outFile}"`);
}

async function writeProjectsObject(writer: CodeBlockWriter) {
  const projects = await core.projects.list({ limit: 0, offset: 0 });

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
  const collections = await core.collections.list({
    projectId: project.id,
    limit: 0,
    offset: 0,
  });

  for (let index = 0; index < collections.list.length; index++) {
    const collection = collections.list[index];
    assert(collection, 'Collection not found by index');

    writer.indent(3).quote(collection.id).write(`: {`).newLine();
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
  writer.indent(5).write(`list: async (props?: ListProps) => {`).newLine();
  writer.indent(6).write(`listSchema.parse(props);`).newLine();
  writer
    .indent(6)
    .write(
      `const entrySchema = paginatedListOf(getEntrySchemaFromFieldDefinitions(`
    )
    .newLine();
  writer.setIndentationLevel(6);
  writer.indent(() => {
    writer
      .write(JSON.stringify(collection.fieldDefinitions, null, 2))
      .newLine();
  });
  writer.setIndentationLevel(0);
  writer.indent(6).write(`));`).newLine();
  writer.blankLine();
  writeFetch(
    writer,
    `/content/v1/projects/${project.id}/collections/${collection.id}/entries`
  );
  writer.blankLine();
  writer.indent(6).write(`return entrySchema.parse(entries);`).newLine();
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

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function generateApiClientAs({
  outDir,
  language,
  format,
  target,
}: GenerateApiClientAsProps) {
  const resolvedOutDir = Path.resolve(outDir);
  await Fs.ensureDir(resolvedOutDir);

  const outFileTs = Path.join(resolvedOutDir, 'client.ts');
  await generateApiClient(outFileTs);

  if (language === 'js') {
    await delay(1000);
    // Use tsdown to compile the generated TS Client
    // to JS in the specified module format and target environment
    await compileToJs({
      config: false, // Do not use tsdown config file of Core
      external: ['@elek-io/core', 'zod'], // These are peer dependencies of the generated client
      entry: [outFileTs],
      outDir: resolvedOutDir,
      format,
      target,
      sourcemap: true,
      clean: false,
      dts: true,
    });

    // Remove the generated TS Client after compiling to JS
    await Fs.remove(outFileTs);
  }
}

export const generateApiClientAction =
  generateApiClientActionSchema.implementAsync(
    async (outDir, language, format, target, options) => {
      await generateApiClientAs({ outDir, language, format, target });

      if (options.watch === true) {
        core.logger.info('Watching for changes to regenerate the API Client');

        watchProjects().on('all', async (event, path) => {
          core.logger.info(
            `Regenerating API Client due to ${event} on "${path}"`
          );
          await generateApiClientAs({ outDir, language, format, target });
        });
      }
    }
  );
