import { beforeAll, afterAll, expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { Asset, Collection, Entry, Project } from './index.node.js';
import fs from 'fs-extra';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from './test/util.js';
import core from './test/setup.js';
import { execCommand } from './util/node.js';

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
    await execCommand({
      command: 'pnpm',
      args: ['build'],
      logger: core.logger,
    });

    project = await createProject();
    asset = await createAsset(project.id);
    collection = await createCollection(project.id);
    entry = await createEntry(project.id, collection.id, asset.id);

    await core.api.start(31310);
  }, 60000);

  afterAll(async function () {
    await project.destroy();
  });

  it('should be able to generate the API Client with default options', async function () {
    await execCommand({
      command: 'node "./dist/cli/index.cli.js"',
      args: ['generate:client'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek-io/client.ts')).toBe(true);
  });

  it('should be able to generate the API Client as JavaScript, ESM and target ES2020', async function () {
    const result = await execCommand({
      command: 'node "./dist/cli/index.cli.js"',
      args: ['generate:client', '"./.elek-io"', 'js', 'esm', 'es2020'],
      logger: core.logger,
    });
    core.logger.info(result.stdout);
    core.logger.error(result.stderr);

    expect(await fs.exists('./.elek-io/client.js')).toBe(true);
  }, 10000);

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
