import {
  entryFileSchema,
  migrateEntrySchema,
  type EntryFile,
} from '../../schema/index.js';
import { applyMigrations } from './applyMigrations.js';
import { entryMigrations } from './entryMigrations.js';

/**
 * Upgrades a potentially outdated raw Entry file through the entry migration
 * chain and parses it into the current `EntryFile` shape.
 *
 * The pure transform behind `EntryService.migrate` (and, through it,
 * `ProjectService.upgrade`) and `ReferenceService.readEntryFileMigrating`. It
 * lives beside `applyMigrations` / `entryMigrations` so the read-with-migrate
 * reader and the public `migrate` method share one implementation.
 */
export function migrateEntryFile(
  coreVersion: string,
  potentiallyOutdatedEntryFile: unknown
): EntryFile {
  const loose = migrateEntrySchema.parse(potentiallyOutdatedEntryFile);
  const migrated = applyMigrations(loose, entryMigrations, coreVersion);
  return entryFileSchema.parse(migrated);
}
