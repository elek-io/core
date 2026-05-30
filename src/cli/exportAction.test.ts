import Fs from 'fs-extra';
import Path from 'node:path';
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core, { type Project, uuid } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createComponent,
  createEntry,
  createProject,
} from '../test/util.js';
import { exportAction } from './exportAction.js';

/**
 * Exercises the file-writing paths of exportAction (both templates). The
 * watch/process.exit wrapper is intentionally not covered - it sets up a
 * chokidar watcher that never resolves.
 */
describe('exportAction', () => {
  let project: Project & { destroy: () => Promise<void> };
  let collectionSlugPlural: string;
  const outDirs: string[] = [];

  beforeAll(async () => {
    project = await createProject('exportAction Test');
    const asset = await createAsset(project.id);
    await createComponent(project.id);
    const collection = await createCollection(project.id);
    await createEntry(project.id, collection.id, asset.id);
    collectionSlugPlural = collection.slug.plural;
  }, 30000);

  afterAll(async () => {
    await project.destroy();
    await Promise.all(outDirs.map((dir) => Fs.remove(dir)));
  });

  it('writes a single nested JSON file with assets, components and collection entries', async () => {
    const outDir = Path.join(core.util.pathTo.tmp, `export-nested-${uuid()}`);
    outDirs.push(outDir);

    await exportAction({
      outDir,
      projects: [project.id],
      template: 'nested',
      options: { watch: false },
    });

    const nestedExportShape = z.object({
      id: z.string(),
      assets: z.record(z.string(), z.unknown()),
      components: z.record(z.string(), z.unknown()),
      collections: z.record(
        z.string(),
        z.object({ entries: z.record(z.string(), z.unknown()) })
      ),
    });
    const content = nestedExportShape.parse(
      await Fs.readJson(
        Path.join(Path.resolve(outDir), `project-${project.id}.json`)
      )
    );

    expect(content.id).toBe(project.id);
    expect(Object.keys(content.assets).length).toBeGreaterThan(0);
    expect(Object.keys(content.components).length).toBeGreaterThan(0);
    expect(content.collections).toHaveProperty(collectionSlugPlural);
    const exportedCollection = content.collections[collectionSlugPlural];
    expect(exportedCollection).toBeDefined();
    expect(
      Object.keys(exportedCollection?.entries ?? {}).length
    ).toBeGreaterThan(0);
  });

  it('writes a separate directory tree with project, assets, components and collections', async () => {
    const outDir = Path.join(core.util.pathTo.tmp, `export-separate-${uuid()}`);
    outDirs.push(outDir);

    await exportAction({
      outDir,
      projects: [project.id],
      template: 'separate',
      options: { watch: false },
    });

    const projectDir = Path.join(
      Path.resolve(outDir),
      `project-${project.id}`
    );

    expect(await Fs.pathExists(Path.join(projectDir, 'project.json'))).toBe(
      true
    );
    expect(
      await Fs.pathExists(Path.join(projectDir, 'assets', 'assets.json'))
    ).toBe(true);
    expect(
      await Fs.pathExists(
        Path.join(projectDir, 'components', 'components.json')
      )
    ).toBe(true);
    expect(
      await Fs.pathExists(
        Path.join(
          projectDir,
          'collections',
          collectionSlugPlural,
          'collection.json'
        )
      )
    ).toBe(true);
    expect(
      await Fs.pathExists(
        Path.join(
          projectDir,
          'collections',
          collectionSlugPlural,
          'entries.json'
        )
      )
    ).toBe(true);
  });
});
