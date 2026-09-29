import Path from 'node:path';

/**
 * The part of vite's `FSWatcher` the loaders use. Narrower than the
 * real thing on purpose, so the wiring can be tested without one.
 */
export interface ContentWatcher {
  add: (path: string) => unknown;
  on: (
    event: 'add' | 'change' | 'unlink',
    handler: (path: string) => unknown
  ) => unknown;
}

export interface WatchContentProps {
  /** The watcher Astro hands a loader in dev, absent in a build */
  watcher: ContentWatcher;
  /** Absolute directories whose contents should trigger a reload */
  paths: string[];
  /** Reloads the collection, never called twice concurrently */
  onChange: () => Promise<void>;
  /** Reports a failed reload, dev keeps running either way */
  onError: (error: unknown) => void;
  /**
   * How long to wait for a burst of changes to finish. Saving an Entry
   * writes more than one file, and reloading per file would read the
   * Collection several times for one edit.
   *
   * @default 100
   */
  debounceMs?: number;
}

/**
 * Reloads a collection while `astro dev` runs, whenever a file below
 * one of the given paths changes.
 *
 * The `paths` sit under the elek.io data directory, outside the Astro
 * project, so `watcher.add` is what extends vite's watcher to them. The
 * watcher then covers both, and every handler fires for every file, so
 * matching against `paths` is what keeps an unrelated edit from reloading.
 *
 * Runs never overlap: a change arriving during a run queues exactly one more,
 * so a burst cannot pile up reads of the same Collection.
 */
export function watchContent(props: WatchContentProps): void {
  const { watcher, paths, onChange, onError } = props;
  const debounceMs = props.debounceMs ?? 100;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let isRunning = false;
  let hasPending = false;

  const run = async (): Promise<void> => {
    if (isRunning) {
      hasPending = true;
      return;
    }
    isRunning = true;
    try {
      await onChange();
    } catch (error) {
      onError(error);
    } finally {
      isRunning = false;
      if (hasPending) {
        hasPending = false;
        schedule();
      }
    }
  };

  const schedule = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, debounceMs);
    // Never hold the process open for a pending reload
    timer.unref?.();
  };

  const isWatched = (changed: string): boolean => {
    return paths.some(
      (path) => changed === path || changed.startsWith(path + Path.sep)
    );
  };

  for (const path of paths) {
    watcher.add(path);
  }

  for (const event of ['add', 'change', 'unlink'] as const) {
    watcher.on(event, (changed) => {
      if (isWatched(changed)) {
        schedule();
      }
    });
  }
}
