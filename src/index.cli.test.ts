/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { beforeAll, afterAll, expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import type { Asset, Collection, Entry, Project } from './index.node.js';
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
  let project1: Project & { destroy: () => Promise<void> };
  let project2: Project & { destroy: () => Promise<void> };
  let asset: Asset;
  let collection: Collection;
  let entry: Entry;

  beforeAll(async function () {
    project1 = await createProject();
    project2 = await createProject();
    asset = await createAsset(project1.id);
    collection = await createCollection(project1.id);
    entry = await createEntry(project1.id, collection.id, asset.id);
  }, 60000);

  afterAll(async function () {
    await project1.destroy();
    await project2.destroy();

    await fs.remove(`./.elek.io/projects.json`);
    await fs.remove(`./.elek.io/project-${project1.id}.json`);
    await fs.remove(`./.elek.io/project-${project2.id}.json`);
  });

  it('should be able to generate the TS API Client with default options', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.js',
      args: ['generate:client'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/client.ts')).toBe(true);
  });

  it('should be able to generate & compile the API Client as JavaScript, ESM and target ES2020', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.js',
      args: ['generate:client', './.elek.io', 'js', 'esm', 'es2020'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/client.js')).toBe(true);
  }, 10000);

  it('should be able to request a list of entries', async function () {
    core.api.start(31310);

    // Dynamically import the generated client because it is generated
    // during this files execution and not available at the start
    // @ts-expect-error The API Client is generated dynamically, so TS cannot know about the module
    const { apiClient } = await import('../.elek.io/client.js');
    const client = apiClient({
      baseUrl: 'http://localhost:31310',
      apiKey: 'abc123',
    });

    const entriesOfProject1 =
      await client.content.v1.projects[project1.id].collections[
        collection.id
      ].entries.list();

    expect(entriesOfProject1.list.length).toEqual(1);
    expect(entriesOfProject1.list[0].id).toEqual(entry.id);
  });

  it('should be able to export all Projects to projects.json file', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.js',
      args: ['export'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/projects.json')).toBe(true);
  });

  it('should be able to use the exported projects.json file', async function () {
    const projectsContent = await fs.readFile(
      './.elek.io/projects.json',
      'utf-8'
    );
    const projects = JSON.parse(projectsContent);

    expect(
      projects[project1.id].collections[collection.id].entries[entry.id].id
    ).toEqual(entry.id);
    expect(projects[project2.id].id).toEqual(project2.id);
  });

  it('should be able to export one Project to projects.json file', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.js',
      args: ['export', './.elek.io', project1.id],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/projects.json')).toBe(true);
  });

  it('should be able to use the exported projects.json file with one Project', async function () {
    const projectsContent = await fs.readFile(
      './.elek.io/projects.json',
      'utf-8'
    );
    const projects = JSON.parse(projectsContent);

    expect(
      projects[project1.id].collections[collection.id].entries[entry.id].id
    ).toEqual(entry.id);
    expect(projects[project2.id]).toEqual(undefined);
  });

  it('should be able to export multiple Projects to separate project-${id}.json files', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.js',
      args: [
        'export',
        './.elek.io',
        `${project1.id},${project2.id}`,
        '--separate',
      ],
      logger: core.logger,
    });

    expect(await fs.exists(`./.elek.io/project-${project1.id}.json`)).toBe(
      true
    );
    expect(await fs.exists(`./.elek.io/project-${project2.id}.json`)).toBe(
      true
    );
  });

  it('should be able to use the exported project-${id}.json files', async function () {
    const project1Content = await fs.readFile(
      `./.elek.io/project-${project1.id}.json`,
      'utf-8'
    );
    const project1Json = JSON.parse(project1Content);

    const project2Content = await fs.readFile(
      `./.elek.io/project-${project2.id}.json`,
      'utf-8'
    );
    const project2Json = JSON.parse(project2Content);

    expect(
      project1Json.collections[collection.id].entries[entry.id].id
    ).toEqual(entry.id);
    expect(project2Json.id).toEqual(project2.id);
  });
});
