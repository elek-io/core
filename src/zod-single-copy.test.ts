import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fs from 'fs-extra';
import { describe, expect, it } from 'vitest';

/**
 * Guards the single-zod-copy invariant.
 *
 * zod v4 brands every schema with its exact version, so two physical zod copies in the
 * dependency tree make Core's schemas unassignable to a consumer's zod. That breaks
 * downstream type-checking such as @hookform/resolvers' zodResolver. zod is a required
 * peer dependency for this reason. See contributing/peer-dependencies.md.
 *
 * This reads the committed pnpm-lock.yaml and fails if more than one zod version
 * resolves. If it fails after a dependency change, run `pnpm dedupe`. astro and
 * @scalar/* depend on zod through caret ranges that resolve up to the newest zod, so a
 * partial install can leave a second copy alongside the version Core pins.
 */
const lockfilePath = Path.resolve(
  Path.dirname(fileURLToPath(import.meta.url)),
  '../pnpm-lock.yaml'
);

/**
 * Collects the distinct zod versions from pnpm-lock.yaml. Package keys look like
 * `  zod@4.4.3:` (and `  zod@4.4.3: {}` in the snapshots block). Scoped packages such
 * as @hono/zod-openapi start with `  @hono/...` and never match.
 */
function resolvedZodVersions(lockfile: string): string[] {
  const versions = new Set<string>();
  for (const [, version] of lockfile.matchAll(/^ {2}zod@([^\s:(]+):/gm)) {
    if (version) versions.add(version);
  }
  return [...versions].sort();
}

describe('zod single copy', () => {
  it('resolves to exactly one zod version in pnpm-lock.yaml', async () => {
    const lockfile = await Fs.readFile(lockfilePath, 'utf8');
    const versions = resolvedZodVersions(lockfile);

    // Sanity check that the matcher still finds zod at all.
    expect(versions.length).toBeGreaterThan(0);

    expect(
      versions,
      `Expected a single zod copy but the lockfile resolves ${versions.length} (${versions.join(', ')}). ` +
        `Run "pnpm dedupe" to collapse them. See contributing/peer-dependencies.md.`
    ).toHaveLength(1);
  });
});
