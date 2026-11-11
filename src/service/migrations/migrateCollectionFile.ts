import {
  collectionFileSchema,
  migrateCollectionSchema,
  type CollectionFile,
} from '../../schema/index.js';
import { applyMigrations } from './applyMigrations.js';
import { migrating } from './migrating.js';
import { collectionMigrations } from './collectionMigrations.js';

/**
 * Upgrades a potentially outdated raw Collection file through the collection
 * migration chain and parses it into the current `CollectionFile` shape.
 *
 * The pure transform behind `CollectionService.migrate` and the release
 * diff's reads at a git ref, which share it the way `migrateEntryFile` is
 * shared.
 */
export function migrateCollectionFile(
  coreVersion: string,
  potentiallyOutdatedCollectionFile: unknown
): CollectionFile {
  return migrating('Collection', () => {
    const loose = migrateCollectionSchema.parse(
      potentiallyOutdatedCollectionFile
    );
    const migrated = applyMigrations(loose, collectionMigrations, coreVersion);
    return collectionFileSchema.parse(migrated);
  });
}
