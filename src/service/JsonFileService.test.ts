import { z } from '@hono/zod-openapi';
import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ElekIoCoreOptions } from '../schema/index.js';
import core, { uuid } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from '../test/util.js';
import { createPathTo } from '../util/node.js';
import { CacheService } from './CacheService.js';
import { JsonFileService } from './JsonFileService.js';
import { LogService } from './LogService.js';

const dataDir = Path.join(Os.tmpdir(), `elek-io-core-jsonfile-${uuid()}`);
const options: ElekIoCoreOptions = {
  log: { level: 'debug', hasProcessErrorHandlers: false },
  cache: true,
  cloud: { url: 'https://api.elek.io' },
  dataDir,
  isReadOnly: false,
};
const pathTo = createPathTo(dataDir);
const logService = new LogService(options, pathTo);
const jsonFileService = new JsonFileService(
  options,
  pathTo,
  logService,
  new CacheService(options.cache)
);
const fileSchema = z.object({ id: z.string() });

Fs.mkdirpSync(dataDir);

afterAll(async function () {
  await logService.close();
  await Fs.remove(dataDir);
});

async function writeFile(name: string): Promise<string> {
  const path = Path.join(dataDir, name);
  await Fs.mkdirp(Path.dirname(path));
  await jsonFileService.create({ id: name }, path, fileSchema);
  return path;
}

describe('JsonFileService.delete', function () {
  it('removes the file from disk', async function () {
    const path = await writeFile(`${uuid()}.json`);

    await jsonFileService.delete(path);

    expect(await Fs.pathExists(path)).toBe(false);
  });

  it('takes the file out of the cache, so a later read fails instead of serving it', async function () {
    const path = await writeFile(`${uuid()}.json`);
    await jsonFileService.read(path, fileSchema);

    await jsonFileService.delete(path);

    await expect(jsonFileService.read(path, fileSchema)).rejects.toThrow();
  });

  it('takes everything below a folder out of the cache too', async function () {
    // Deleting a Collection or a Project removes a folder, and every file
    // it held is cached under its own path
    const name = uuid();
    const folder = Path.join(dataDir, name);
    const path = await writeFile(Path.join(name, 'nested.json'));
    await jsonFileService.read(path, fileSchema);

    await jsonFileService.delete(folder);

    await expect(jsonFileService.read(path, fileSchema)).rejects.toThrow();
  });

  it('logs the deletion at info, because it records what happened', async function () {
    const path = await writeFile(`${uuid()}.json`);
    const info = vi.spyOn(logService, 'info');

    await jsonFileService.delete(path);

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Deleted "${path}"`,
        meta: { 'file.path': path },
      })
    );
    info.mockRestore();
  });

  it('neither fails nor logs for a path that is not there, since nothing was deleted', async function () {
    const info = vi.spyOn(logService, 'info');

    await expect(
      jsonFileService.delete(Path.join(dataDir, 'never-existed.json'))
    ).resolves.toBeUndefined();

    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});

describe('deleting an entity takes it out of the file cache', function () {
  it('does not read a deleted Entry back out of the cache', async function () {
    const project = await createProject();
    const collection = await createCollection(project.id);
    const asset = await createAsset(project.id);
    const entry = await createEntry(project.id, collection.id, asset.id);
    const props = {
      projectId: project.id,
      collectionId: collection.id,
      id: entry.id,
    };

    await core.entries.delete(props);

    await expect(core.entries.read(props)).rejects.toThrow();
    await project.destroy();
  }, 60000);
});
