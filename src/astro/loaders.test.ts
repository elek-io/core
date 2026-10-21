import type { LoaderContext } from 'astro/loaders';
import Path from 'node:path';
import Url from 'node:url';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import core, { type Collection } from '../test/setup.js';
import {
  createAsset,
  createCollection,
  createEntry,
  createProject,
  tmpDirPath,
} from '../test/util.js';
import { elekCollections } from './collections.js';
import { getCore } from './core.js';
import { elekAssetsLoader, elekEntriesLoader } from './loaders.js';
import type { ContentWatcher } from './watch.js';

/** One logged line, with the level it was logged at. */
interface LoggedLine {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

const levels = ['debug', 'info', 'warn', 'error'] as const;

/**
 * Every line as `<level>: <message up to its first id, path or quoted name>`,
 * deduplicated and sorted, so a complete set of lines can be asserted without
 * pinning the values a single line happens to carry.
 */
function summarize(lines: LoggedLine[]): string[] {
  const summaries = lines.map(
    (line) =>
      `${line.level}: ${line.message.replace(/["(][\S\s]*$/, '').trim()}`
  );
  return [...new Set(summaries)].toSorted();
}

/**
 * A `LoaderContext` whose logger records the level of every line, which is
 * what pins both the logger a message took and the level it took there.
 *
 * Without a watcher it is the context a build hands a loader, with one the
 * context `astro dev` hands it.
 */
function createLoaderContext(options: {
  root: string;
  watcher?: ContentWatcher;
}) {
  const lines: LoggedLine[] = [];
  const store = new Map<string, { data: unknown; digest: string }>();
  const record = (level: LoggedLine['level']) => (message: string) => {
    lines.push({ level, message });
  };
  const context = {
    logger: {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
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
    config: {
      root: Url.pathToFileURL(`${options.root}${Path.sep}`),
      publicDir: Url.pathToFileURL(
        `${Path.join(options.root, 'public')}${Path.sep}`
      ),
      base: '/',
    },
    ...(options.watcher === undefined ? {} : { watcher: options.watcher }),
  } as unknown as LoaderContext;

  return { context, lines, store };
}

/**
 * Records every line Core's own logger takes during the test, with its level.
 *
 * `getCore()` is called before the spies are installed, so the line Core
 * writes when it starts is never recorded here.
 */
function recordCoreLines(): LoggedLine[] {
  const lines: LoggedLine[] = [];
  const logger = getCore().logger;
  const spies = levels.map((level) =>
    vi.spyOn(logger, level).mockImplementation((props) => {
      lines.push({ level, message: props.message });
    })
  );
  onTestFinished(() => {
    for (const spy of spies) spy.mockRestore();
  });
  return lines;
}

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
  const { context, lines, store } = createLoaderContext({
    root: tmpDirPath(),
    watcher,
  });
  const problems = () =>
    lines.filter((line) => line.level === 'warn' || line.level === 'error');

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
  let reported = problems().length;

  return {
    store,
    lines,
    /** What the loader warned or errored about since the last reload */
    reportedSince: () => problems().slice(reported),
    /** Reports a change below the Collection and waits for its reload */
    reload: async (changedPath: string) => {
      reported = problems().length;
      const loaded = new Map(store);
      for (const handler of handlers) handler(changedPath);
      await vi.waitFor(
        () => {
          const settled =
            problems().length > reported ||
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
    const { store, reportedSince, reload } = await startLoader(project.id);

    const entry = await createEntry(project.id, collection.id, asset.id);
    await reload(
      core.util.pathTo.entryFile(project.id, collection.id, entry.id)
    );

    expect(store.has(entry.id)).toBe(true);
    expect(reportedSince()).toEqual([]);
  }, 60000);

  it('asks for a restart when the Collection it loads is renamed', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    const { reportedSince, reload } = await startLoader(project.id);

    await renameCollection(project.id, collection);
    await reload(core.util.pathTo.collectionFile(project.id, collection.id));

    const reported = reportedSince();
    expect(reported.map((line) => line.level)).toEqual(['warn']);
    expect(reported.map((line) => line.message)).toEqual([
      expect.stringContaining('was renamed or replaced'),
    ]);
  }, 60000);

  it('asks for a restart when another Collection takes over its slug', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    const { reportedSince, reload } = await startLoader(project.id);

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

    const reported = reportedSince();
    expect(reported.map((line) => line.level)).toEqual(['warn']);
    expect(reported.map((line) => line.message)).toEqual([
      expect.stringContaining('was renamed or replaced'),
    ]);
  }, 60000);
});

describe('the loggers an astro build writes through', function () {
  it('writes every loader line through Astro and every Core line through Core', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    const collection = await createCollection(project.id);
    const asset = await createAsset(project.id);
    await createEntry(project.id, collection.id, asset.id);
    const config = { projects: { website: { id: project.id } } };

    const coreLines = recordCoreLines();
    // A build is load() without a watcher, which is the only difference
    // to the astro dev path the tests above run
    const assetsLoader = elekAssetsLoader({ config, project: 'website' });
    const assets = createLoaderContext({ root: tmpDirPath() });
    await assetsLoader.load(assets.context);
    const entriesLoader = elekEntriesLoader({
      config,
      project: 'website',
      collectionIdOrSlug: 'products',
    });
    const entries = createLoaderContext({ root: tmpDirPath() });
    if ('createSchema' in entriesLoader) {
      await entriesLoader.createSchema();
    }
    await entriesLoader.load(entries.context);

    // The names Astro prefixes a loader's lines with
    expect(assetsLoader.name).toBe('elek-assets');
    expect(entriesLoader.name).toBe('elek-entries');

    // Everything a loader reports goes through Astro's logger, so
    // ELEK_IO_LOG_LEVEL reaches none of it
    expect(summarize(assets.lines)).toEqual([
      'info: Finished loading Assets',
      'info: Found 1 Assets',
      'info: Loading elek.io Assets of Project',
      'info: Reading Project',
    ]);
    expect(summarize(entries.lines)).toEqual([
      'info: Finished loading Entries',
      'info: Found 1 Entries',
      'info: Loading elek.io Entries of Collection',
      'info: Reading Project',
    ]);
    // And Core's logger takes none of them, which is the complete set
    // of what the same build loses at error level
    expect(summarize(coreLines)).toEqual([
      'debug: Cache miss reading file',
      'debug: Executed',
      'info: Rebuilding Collection slug index for Project',
    ]);
  }, 60000);

  it('writes the warning about deriving every collection through Core', async function () {
    const project = await createProject();
    onTestFinished(() => project.destroy());
    await createCollection(project.id);

    const coreLines = recordCoreLines();
    await elekCollections({ projects: { website: { id: project.id } } });

    // elekCollections() is handed no LoaderContext, so Core's logger is
    // the only one it can reach and the level does silence this one
    const warnings = coreLines.filter((line) => line.level === 'warn');
    expect(warnings.map((line) => line.message)).toEqual([
      expect.stringContaining('elekCollections()'),
    ]);
  }, 60000);
});
