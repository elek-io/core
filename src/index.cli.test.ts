import { expect, vi } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';

import { Asset, Collection, Entry, Project } from './index.node.js';
import { beforeAll } from 'vitest';
import { exec } from 'child_process';
import fs from 'fs-extra';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from './test/util.js';
import core from './test/setup.js';

async function spawnChildProcess(command: string, args: string[]) {
  const fullCommand = `${command} ${args.join(' ')}`;
  const child = exec(fullCommand, (error, stdout, stderr) => {
    if (error) {
      core.logger.error(`Error executing command "${fullCommand}": ${error}`);
    }
    core.logger.debug(stdout.trim());
    core.logger.error(stderr.trim());
  });

  // Log output of the child process
  // child.stdout.on('data', (data) => {
  //   console.log(`${data}`);
  // });
  // child.stderr.on('data', (data) => {
  //   console.error(`${data}`);
  // });

  // Log output of the child process
  // child.on('message', (data) => {
  //   console.log(`${data}`);
  // });
  // child.on('error', (data) => {
  //   console.error(`${data}`);
  // });

  await vi.waitFor(
    () => {
      if (child.exitCode === null) {
        throw new Error(`Child process "${fullCommand}" not finished yet`);
      }
    },
    {
      timeout: 60000,
      interval: 20,
    }
  );

  expect(child.exitCode).toEqual(0);

  return child;
}

describe('CLI', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;
  let entry: Entry;

  beforeAll(async function () {
    /**
     * Building Core is necessary because the generated API Client imports the dist files of Core via
     * import { ... } from '@elek-io/core';
     */
    await spawnChildProcess('pnpm', ['build']);
    /**
     * Link the CLI binary, so that the `elek-io` command is available
     *
     * @see https://pnpm.io/cli/link#add-a-binary-globally
     */
    await spawnChildProcess('pnpm', ['link', '--global']);

    project = await createProject();
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    entry = await createEntry(project.id, collection.id, asset.id);

    await core.api.start(31310);
  }, 60000);

  it('should be able to generate the API Client with default options', async function () {
    await spawnChildProcess('elek-io', ['generate:client']);

    expect(await fs.exists('./.elek-io/client.ts')).toBe(true);
  });

  it('should be able to generate the API Client as JavaScript, ESM and target ES2020', async function () {
    await spawnChildProcess('elek-io', [
      'generate:client',
      './.elek-io',
      'js',
      'esm',
      'es2020',
    ]);

    expect(await fs.exists('./.elek-io/client.js')).toBe(true);
  });

  it('should be able to request a list of entries', async function () {
    // Dynamically import the generated client because it is generated
    // during this files execution and not available at the start
    // @ts-expect-error The API Client is generated dynamically, so TS cannot know about the module
    const { apiClient } = await import('../.elek-io/client.js');
    const client = apiClient({
      baseUrl: 'http://localhost:31310',
      apiKey: 'abc123',
    });

    const entries =
      await client.content.v1.projects[project.id].collections[
        collection.id
      ].entries.list();

    expect(entries.list.length).toEqual(1);
    expect(entries.list[0].id).toEqual(entry.id);
  });
});
