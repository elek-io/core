import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { sync, type HookParameters } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import { seedRemoteWithRelease, tmpDirPath } from './test/util.js';
import core, { uuid } from './test/setup.js';
import { defineElekConfig, elek, type ElekConfig } from './index.astro.js';

describe('Astro elek() integration', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let remotePath: string;
  let astroRoot: string;
  let assetOutDir: string;
  let config: ElekConfig;

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

    config = defineElekConfig({
      projects: { website: { id: seed.projectId, remoteUrl: remotePath } },
    });

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { defineElekConfig, elekAssetsLoader, elekEntriesLoader } from '${loaderPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${seed.projectId}' },
  },
});

export const collections = {
  assets: defineCollection({
    loader: elekAssetsLoader({
      config,
      project: 'website',
      imageDir: '${assetOutDir}',
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
      integrations: [elek({ config })],
    });

    // The integration provisioned the Project into the data directory
    expect(await Fs.pathExists(core.util.pathTo.project(seed.projectId))).toBe(
      true
    );
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

  it('should refresh the provisioned copy on the next sync', async function () {
    await sync({
      root: astroRoot,
      configFile: false,
      logLevel: 'info',
      integrations: [elek({ config })],
    });

    expect(
      await Fs.pathExists(
        core.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);
  }, 120000);

  it('should sync with the provisioned copy when the remote is unreachable', async function () {
    const hiddenRemotePath = `${remotePath}-hidden`;
    await Fs.move(remotePath, hiddenRemotePath);

    try {
      await sync({
        root: astroRoot,
        configFile: false,
        logLevel: 'info',
        integrations: [elek({ config })],
      });
    } finally {
      await Fs.move(hiddenRemotePath, remotePath);
    }

    expect(await Fs.pathExists(core.util.pathTo.project(seed.projectId))).toBe(
      true
    );
    expect(
      await Fs.pathExists(
        Path.join(assetOutDir, `${seed.assetId}.${seed.assetExtension}`)
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
    const loaderPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');

    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineCollection } from 'astro:content';
import { defineElekConfig, elekEntriesLoader } from '${loaderPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${missingId}' },
  },
});

export const collections = {
  entries: defineCollection({
    loader: elekEntriesLoader({
      config,
      project: 'website',
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

  it('should reject a config in which no Project has a remoteUrl', function () {
    // Nothing to provision, so the integration is in the config by
    // mistake. The common case is a single Project missing its URL.
    const withoutRemote: ElekConfig = {
      projects: { website: { id: seed.projectId } },
    };

    expect(() => elek({ config: withoutRemote })).toThrow(/remoteUrl/);
  });

  it('should accept a config mixing a remote and a local-only Project', function () {
    // A site consuming a released Project from its remote next to one
    // the Desktop app manages locally. The local one has no remote to
    // provision from, which may not cost the other one its provisioning.
    const mixed: ElekConfig = {
      projects: {
        website: { id: seed.projectId, remoteUrl: remotePath },
        local: { id: uuid() },
      },
    };

    expect(() => elek({ config: mixed })).not.toThrow();
  });

  it('should register no process error handlers while provisioning', async function () {
    // Inside a build the host owns the process, and docs/usage.md tells a
    // consumer the Astro entry sets that up for them. The Core is disposed
    // in a finally, so the handlers are only observable while the hook runs,
    // which the logger call in front of every provision reaches into.
    const integration = elek({ config });
    const setup = integration.hooks['astro:config:setup'];
    assert(setup);

    const baseUncaught = process.listenerCount('uncaughtException');
    const baseUnhandled = process.listenerCount('unhandledRejection');
    const duringProvision: number[] = [];
    const record = () => {
      duringProvision.push(
        process.listenerCount('uncaughtException') - baseUncaught,
        process.listenerCount('unhandledRejection') - baseUnhandled
      );
    };

    await setup({
      logger: { info: record, warn: record, error: record, debug: record },
      // The hook reads nothing else off its parameters
    } as unknown as HookParameters<'astro:config:setup'>);

    expect(duringProvision.length).toBeGreaterThan(0);
    expect(duringProvision.every((count) => count === 0)).toBe(true);
  }, 120000);

  // What elek() then does with such a config is asserted through a real
  // sync in src/index.astro.mixed.test.ts, which needs its own file
  // because every sync() costs the worker a full Astro pipeline
});
