import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sync } from 'astro';
import Os from 'node:os';
import Path from 'node:path';
import Fs from 'fs-extra';
import { createProject, seedRemoteWithRelease } from './test/util.js';
import core, { uuid } from './test/setup.js';
import { defineElekConfig, elek } from './index.astro.js';
import type { Project } from './index.node.js';

/**
 * Own test file on purpose, every sync() spins up a full Astro
 * pipeline in the worker process.
 *
 * The config of a site that consumes a released Project from its remote
 * next to one the Desktop app manages locally. Only the first has a
 * remoteUrl, and that may not cost the site its provisioning.
 */
describe('Astro elek() integration with a mixed config', function () {
  let seed: Awaited<ReturnType<typeof seedRemoteWithRelease>>;
  let remotePath: string;
  let local: Project & { destroy: () => Promise<void> };
  let astroRoot: string;

  beforeAll(async function () {
    seed = await seedRemoteWithRelease();
    local = await createProject('Astro Local Only');

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

    const entryPath = Path.resolve('src/index.astro.ts').replaceAll('\\', '/');

    // Both Projects are read by the loaders, only one is provisioned
    await Fs.writeFile(
      Path.join(srcDir, 'content.config.ts'),
      `
import { defineElekConfig, elekCollections } from '${entryPath}';

const config = defineElekConfig({
  projects: {
    website: { id: '${seed.projectId}', remoteUrl: '${remotePath.replaceAll('\\', '/')}' },
    local: { id: '${local.id}' },
  },
});

export const collections = { ...(await elekCollections(config)) };
`
    );
  }, 120000);

  afterAll(async function () {
    await local.destroy();
    await Fs.remove(remotePath);
    await Fs.remove(astroRoot);
  }, 60000);

  it('should provision the Project with a remoteUrl and skip the local one', async function () {
    const config = defineElekConfig({
      projects: {
        website: { id: seed.projectId, remoteUrl: remotePath },
        local: { id: local.id },
      },
    });

    await sync({
      root: astroRoot,
      configFile: false,
      logLevel: 'info',
      integrations: [elek({ config })],
    });

    // The declared remote was provisioned
    expect(
      await Fs.pathExists(
        core.util.pathTo.projectProvisionedMarker(seed.projectId)
      )
    ).toBe(true);

    // The local one is untouched, still the working copy it was
    expect(await Fs.pathExists(core.util.pathTo.project(local.id))).toBe(true);
    expect(
      await Fs.pathExists(core.util.pathTo.projectProvisionedMarker(local.id))
    ).toBe(false);

    // Both reached the loaders, which is the point of the mixed config
    const types = await Fs.readFile(
      Path.join(astroRoot, '.astro', 'content.d.ts'),
      'utf-8'
    );
    expect(types).toContain('websiteProducts');
    expect(types).toContain('localAssets');
  }, 120000);
});
