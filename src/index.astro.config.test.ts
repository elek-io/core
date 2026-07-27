import { beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import { seedRemoteWithRelease, tmpDirPath } from './test/util.js';
import { uuid } from './test/setup.js';

/**
 * Own test file on purpose. Every sync() spins up a full Astro
 * pipeline in the worker process, and this one additionally goes
 * through Astro's config loading, so it does not share a process with
 * the other Astro suites.
 */
describe('elek.config.ts file triple', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let remotePath: string;

  beforeAll(async function () {
    seed = await seedRemoteWithRelease();

    // The integration constructs its own Core, which empties the data
    // directory's tmp folder, so the remote must live outside of it
    remotePath = Path.join(Os.tmpdir(), `elek-io-core-test-remote-${uuid()}`);
    await Fs.copy(seed.remotePath, remotePath);
  }, 120000);

  it('should bridge one declaration from astro.config into the content config', async function () {
    // The riskiest platform assumption of the single declaration
    // design: astro.config.mjs importing a sibling elek.config.ts
    // through Astro's own vite-based config loading, and the content
    // config importing that very same file
    const root = tmpDirPath();
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );

    const entryPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');
    const assetOutDir = Path.join(srcDir, 'content', 'assets').replaceAll(
      '\\',
      '/'
    );

    await Fs.writeFile(
      Path.join(root, 'elek.config.ts'),
      `
import { defineElekConfig } from '${entryPath}';

export const config = defineElekConfig({
  projects: {
    website: {
      id: '${seed.projectId}',
      remoteUrl: '${remotePath.replaceAll('\\', '/')}',
    },
  },
});
`
    );

    await Fs.writeFile(
      Path.join(root, 'astro.config.mjs'),
      `
import { defineConfig } from 'astro/config';
import { elek } from '${entryPath}';
import { config } from './elek.config';

export default defineConfig({
  integrations: [elek({ config })],
});
`
    );

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { elekAssetsLoader, elekEntriesLoader } from '${entryPath}';
import { config } from '../elek.config';

export const collections = {
  assets: defineCollection({
    loader: elekAssetsLoader({
      config,
      project: 'website',
      outDir: '${assetOutDir}',
    }),
  }),
  entries: defineCollection({
    loader: elekEntriesLoader({
      config,
      project: 'website',
      collectionIdOrSlug: '${seed.collectionId}',
    }),
  }),
};
`
    );

    // No configFile: false, so Astro loads the written astro.config.mjs
    await sync({ root, logLevel: 'info' });

    // The integration read the config and provisioned from it
    expect(
      await Fs.pathExists(
        Path.join(assetOutDir, `${seed.assetId}.${seed.assetExtension}`)
      )
    ).toBe(true);
    // The loaders read the same declaration through their own import
    expect(await Fs.pathExists(Path.join(root, '.astro', 'content.d.ts'))).toBe(
      true
    );
  }, 120000);
});
