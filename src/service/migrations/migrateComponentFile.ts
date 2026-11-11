import {
  componentFileSchema,
  migrateComponentSchema,
  type ComponentFile,
} from '../../schema/index.js';
import { applyMigrations } from './applyMigrations.js';
import { migrating } from './migrating.js';
import { componentMigrations } from './componentMigrations.js';

/**
 * Upgrades a potentially outdated raw Component file through the component
 * migration chain and parses it into the current `ComponentFile` shape.
 *
 * The pure transform behind `ComponentService.migrate` and the release
 * diff's reads at a git ref, which share it the way `migrateEntryFile` is
 * shared.
 */
export function migrateComponentFile(
  coreVersion: string,
  potentiallyOutdatedComponentFile: unknown
): ComponentFile {
  return migrating('Component', () => {
    const loose = migrateComponentSchema.parse(
      potentiallyOutdatedComponentFile
    );
    const migrated = applyMigrations(loose, componentMigrations, coreVersion);
    return componentFileSchema.parse(migrated);
  });
}
