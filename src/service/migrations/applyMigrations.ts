import Semver from 'semver';
import type { Migration } from '../../schema/migrationSchema.js';
import type { Version } from '../../schema/baseSchema.js';
import { CoreError } from '../../util/shared.js';

/**
 * Walks `data` forward to `targetVersion`, one registered migration at a time.
 * It clones its input and reads no disk.
 *
 * Two decisions the loop does not explain: data whose `coreVersion` is newer
 * than `targetVersion` throws `VersionSkew` naming both versions rather than
 * being stamped down, and an older version with no migration whose `from`
 * matches is assumed backward-compatible and simply stamped to the target.
 */
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
