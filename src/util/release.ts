import Semver from 'semver';
import { semverBumpSchema, type SemverBump } from '../schema/index.js';

/**
 * The version `ProjectService.create` writes, which the first Release of a
 * Project bumps from. A first Release has no Release before it, so this is
 * what its bump is read against and what its changes are compared with, and
 * both read it here rather than restating it.
 */
export const INITIAL_PROJECT_VERSION = '0.0.1';

/**
 * A Release or preview Release as its version orders it.
 */
export interface ReleaseVersion {
  /** What addresses the Release, which is what the baselines are keyed by */
  id: string;
  version: string;
  /** False for a preview, which a Release is built on but never built from */
  isFull: boolean;
}

/**
 * The Release a version targets, which is the version itself for a full
 * Release and the version without its pre-release part for a preview, so
 * `0.3.0-preview.2` reads as `0.3.0`.
 */
export function releaseVersionOf(version: string): string {
  return Semver.coerce(version)?.version ?? version;
}

/**
 * The part of the semver triple that moved from one version to another, read
 * off the two versions rather than off what changed in the content. A
 * pre-release counts as the Release it targets.
 *
 * Null when the two target the same version, which two Releases of one
 * Project never do, and when either is no semver.
 */
export function bumpBetween(from: string, to: string): SemverBump | null {
  const fromRelease = Semver.coerce(from);
  const toRelease = Semver.coerce(to);
  if (fromRelease === null || toRelease === null) {
    return null;
  }
  const parsed = semverBumpSchema.safeParse(
    Semver.diff(fromRelease, toRelease)
  );
  return parsed.success ? parsed.data : null;
}

/**
 * The version of the full Release each Release and preview Release was built
 * on, keyed by its id: the newest full Release below the version it targets,
 * and null for the first Release of a Project, which was built on the
 * Project's creation.
 *
 * One walk in version order, so a Project's whole list costs one sort rather
 * than a search per Release.
 *
 * @see ../../contributing/releases.md
 */
export function baselineVersions(
  releases: readonly ReleaseVersion[]
): Map<string, string | null> {
  const baselines = new Map<string, string | null>();
  let lastFull: string | null = null;

  for (const release of releases.toSorted(compareReleaseVersions)) {
    baselines.set(release.id, lastFull);
    if (release.isFull) {
      lastFull = release.version;
    }
  }

  return baselines;
}

/**
 * Orders two Releases oldest first, by the Release their version targets,
 * with a preview before the Release it targets, because that Release is
 * built on what the preview was built on rather than on the preview.
 *
 * Two versions no semver can be read out of keep the order they came in.
 */
function compareReleaseVersions(a: ReleaseVersion, b: ReleaseVersion): number {
  const left = Semver.coerce(a.version);
  const right = Semver.coerce(b.version);
  if (left === null || right === null) {
    return 0;
  }
  const byTarget = Semver.compare(left, right);
  return byTarget === 0 ? Number(a.isFull) - Number(b.isFull) : byTarget;
}
