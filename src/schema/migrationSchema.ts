import type { Version } from './baseSchema.js';

export interface Migration {
  /** The coreVersion this migration transforms FROM (exact match) */
  from: Version;
  /** The coreVersion after this migration has been applied */
  to: Version;
  /**
   * Pure function: receives loose-parsed data, returns a new transformed object.
   * Must NOT mutate the input. Must NOT set `coreVersion` — that is handled by `applyMigrations`.
   */
  run: (data: Record<string, unknown>) => Record<string, unknown>;
}
