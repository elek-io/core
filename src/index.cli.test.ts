/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
    await fs.remove(`./.elek.io/project-${project1.id}`);
    await fs.remove(`./.elek.io/project-${project2.id}`);
  });

  it('should be able to generate the TS API Client with default options', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.mjs',
      args: ['generate:client'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/client.ts')).toBe(true);
  });

  it('should be able to generate & compile the API Client as JavaScript, ESM and target ES2020', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.mjs',
      args: ['generate:client', './.elek.io', 'js', 'esm', 'es2020'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/client.js')).toBe(true);
  }, 10000);

  it('should be able to request a list of entries', async function () {
    core.api.start(31310);

    // Dynamically import the generated client because it is generated
    // during this files execution and not available at the start
    // @ts-ignore The API Client is generated dynamically, so TS cannot know about the module
    const { apiClient } = await import('../.elek.io/client.js');
    const client = apiClient({
      baseUrl: 'http://localhost:31310',
      apiKey: 'abc123',
    });

    const entriesOfProject1 =
      await client.content.v1.projects[project1.id].collections[
        collection.slug.plural
      ].entries.list();

    expect(entriesOfProject1.list.length).toEqual(1);
    expect(entriesOfProject1.list[0].id).toEqual(entry.id);
  });

  it('should be able to export all Projects nested into projects.json', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.mjs',
      args: ['export'],
      logger: core.logger,
    });

    expect(await fs.exists('./.elek.io/projects.json')).toBe(true);
  });

  it('should be able to use the exported nested projects.json file', async function () {
    const projectsContent = await fs.readFile(
      './.elek.io/projects.json',
      'utf-8'
    );
    const projects = JSON.parse(projectsContent);

    expect(
      projects[project1.id].collections[collection.slug.plural].entries[
        entry.id
      ].id
    ).toEqual(entry.id);
    expect(projects[project2.id].id).toEqual(project2.id);
  });

  it('should include assets in the nested all-projects export', async function () {
    const projectsContent = await fs.readFile(
      './.elek.io/projects.json',
      'utf-8'
    );
    const projects = JSON.parse(projectsContent);

    expect(projects[project1.id].assets[asset.id].id).toEqual(asset.id);
    expect(Object.keys(projects[project2.id].assets).length).toEqual(0);
    expect(Object.keys(projects[project2.id].collections).length).toEqual(0);
  });

  it('should be able to export one Project to project-${id}.json', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.mjs',
      args: ['export', './.elek.io', project1.id],
      logger: core.logger,
    });

    expect(await fs.exists(`./.elek.io/project-${project1.id}.json`)).toBe(
      true
    );
  });

  it('should be able to use the exported nested project-${id}.json file', async function () {
    const projectsContent = await fs.readFile(
      `./.elek.io/project-${project1.id}.json`,
      'utf-8'
    );
    const projects = JSON.parse(projectsContent);

    expect(
      projects.collections[collection.slug.plural].entries[entry.id].id
    ).toEqual(entry.id);
    expect(projects[project2.id]).toEqual(undefined);
  });

  it('should include assets in the nested single-project export', async function () {
    const projectContent = await fs.readFile(
      `./.elek.io/project-${project1.id}.json`,
      'utf-8'
    );
    const project = JSON.parse(projectContent);

    expect(project.assets[asset.id].id).toEqual(asset.id);
  });

  it('should be able to export multiple Projects to separate project-${id}/project.json files', async function () {
    await execCommand({
      command: 'node ./dist/cli/index.cli.mjs',
      args: [
        'export',
        './.elek.io',
        `${project1.id},${project2.id}`,
        'separate',
      ],
      logger: core.logger,
    });

    expect(
      await fs.exists(`./.elek.io/project-${project1.id}/project.json`)
    ).toBe(true);
    expect(
      await fs.exists(`./.elek.io/project-${project1.id}/assets/assets.json`)
    ).toBe(true);
    expect(
      await fs.exists(
        `./.elek.io/project-${project1.id}/collections/collections.json`
      )
    ).toBe(true);
    expect(
      await fs.exists(`./.elek.io/project-${project2.id}/project.json`)
    ).toBe(true);
  });

  it('should be able to use the exported separate project-${id}/project.json files', async function () {
    const project1Content = await fs.readFile(
      `./.elek.io/project-${project1.id}/project.json`,
      'utf-8'
    );
    const project1Json = JSON.parse(project1Content);

    const project2Content = await fs.readFile(
      `./.elek.io/project-${project2.id}/project.json`,
      'utf-8'
    );
    const project2Json = JSON.parse(project2Content);

    expect(project1Json.id).toEqual(project1.id);
    expect(project2Json.id).toEqual(project2.id);
  });

  it('should include collection subdirectory files in the separate export', async function () {
    expect(
      await fs.exists(
        `./.elek.io/project-${project1.id}/collections/products/collection.json`
      )
    ).toBe(true);
    expect(
      await fs.exists(
        `./.elek.io/project-${project1.id}/collections/products/entries.json`
      )
    ).toBe(true);
  });

  it('should copy asset binary files in the separate export', async function () {
    expect(
      await fs.exists(
        `./.elek.io/project-${project1.id}/assets/${asset.id}.png`
      )
    ).toBe(true);
  });

  it('should be able to use the exported separate assets.json file', async function () {
    const assetsContent = await fs.readFile(
      `./.elek.io/project-${project1.id}/assets/assets.json`,
      'utf-8'
    );
    const assets = JSON.parse(assetsContent);

    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toEqual(1);
    expect(assets[0].id).toEqual(asset.id);
  });

  it('should be able to use the exported separate collections.json file', async function () {
    const collectionsContent = await fs.readFile(
      `./.elek.io/project-${project1.id}/collections/collections.json`,
      'utf-8'
    );
    const collections = JSON.parse(collectionsContent);

    expect(Array.isArray(collections)).toBe(true);
    expect(collections.length).toEqual(1);
    expect(collections[0].id).toEqual(collection.id);
  });

  it('should be able to use the exported separate entries.json file', async function () {
    const entriesContent = await fs.readFile(
      `./.elek.io/project-${project1.id}/collections/products/entries.json`,
      'utf-8'
    );
    const entries = JSON.parse(entriesContent);

    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toEqual(1);
    expect(entries[0].id).toEqual(entry.id);
  });
});
