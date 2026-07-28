import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fs from 'fs-extra';
import Path from 'node:path';
import core from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from '../test/util.js';
import type { Project } from '../index.node.js';

/**
 * Listing Assets or Entries scans a folder Core wrote itself, and a
 * few of the files in it are never entities. Warning about those made
 * every consumer build print about files that are supposed to be
 * there, with no way to silence them.
 *
 * The warning still has a job, so both halves are asserted: silence
 * for what Core put there, and a warning naming anything else.
 */
describe('Listing entity files', function () {
  let project: Project & { destroy: () => Promise<void> };
  let collectionId: string;

  beforeAll(async function () {
    project = await createProject('List References Test');
    const asset = await createAsset(project.id);
    const collection = await createCollection(project.id);
    collectionId = collection.id;
    await createEntry(project.id, collection.id, asset.id);
  }, 60000);

  afterAll(async function () {
    await project.destroy();
  }, 30000);

  it('should not warn about the files Core writes itself', async function () {
    const warn = vi.spyOn(core.logger, 'warn');

    // ".gitkeep" keeps the empty Assets folder in git, "collection.json"
    // is the Collection's own file and sits where its Entries are
    await core.assets.list({ projectId: project.id, limit: 0 });
    await core.entries.list({ projectId: project.id, collectionId, limit: 0 });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  }, 30000);

  it('should still warn about a file it does not recognize', async function () {
    const stray = Path.join(
      core.util.pathTo.assets(project.id),
      'not-an-asset.txt'
    );
    await Fs.outputFile(stray, '');
    const warn = vi.spyOn(core.logger, 'warn');

    await core.assets.list({ projectId: project.id, limit: 0 });

    const messages = warn.mock.calls.map(([props]) => props.message);
    expect(
      messages.some((message) => message.includes('not-an-asset.txt'))
    ).toBe(true);
    warn.mockRestore();
    await Fs.remove(stray);
  }, 30000);
});
