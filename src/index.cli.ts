#! /usr/bin/env node

import { Command } from 'commander';
import chokidar from 'chokidar';
import tsup from 'tsup';
import * as packageJson from '../package.json' with { type: 'json' };
import { generateApiClient } from './cli/client.js';
import {
  generateApiClientActionSchema,
  GenerateApiClientAsProps,
} from './schema/index.js';
import ElekIoCore from './index.node.js';
import path from 'path';
import fs from 'fs-extra';

const program = new Command();

program
  .name('elek-io')
  .description('CLI for elek.io')
  .version(packageJson.default.version);

async function generateApiClientAs(
  core: ElekIoCore,
  { outDir, language, format, target }: GenerateApiClientAsProps
) {
  const resolvedOutDir = path.resolve(outDir);
  await fs.ensureDir(resolvedOutDir);

  if (language === 'ts') {
    const outFile = path.join(resolvedOutDir, 'client.ts');
    await generateApiClient(outFile, core);
  } else {
    const tmpOutFile = path.join(core.util.pathTo.tmp, `client.ts`);
    await generateApiClient(tmpOutFile, core);

    // Use tsup to compile the generated TS Client
    // to JS in the specified module format and target environment
    await tsup.build({
      config: false, // Do not use tsup config file of Core
      external: ['@elek-io/core', 'zod'], // These are peer dependencies of the generated client
      entry: [tmpOutFile],
      outDir: resolvedOutDir,
      format,
      target,
      sourcemap: true,
      clean: true,
      dts: true,
    });
  }
}

const generateApiClientAction = generateApiClientActionSchema.implementAsync(
  async (outDir, language, format, target, options) => {
    const core = new ElekIoCore({
      log: {
        level: 'info',
      },
    });

    await generateApiClientAs(core, { outDir, language, format, target });

    if (options.watch === true) {
      core.logger.info('Watching for changes to regenerate the API Client');

      chokidar
        .watch(core.util.pathTo.projects)
        .on('all', async (event, path) => {
          core.logger.info(
            `Regenerating API Client due to ${event} on "${path}"`
          );
          await generateApiClientAs(core, { outDir, language, format, target });
        });
    }
  }
);

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
  .action((outDir, language, format, target, options) => {
    generateApiClientAction(outDir, language, format, target, options);
  });

program.parseAsync();
