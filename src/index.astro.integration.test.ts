import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import { seedRemoteWithRelease, tmpDirPath } from './test/util.js';
import core, { uuid } from './test/setup.js';
import { elek } from './index.astro.js';

describe('Astro elek() integration', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let remotePath: string;
  let astroRoot: string;
  let assetOutDir: string;

  beforeAll(async function () {
    seed = await seedRemoteWithRelease();

    // The integration constructs its own Core, which empties the data
    // directory's tmp folder, so the remote must live outside of it
    remotePath = Path.join(Os.tmpdir(), `elek-io-core-test-remote-${uuid()}`);
    await Fs.copy(seed.remotePath, remotePath);

    astroRoot = Path.join(Os.tmpdir(), `elek-io-core-test-${uuid()}`);
    const srcDir = Path.join(astroRoot, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(astroRoot, 'node_modules')
    );

    const loaderPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');
    assetOutDir = Path.join(srcDir, 'content', 'assets').replaceAll('\\', '/');

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { elekAssets, elekEntries } from '${loaderPath}';

export const collections = {
  assets: defineCollection({
    loader: elekAssets({
      projectId: '${seed.projectId}',
      outDir: '${assetOutDir}',
    }),
  }),
  entries: defineCollection({
    loader: elekEntries({
      projectId: '${seed.projectId}',
      collectionIdOrSlug: '${seed.collectionId}',
    }),
  }),
};
`
    );
  }, 120000);

  afterAll(async function () {
    await Fs.remove(remotePath);
    await Fs.remove(astroRoot);
  });

  it('should provision the Project and sync its content', async function () {
    await sync({
      root: astroRoot,
      configFile: false,
      logLevel: 'info',
      integrations: [
        elek({
          projects: [{ id: seed.projectId, remoteUrl: remotePath }],
        }),
      ],
    });

    // The integration provisioned the Project into the data directory
    expect(
      await Fs.pathExists(core.util.pathTo.project(seed.projectId))
    ).toBe(true);
    expect(
      await Fs.pathExists(
        core.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);

    // The loaders read the provisioned content
    expect(
      await Fs.pathExists(
        Path.join(assetOutDir, `${seed.assetId}.${seed.assetExtension}`)
      )
    ).toBe(true);
    expect(
      await Fs.pathExists(Path.join(astroRoot, '.astro', 'content.d.ts'))
    ).toBe(true);
  }, 120000);

  it('should refresh the provisioned Project on the next sync', async function () {
    await sync({
      root: astroRoot,
      configFile: false,
      logLevel: 'info',
      integrations: [
        elek({
          projects: [{ id: seed.projectId, remoteUrl: remotePath }],
        }),
      ],
    });

    expect(
      await Fs.pathExists(
        core.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);
  }, 120000);

  it('should fail a sync without the integration and point at it', async function () {
    const missingId = uuid();
    const root = tmpDirPath();
    const srcDir = Path.join(root, 'src');
    await Fs.ensureDir(srcDir);
    await Fs.symlink(
      Path.resolve('node_modules'),
      Path.join(root, 'node_modules')
    );
    const loaderPath = Path.resolve('src/index.astro.ts').replaceAll(
      '\\',
      '/'
    );

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { elekEntries } from '${loaderPath}';

export const collections = {
  entries: defineCollection({
    loader: elekEntries({
      projectId: '${missingId}',
      collectionIdOrSlug: 'anything',
    }),
  }),
};
`
    );

    await expect(
      sync({ root, configFile: false, logLevel: 'error' })
    ).rejects.toThrow(/elek\(\)|data directory/);
  }, 120000);
});
