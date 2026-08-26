import { CoreError } from '../../util/shared.js';

/**
 * Runs a migration and turns a failed schema parse into a `CoreError`.
 *
 * It wraps the public `migrate()` methods, which a history read,
 * `ProjectService.upgrade` and `ReferenceService.readEntryFileMigrating`
 * reach. Those run outside `validated()`, so nothing else would convert a
 * `ZodError` for them. A normal read does not come through here, it goes
 * through `JsonFileService.read` and never migrates. A `CoreError` raised
 * inside, such as `applyMigrations`'s `VersionSkew`, passes through.
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
