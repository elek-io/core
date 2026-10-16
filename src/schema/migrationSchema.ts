import { z } from '@hono/zod-openapi';
import type { Version } from './baseSchema.js';

/**
 * The least a file has to satisfy to be considered for an upgrade, a Core
 * version to compare.
 *
 * The upgrade reads a file before any current schema applies to it, because
 * one an older Core wrote may not satisfy it. That is the point of the
 * upgrade. Every other key passes through untouched for the migrations.
 */
export const upgradeableFileSchema = z.looseObject({
  coreVersion: z.string(),
});
export type UpgradeableFile = z.infer<typeof upgradeableFileSchema>;

export interface Migration {
  /** The coreVersion this migration transforms FROM (exact match) */
  from: Version;
  /** The coreVersion after this migration has been applied */
  to: Version;
  /**
   * Pure function: receives loose-parsed data, returns a new transformed object.
   * Must NOT mutate the input. Must NOT set `coreVersion`, which is handled by `applyMigrations`.
   */
  run: (data: Record<string, unknown>) => Record<string, unknown>;
}
