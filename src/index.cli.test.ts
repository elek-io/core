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
  execCommand,
  seedRemoteWithRelease,
} from './test/util.js';
import core, { testApiPort } from './test/setup.js';

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
    await core.api.stop();
    await project1.destroy();
    await project2.destroy();

    // Empty the CLI output directory. It is the throwaway default
    // outDir for generate:client and export, recreated on demand. Leaving the
    // generated client.ts/.js/.d.ts behind makes a later tsc run fail, so the
    // cleanup must cover every artifact, not just the export JSON.
    await fs.emptyDir('./.elek.io');
  });

  it('should start the built binary the way a consumer install does', async function () {
    // Every other test here inherits the NODE_PATH vitest gives its workers,
    // which ends in pnpm's hidden hoist store and resolves packages a consumer
    // never sees. Stripping it is what `elek` gets from a plain shell, and it
    // is what catches a bundler leaking into dist/cli: rolldown's native
    // binding cannot be bundled, so the binary dies before commander runs.
    const env = { ...process.env };
    delete env['NODE_PATH'];

    const { stdout } = await execCommand({
      command: 'node',
      args: ['./dist/cli/index.cli.mjs', '--help'],
      options: { env },
    });

    expect(stdout).toContain('CLI for elek.io');
  });

  it('should be able to generate the TS API Client with default options', async function () {
    await execCommand({
      command: 'node',
      args: ['./dist/cli/index.cli.mjs', 'generate:client'],
    });

    expect(await fs.exists('./.elek.io/client.ts')).toBe(true);
  });

  it('should be able to generate & compile the API Client as JavaScript, ESM and target ES2020', async function () {
    await execCommand({
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        'generate:client',
        './.elek.io',
        'js',
        'esm',
        'es2020',
      ],
    });

    expect(await fs.exists('./.elek.io/client.js')).toBe(true);
  }, 10000);

  it('should generate types as JavaScript when there are no Projects', async function () {
    // An isolated data directory holds no Projects, so no types file is
    // written and there is nothing to compile. The compiler rejects an empty
    // entry list with "No input files", so the step has to be skipped rather
    // than called with nothing, matching how the `ts` language already behaves.
    await execCommand({
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        '--data-dir',
        './.elek.io/no-projects-data-dir',
        'generate:types',
        './.elek.io/no-projects-out',
        'js',
      ],
    });

    expect(await fs.readdir('./.elek.io/no-projects-out')).toEqual([]);
  }, 10000);

  it('should be able to request a list of entries', async function () {
    await core.api.start(testApiPort);

    // Dynamically import the generated client because it is generated
    // during this files execution and not available at the start
    // @ts-expect-error The API Client is generated dynamically, so TS cannot know about the module
    const { apiClient } = await import('../.elek.io/client.js');
    const client = apiClient({
      baseUrl: `http://localhost:${testApiPort}`,
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
      command: 'node',
      args: ['./dist/cli/index.cli.mjs', 'export'],
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
      command: 'node',
      args: ['./dist/cli/index.cli.mjs', 'export', './.elek.io', project1.id],
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
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        'export',
        './.elek.io',
        `${project1.id},${project2.id}`,
        'separate',
      ],
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

  it('should isolate the data directory via the --data-dir option', async function () {
    // The isolated directory holds no Projects, so the export is empty
    // even though this suite created Projects in the shared data directory
    await execCommand({
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        '--data-dir',
        './.elek.io/data-dir-flag',
        'export',
        './.elek.io/data-dir-flag-out',
      ],
    });

    const projectsContent = await fs.readFile(
      './.elek.io/data-dir-flag-out/projects.json',
      'utf-8'
    );
    expect(JSON.parse(projectsContent)).toEqual({});
    expect(await fs.exists('./.elek.io/data-dir-flag/projects')).toBe(true);
  });

  it('should fail loudly for an empty --data-dir instead of falling back', async function () {
    // The empty argument reaches commander verbatim, the way a script
    // passing an unset variable would. It must throw, not silently use
    // another directory.
    await expect(
      execCommand({
        command: 'node',
        args: [
          './dist/cli/index.cli.mjs',
          '--data-dir',
          '',
          'export',
          './.elek.io/data-dir-empty-out',
        ],
      })
    ).rejects.toThrow();

    expect(await fs.exists('./.elek.io/data-dir-empty-out')).toBe(false);
  });

  it('should isolate the data directory via the ELEK_IO_DATA_DIR environment variable', async function () {
    await execCommand({
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        'export',
        './.elek.io/data-dir-env-out',
      ],
      options: {
        env: { ...process.env, ELEK_IO_DATA_DIR: './.elek.io/data-dir-env' },
      },
    });

    const projectsContent = await fs.readFile(
      './.elek.io/data-dir-env-out/projects.json',
      'utf-8'
    );
    expect(JSON.parse(projectsContent)).toEqual({});
    expect(await fs.exists('./.elek.io/data-dir-env/projects')).toBe(true);
  });

  it('should provision a Project via the provision command', async function () {
    const seed = await seedRemoteWithRelease();

    await execCommand({
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        '--data-dir',
        './.elek.io/provision-data-dir',
        'provision',
        '--project',
        seed.projectId,
        '--url',
        seed.remotePath,
      ],
    });

    const projectFile = JSON.parse(
      await fs.readFile(
        `./.elek.io/provision-data-dir/projects/${seed.projectId}/project.json`,
        'utf-8'
      )
    );
    expect(projectFile.version).toEqual(seed.releaseVersion);
    expect(
      await fs.exists(
        `./.elek.io/provision-data-dir/projects/${seed.projectId}/.elek-provisioned`
      )
    ).toBe(true);
  }, 60000);

  it('should provision the channel given by ELEK_IO_CHANNEL via the provision command', async function () {
    const seed = await seedRemoteWithRelease();

    await execCommand({
      command: 'node',
      args: [
        './dist/cli/index.cli.mjs',
        '--data-dir',
        './.elek.io/provision-ref-data-dir',
        'provision',
        '--project',
        seed.projectId,
        '--url',
        seed.remotePath,
        '--ref',
        'production',
      ],
      options: {
        env: { ...process.env, ELEK_IO_CHANNEL: 'draft' },
      },
    });

    // The draft channel follows the work branch
    const head = await fs.readFile(
      `./.elek.io/provision-ref-data-dir/projects/${seed.projectId}/.git/HEAD`,
      'utf-8'
    );
    expect(head).toContain('refs/heads/work');
  }, 60000);

  it('should reject an exact version in ELEK_IO_CHANNEL', async function () {
    const seed = await seedRemoteWithRelease();

    await expect(
      execCommand({
        command: 'node',
        args: [
          './dist/cli/index.cli.mjs',
          '--data-dir',
          './.elek.io/provision-channel-fail-data-dir',
          'provision',
          '--project',
          seed.projectId,
          '--url',
          seed.remotePath,
        ],
        options: {
          env: { ...process.env, ELEK_IO_CHANNEL: seed.releaseVersion },
        },
      })
    ).rejects.toThrow();
  }, 60000);

  it('should fail loudly when the provision ref does not exist', async function () {
    const seed = await seedRemoteWithRelease();

    await expect(
      execCommand({
        command: 'node',
        args: [
          './dist/cli/index.cli.mjs',
          '--data-dir',
          './.elek.io/provision-fail-data-dir',
          'provision',
          '--project',
          seed.projectId,
          '--url',
          seed.remotePath,
          '--ref',
          '9.9.9',
        ],
      })
    ).rejects.toThrow();
  }, 60000);
});
