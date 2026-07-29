import { describe, expect, it, vi } from 'vitest';
import Path from 'node:path';
import { watchContent, type ContentWatcher } from './watch.js';

/**
 * Stands in for the watcher Astro hands a loader in dev. The real one
 * is vite's, shared with the whole Astro project, which is why the
 * handlers have to filter by path themselves.
 */
function fakeWatcher() {
  const handlers: Array<(path: string) => unknown> = [];
  const added: string[] = [];

  const watcher: ContentWatcher = {
    add: (path) => {
      added.push(path);
    },
    on: (_event, handler) => {
      handlers.push(handler);
    },
  };

  return {
    watcher,
    added,
    /** Fires every registered handler, as chokidar would */
    emit: (path: string): void => {
      for (const handler of handlers) handler(path);
    },
  };
}

/** Resolves once every pending timer and microtask has run */
function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const watched = Path.join('/data', 'projects', 'p1', 'collections', 'c1');

describe('watchContent', () => {
  it('watches every path it is given', () => {
    const { watcher, added } = fakeWatcher();
    const other = Path.join('/data', 'projects', 'p1', 'assets');

    watchContent({
      watcher,
      paths: [watched, other],
      onChange: () => Promise.resolve(),
      onError: () => {},
    });

    expect(added).toEqual([watched, other]);
  });

  it('runs onChange after a file below a watched path changed', async () => {
    const { watcher, emit } = fakeWatcher();
    const onChange = vi.fn(() => Promise.resolve());

    watchContent({
      watcher,
      paths: [watched],
      onChange,
      onError: () => {},
      debounceMs: 5,
    });
    emit(Path.join(watched, 'entry.json'));
    await settle(30);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a change outside the watched paths', async () => {
    // The watcher is vite's, so it fires for every file of the Astro
    // project. Only what belongs to the Collection may trigger a reload.
    const { watcher, emit } = fakeWatcher();
    const onChange = vi.fn(() => Promise.resolve());

    watchContent({
      watcher,
      paths: [watched],
      onChange,
      onError: () => {},
      debounceMs: 5,
    });
    emit(Path.join('/data', 'projects', 'p1', 'collections', 'c2', 'e.json'));
    emit(Path.join('/somewhere', 'else.ts'));
    await settle(30);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not mistake a sibling directory with a shared prefix for a match', async () => {
    const { watcher, emit } = fakeWatcher();
    const onChange = vi.fn(() => Promise.resolve());

    watchContent({
      watcher,
      paths: [watched],
      onChange,
      onError: () => {},
      debounceMs: 5,
    });
    emit(`${watched}-backup${Path.sep}entry.json`);
    await settle(30);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('coalesces a burst of changes into a single run', async () => {
    // Saving an Entry in the Desktop app writes more than one file
    const { watcher, emit } = fakeWatcher();
    const onChange = vi.fn(() => Promise.resolve());

    watchContent({
      watcher,
      paths: [watched],
      onChange,
      onError: () => {},
      debounceMs: 20,
    });
    emit(Path.join(watched, 'a.json'));
    emit(Path.join(watched, 'b.json'));
    emit(Path.join(watched, 'c.json'));
    await settle(60);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('runs once more when a change arrives while it is running', async () => {
    const { watcher, emit } = fakeWatcher();
    let resolveFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const onChange = vi.fn(() => first);

    watchContent({
      watcher,
      paths: [watched],
      onChange,
      onError: () => {},
      debounceMs: 5,
    });

    emit(Path.join(watched, 'a.json'));
    await settle(20);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Arrives while the first run is still in flight
    emit(Path.join(watched, 'b.json'));
    await settle(20);
    expect(onChange).toHaveBeenCalledTimes(1);

    resolveFirst();
    await settle(30);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reports a failing onChange instead of throwing into the watcher', async () => {
    // An unhandled rejection here would take the dev server with it
    const { watcher, emit } = fakeWatcher();
    const error = new Error('read failed');
    const onError = vi.fn();

    watchContent({
      watcher,
      paths: [watched],
      onChange: () => Promise.reject(error),
      onError,
      debounceMs: 5,
    });
    emit(Path.join(watched, 'a.json'));
    await settle(30);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('keeps watching after a failed run', async () => {
    const { watcher, emit } = fakeWatcher();
    const onChange = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue();

    watchContent({
      watcher,
      paths: [watched],
      onChange,
      onError: () => {},
      debounceMs: 5,
    });

    emit(Path.join(watched, 'a.json'));
    await settle(30);
    emit(Path.join(watched, 'b.json'));
    await settle(30);

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
