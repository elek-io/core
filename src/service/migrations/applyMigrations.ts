import Semver from 'semver';
import type { Migration } from '../../schema/migrationSchema.js';
import type { Version } from '../../schema/baseSchema.js';
import { CoreError } from '../../util/shared.js';

export function applyMigrations(
  data: Record<string, unknown>,
  migrations: Migration[],
  targetVersion: Version
): Record<string, unknown> {
  let current = structuredClone(data);

  while (current['coreVersion'] !== targetVersion) {
    const currentVersion = current['coreVersion'];
    if (
      typeof currentVersion === 'string' &&
      Semver.valid(currentVersion) !== null &&
      Semver.gt(currentVersion, targetVersion)
    ) {
      throw CoreError.versionSkew(
        `The data was written by @elek-io/core "${currentVersion}" but "${targetVersion}" is installed. Update the "@elek-io/core" dependency to "${currentVersion}" or newer.`
      );
    }

    const migration = migrations.find((m) => m.from === current['coreVersion']);
    if (!migration) {
      // No migration registered for this older version = assume backward-compatible
      current['coreVersion'] = targetVersion;
      break;
    }
    current = migration.run(current);
    current['coreVersion'] = migration.to;
  }

  return current;
}
