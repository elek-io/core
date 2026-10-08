import type { LoaderContext } from 'astro/loaders';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import core, { type Collection } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
} from '../test/util.js';
import { elekEntriesLoader } from './loaders.js';
import type { ContentWatcher } from './watch.js';

/**
 * Runs the Entries loader the way `astro dev` does: `createSchema()` once,
 * then `load()` with a watcher, and a reload for every change the watcher
 * reports. The shared test Core stands in for elek.io Desktop, writing to
 * the data directory the loaders' own Core reads.
 */
async function startLoader(projectId: string) {
  const handlers: Array<(path: string) => unknown> = [];
  const watcher: ContentWatcher = {
    add: () => undefined,
    on: (_event, handler) => {
      handlers.push(handler);
    },
  };
  const warnings: string[] = [];
  const errors: string[] = [];
  const store = new Map<string, { data: unknown; digest: string }>();
  const context = {
    logger: {
      info: () => undefined,
      debug: () => undefined,
      warn: (message: string) => warnings.push(message),
      error: (message: string) => errors.push(message),
    },
    store: {
      get: (id: string) => store.get(id),
      set: (entry: { id: string; data: unknown; digest: string }) =>
        store.set(entry.id, entry),
      keys: () => [...store.keys()],
      delete: (id: string) => store.delete(id),
    },
    generateDigest: (data: unknown) => JSON.stringify(data),
    parseData: ({ data }: { data: unknown }) => Promise.resolve(data),
    watcher,
  } as unknown as LoaderContext;

  const loader = elekEntriesLoader({
    config: { projects: { website: { id: projectId } } },
    project: 'website',
    collectionIdOrSlug: 'products',
  });
  if ('createSchema' in loader) {
    await loader.createSchema();
  }
  await loader.load(context);
  // Only what a reload reports, the first load may warn about no Entries
  warnings.length = 0;
  errors.length = 0;

  return {
    store,
    warnings,
    errors,
    /** Reports a change below the Collection and waits for its reload */
    reload: async (changedPath: string) => {
      const reported = warnings.length + errors.length;
      const loaded = new Map(store);
      for (const handler of handlers) handler(changedPath);
      await vi.waitFor(
        () => {
          const settled =
            warnings.length + errors.length > reported ||
            [...store.keys()].some((id) => !loaded.has(id));
          if (!settled) throw new Error('Not reloaded yet');
        },
        { timeout: 10000, interval: 20 }
      );
    },
  };
}

function renameCollection(projectId: string, collection: Collection) {
  return core.collections.update({
    projectId,
    id: collection.id,
    icon: collection.icon,
    name: collection.name,
    description: collection.description,
    fieldDefinitions: collection.fieldDefinitions,
    slug: { singular: 'article', plural: 'articles' },
  });
}

describe('the Entries loader while astro dev runs', function () {
  it('keeps reloading Entries while the Collection stays the same', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    const asset = await createAsset(project.id);
    const { store, warnings, errors, reload } = await startLoader(project.id);

    const entry = await createEntry(project.id, collection.id, asset.id);
    await reload(
      core.util.pathTo.entryFile(project.id, collection.id, entry.id)
    );

    expect(store.has(entry.id)).toBe(true);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  }, 60000);

  it('asks for a restart when the Collection it loads is renamed', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    const { warnings, errors, reload } = await startLoader(project.id);

    await renameCollection(project.id, collection);
    await reload(core.util.pathTo.collectionFile(project.id, collection.id));

    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining('was renamed or replaced'),
    ]);
  }, 60000);

  it('asks for a restart when another Collection takes over its slug', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    const { warnings, errors, reload } = await startLoader(project.id);

    // Same field definitions, so the content model alone would not tell
    // the two Collections apart
    await renameCollection(project.id, collection);
    await core.collections.create({
      projectId: project.id,
      icon: collection.icon,
      name: collection.name,
      description: collection.description,
      fieldDefinitions: collection.fieldDefinitions,
      slug: collection.slug,
    });
    await reload(core.util.pathTo.collectionFile(project.id, collection.id));

    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining('was renamed or replaced'),
    ]);
  }, 60000);
});
