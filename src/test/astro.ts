import type { LoaderContext } from 'astro/loaders';
import Path from 'node:path';
import Url from 'node:url';
import type { ContentWatcher } from '../astro/watch.js';

/** One logged line, with the level it was logged at. */
export interface LoggedLine {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

/** The levels a loader and Core both log at, in rising order */
export const logLevels = ['debug', 'info', 'warn', 'error'] as const;

/**
 * A `LoaderContext` whose logger records the level of every line, which is
 * what pins both the logger a message took and the level it took there.
 *
 * Without a watcher it is the context a build hands a loader, with one the
 * context `astro dev` hands it. `parse` stands in for Astro validating what
 * the loader stores against the schema the loader supplied.
 */
export function createLoaderContext(options: {
  root: string;
  watcher?: ContentWatcher;
  parse?: (data: unknown) => Promise<unknown>;
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
    parseData: ({ data }: { data: unknown }) =>
      options.parse === undefined ? Promise.resolve(data) : options.parse(data),
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
