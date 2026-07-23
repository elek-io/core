#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings';
import * as packageJson from '../package.json' with { type: 'json' };
import {
  configureCore,
  exportAction,
  generateApiClientAction,
  generateTypesAction,
  pullAction,
  startApiAction,
} from './cli/index.js';
import {
  apiStartSchema,
  exportSchema,
  generateApiClientSchema,
  generateTypesSchema,
  pullSchema,
} from './schema/index.js';

const program = new Command()
  .name('elek')
  .description('CLI for elek.io')
  .version(packageJson.default.version)
  .option(
    '--data-dir <path>',
    'The directory Core reads and writes data in. Overrides the ELEK_IO_DATA_DIR environment variable and defaults to ~/elek.io.'
  )
  .hook('preAction', (thisCommand) => {
    const { dataDir } = thisCommand.opts();
    // Only skip when the flag is absent. An empty string must reach the
    // constructor so it throws instead of silently using another directory.
    if (dataDir !== undefined) {
      configureCore({ dataDir });
    }
  });

program
  .command('generate:client')
  .description('Generates a JS/TS API Client')
  .argument(
    '[outDir]',
    'The directory to generate the API Client in',
    './.elek.io'
  )
  .argument(
    '[language]',
    'The programming language of the generated API Client. Choose "ts" if you bundle it yourself in your TypeScript project, or "js" if you want a ready-to-use JavaScript API Client.',
    'ts'
  )
  .argument(
    '[format]',
    'The output format of the generated API Client. Choose "esm" for ES Modules, or "cjs" for CommonJS. This option is only relevant if you choose "js" as the language.',
    'esm'
  )
  .argument(
    '[target]',
    'The target environment of the generated API Client. Choose this depending on the JavaScript runtime you want to support. This option is only relevant if you choose "js" as the language.',
    'es2020'
  )
  .option(
    '-w, --watch',
    'Watches for changes in your Projects and regenerates the API Client automatically.'
  )
  .action(async (outDir, language, format, target, options) => {
    const props = generateApiClientSchema.parse({
      outDir,
      language,
      format,
      target,
      options,
    });

    await generateApiClientAction(props);
  });

program
  .command('generate:types')
  .description(
    'Generates TypeScript type definitions from Project content models'
  )
  .argument('[outDir]', 'The directory to generate the types in', './.elek.io')
  .argument(
    '[language]',
    'The output language. Choose "ts" for TypeScript source, or "js" to compile to JavaScript with .d.ts declarations.',
    'ts'
  )
  .argument(
    '[projects]',
    'One or more Project IDs, separated by commas. If not provided, all Projects will be used.',
    'all'
  )
  .option(
    '-w, --watch',
    'Watches for changes in your Projects and regenerates types automatically.'
  )
  .action(async (outDir, language, projects, options) => {
    const props = generateTypesSchema.parse({
      outDir,
      language,
      projects,
      options,
    });

    await generateTypesAction(props);
  });

program
  .command('api:start')
  .description('Starts the local API')
  .argument('[port]', 'The port to run the local API on', '31310')
  .action((port) => {
    const props = apiStartSchema.parse({ port });

    startApiAction(props);
  });

program
  .command('export')
  .description('Exports locally available Projects to JSON')
  .argument('[outDir]', 'The directory to write the JSON to', './.elek.io')
  .argument(
    '[projects]',
    'One or more Project IDs, separated by commas to export. If not provided, all Projects will be exported.',
    'all'
  )
  .argument(
    '[template]',
    'The template to use for exporting Projects. Choose "nested" to export all Projects in a single, nested file or "separate" to export each Project in a separate folder with individual files.',
    'nested'
  )
  .option(
    '-w, --watch',
    'Watches for changes in your Projects and updates the JSON file automatically.'
  )
  .action(async (outDir, projects, template, options) => {
    const props = exportSchema.parse({
      outDir,
      projects,
      template,
      options,
    });

    await exportAction(props);
  });

program
  .command('pull')
  .description(
    'Provisions a Project from its remote into the data directory, meant for CI builds'
  )
  .requiredOption('-p, --project <id>', 'The ID of the Project to provision')
  .requiredOption(
    '-u, --url <url>',
    'The remote repository URL to provision from'
  )
  .option(
    '-r, --ref <ref>',
    'The content state to provision: "production", "work" or a Release version. The ELEK_IO_REF environment variable overrides this option. Defaults to "production".'
  )
  .action(async (options) => {
    // Provisioning never mutates the Project or its remote and must
    // work without a User being set
    configureCore({ readOnly: true });
    const props = pullSchema.parse(options);

    await pullAction(props);
  });

await program.parseAsync();
