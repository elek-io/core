import {
  assetFileSchema,
  migrateAssetSchema,
  type AssetFile,
} from '../../schema/index.js';
import { applyMigrations } from './applyMigrations.js';
import { migrating } from './migrating.js';
import { assetMigrations } from './assetMigrations.js';

/**
 * Upgrades a potentially outdated raw Asset file through the asset migration
 * chain and parses it into the current `AssetFile` shape.
 *
 * The pure transform behind `AssetService.migrate` and the release diff's
 * reads at a git ref, which share it the way `migrateEntryFile` is shared.
 */
export function migrateAssetFile(
  coreVersion: string,
  potentiallyOutdatedAssetFile: unknown
): AssetFile {
  return migrating('Asset', () => {
    const loose = migrateAssetSchema.parse(potentiallyOutdatedAssetFile);
    const migrated = applyMigrations(loose, assetMigrations, coreVersion);
    return assetFileSchema.parse(migrated);
  });
}
