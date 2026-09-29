/**
 * Clears every cache that mirrors a Project's working tree, in one call.
 *
 * It holds no data. Each cache stays with the service that owns it and
 * registers how to clear itself, which the Core constructor does for all of
 * them in one place. Whatever changes a working tree under a running Core
 * calls `clear()`: a git command that rewrites it, a Project folder moved
 * into place, a rollback that could not finish.
 *
 * @see ../../docs/storage-layout.md
 */
export class CacheService {
  private readonly clears: (() => void)[] = [];

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
