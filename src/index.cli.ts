#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings';
import * as packageJson from '../package.json' with { type: 'json' };
import {
  exportAction,
  generateApiClientAction,
  startApiAction,
} from './cli/index.js';

const program = new Command();

program
  .name('elek-io')
  .description('CLI for elek.io')
  .version(packageJson.default.version);

program
  .command('generate:client')
  .description('Generates a JS/TS API Client')
  .argument(
    '[outDir]',
    'The directory to generate the API Client in',
    './.elek-io'
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
    await generateApiClientAction(outDir, language, format, target, options);
  });

program
  .command('api:start')
  .description('Starts the local API')
  .argument('[port]', 'The port to run the local API on', '31310')
  .action((port) => {
    startApiAction(port);
  });

program
  .command('export')
  .description('Exports all locally available Projects into a JSON file')
  .argument('[outDir]', 'The directory to write the JSON file to', './.elek-io')
  .option(
    '-w, --watch',
    'Watches for changes in your Projects and updates the JSON file automatically.'
  )
  .action(async (outDir, options) => {
    await exportAction(outDir, options);
  });

await program.parseAsync();
