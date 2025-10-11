#! /usr/bin/env node

import { Command } from 'commander';
import * as packageJson from '../package.json' with { type: 'json' };
import { generateClient } from './cli/client.js';

const program = new Command();

program
  .name('elek-io')
  .description('CLI for elek.io')
  .version(packageJson.default.version);

program
  .command('generate:client')
  .description('Generates a JS/TS API client')
  .argument(
    '[outDir]',
    'the directory to generate the API client in',
    './.elek-io'
  )
  .option(
    '-w, --watch',
    'watch for changes and regenerate the client automatically'
  )
  .action(async (outDir, options) => {
    const isWatching = options.watch ? true : false;

    console.log(
      `generate-client command called with dir: ${outDir} and watch: ${isWatching}`
    );

    await generateClient(outDir);
  });

program.parseAsync();
