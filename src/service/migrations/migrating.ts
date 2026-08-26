import { CoreError } from '../../util/shared.js';

/**
 * Runs a migration and turns a failed schema parse into a `CoreError`.
 *
 * Migrating is the one place a file Core did not write reaches a consumer, and
 * it sits on every read path, so a raw `ZodError` escaping here would break the
 * promise every service makes. A `CoreError` raised inside, such as the
 * `VersionSkew` `applyMigrations` throws, passes through untouched.
 *
 * @see ../../../contributing/migration-and-history-flow.md
 */
export function migrating<T>(entity: string, migrate: () => T): T {
  try {
    return migrate();
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw CoreError.badRequest(
      `The ${entity} file does not match what Core expects, so it cannot be migrated.`,
      error
    );
  }
}
