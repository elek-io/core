/**
 * Decides whether Core keeps what it derives from a Project's files, and
 * clears all of it in one call.
 *
 * It holds no data. Each cache stays with its service, asks `isEnabled`
 * before keeping anything and registers how to clear itself, all in the
 * Core constructor. Whatever changes a working tree under a running Core
 * calls `clear()`: a git command, a Project folder moved into place, a
 * rollback that could not finish.
 *
 * @see ../../docs/storage-layout.md
 */
export class CacheService {
  /** The `cache` option, false when another application writes the files */
  public readonly isEnabled: boolean;
  private readonly clears: (() => void)[] = [];

  public constructor(isEnabled: boolean) {
    this.isEnabled = isEnabled;
  }

  /** Registers how one cache is cleared */
  public register(clear: () => void): void {
    this.clears.push(clear);
  }

  /** Clears every registered cache, for every Project at once */
  public clear(): void {
    for (const clear of this.clears) {
      clear();
    }
  }
}
