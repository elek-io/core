import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import core, { uuid } from './test/setup.js';
import { createProject } from './test/util.js';
import type { Asset, Project } from './index.node.js';

/**
 * Own test file on purpose, every sync() spins up a full Astro
 * pipeline in the worker process.
 *
 * Asserts what the loader hands to Astro, which is where Core's
 * responsibility ends. Astro replaces the stored marker with its own
 * image metadata when a page reads the entry, and that replacement
 * cannot be exercised here: rendering needs a dev server or a build,
 * and neither survives this environment (a dev server inside a vitest
 * worker never routes, and a build stages its output in the current
 * working directory whenever the site root sits outside of it, then
 * renames across filesystems). What proves the handover instead is
 * that Astro collected the image as an import of its own, see the
 * marker section in contributing/astro-entry.md.
 */
describe('Assets through astro:assets', function () {
  let project: Project & { destroy: () => Promise<void> };
  let image: Asset;
  let document: Asset;
  let root: string;
  let cacheDir: string;

  beforeAll(async function () {
    project = await createProject('Astro Assets Test');
    image = await core.assets.create({
      projectId: project.id,
      filePath: Path.resolve('src/test/data/150x150.png'),
      name: 'A picture',
      description: 'An image Asset, which Astro can process',
    });

    // A non-image Asset, which Astro's image pipeline cannot touch
    const documentDir = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    const documentPath = Path.join(documentDir, 'handbook.pdf');
    await Fs.outputFile(documentPath, '%PDF-1.4 not a real pdf\n');
    document = await core.assets.create({
      projectId: project.id,
      filePath: documentPath,
      name: 'A document',
      description: 'A non-image Asset, which is served as it is',
    });
    await Fs.remove(documentDir);

    root = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );

    const entryPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');
    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineElekConfig, elekCollections } from '${entryPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${project.id}' },
  },
});

export const collections = { ...(await elekCollections(config)) };
`
    );

    // Astro's content store would otherwise land in node_modules,
    // which every test root shares through its symlink
    cacheDir = Path.join(root, '.cache');
    await sync({ root, configFile: false, logLevel: 'info', cacheDir });
  }, 120000);

  afterAll(async function () {
    await project.destroy();
    await Fs.remove(root);
  }, 60000);

  /**
   * Astro's content store, as it was written to disk
   *
   * Read as text on purpose. The store is serialized as a flat graph
   * of deduplicated values, so parsing it would mean depending on that
   * format too. Every assertion below is about a value being present.
   */
  function storeContents(): Promise<string> {
    return Fs.readFile(Path.join(cacheDir, 'data-store.json'), 'utf-8');
  }

  it('should hand an image Asset to Astro as an image to resolve', async function () {
    const store = await storeContents();
    const fileName = `${image.id}.${image.extension}`;

    // The marker Astro replaces with its own image metadata, so that
    // <Image src={asset.data.src} /> works
    expect(store).toContain(`__ASTRO_IMAGE_./${fileName}`);
    // Resolved relative to the entry's own file
    expect(store).toContain(
      JSON.stringify(`src/content/elek/website/assets/${fileName}`)
    );

    // Astro recognized the marker and collected the image as an import
    // of its own, which is the only proof that the handover worked.
    // Were the marker convention to change, this string would no
    // longer appear on its own, only inside the marker above.
    expect(store).toContain(JSON.stringify(`./${fileName}`));
  }, 30000);

  it('should hand a non-image Asset over as a public URL', async function () {
    const store = await storeContents();
    const fileName = `${document.id}.${document.extension}`;

    expect(store).toContain(JSON.stringify(`/elek/website/assets/${fileName}`));
    // Nothing for Astro's image pipeline to pick up here
    expect(store).not.toContain(`__ASTRO_IMAGE_./${fileName}`);
  }, 30000);

  it('should save each Asset next to its own kind', async function () {
    // Images below src/, where Astro can process them
    expect(
      await Fs.pathExists(
        Path.join(
          root,
          'src',
          'content',
          'elek',
          'website',
          'assets',
          `${image.id}.${image.extension}`
        )
      )
    ).toBe(true);
    // Everything else below public/, which is what serves it
    expect(
      await Fs.pathExists(
        Path.join(
          root,
          'public',
          'elek',
          'website',
          'assets',
          `${document.id}.${document.extension}`
        )
      )
    ).toBe(true);
  }, 30000);
});
