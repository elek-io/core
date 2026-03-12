import type { Migration } from '../../schema/migrationSchema.js';
import type { Version } from '../../schema/baseSchema.js';

export function applyMigrations(
  data: Record<string, unknown>,
  migrations: Migration[],
  targetVersion: Version
): Record<string, unknown> {
  let current = structuredClone(data);

  while (current['coreVersion'] !== targetVersion) {
    const migration = migrations.find((m) => m.from === current['coreVersion']);
    if (!migration) {
      // No migration registered for this version gap — assume backward-compatible
      current['coreVersion'] = targetVersion;
      break;
    }
    current = migration.run(current);
    current['coreVersion'] = migration.to;
  }

  return current;
}
