import Semver from 'semver';

/**
 * How a theme tags one version of itself: `v` and a semantic version, such
 * as `v1.2.0`. Everything else a repository tags is not a version of the
 * theme and is skipped.
 */
export const THEME_VERSION_TAG = /^v(\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?)$/;

/** The tag a theme's version is read from */
export function themeVersionTag(version: string): string {
  return `v${version}`;
}

/**
 * The versions a theme tagged, read off the ref names a remote advertises
 * and ordered newest first. A ref that is no `v<version>` tag is skipped,
 * and so is a version semver cannot read.
 */
export function themeVersions(refNames: readonly string[]): string[] {
  const versions = refNames
    .map((refName) => {
      const tag = refName.startsWith('refs/tags/')
        ? refName.slice('refs/tags/'.length)
        : refName;
      return THEME_VERSION_TAG.exec(tag)?.[1];
    })
    .filter((version): version is string => {
      return version !== undefined && Semver.valid(version) !== null;
    });
  return Semver.rsort([...new Set(versions)]);
}

/**
 * The newest version of a theme, or null when it tagged none. A pre-release
 * is left out, because it is taken only when it is named.
 */
export function newestThemeVersion(refNames: readonly string[]): string | null {
  return (
    themeVersions(refNames).find((version) => {
      return Semver.prerelease(version) === null;
    }) ?? null
  );
}
