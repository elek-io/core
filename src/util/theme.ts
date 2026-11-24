import Semver from 'semver';
import { SEMANTIC_VERSION } from '../schema/baseSchema.js';

/**
 * How a theme tags one version of itself: `v` and a semantic version, such
 * as `v1.2.0`. Everything else a repository tags is not a version of the
 * theme and is skipped.
 *
 * It reads the version through the same grammar every version of Core goes
 * through, so a tag names a version exactly when `versionSchema` takes it.
 */
export const THEME_VERSION_TAG = new RegExp(`^v(${SEMANTIC_VERSION.source})$`);

/** The tag a theme's version is read from */
export function themeVersionTag(version: string): string {
  return `v${version}`;
}

/**
 * The versions given, newest first, with every one semver cannot read left
 * out. By what a version means rather than by its text, so `1.10.0` comes
 * before `1.9.0` and a pre-release before the release it leads to.
 */
export function versionsNewestFirst(versions: readonly string[]): string[] {
  return Semver.rsort([
    ...new Set(
      versions.filter((version) => {
        return Semver.valid(version) !== null;
      })
    ),
  ]);
}

/**
 * The versions a theme tagged, read off the ref names a remote advertises
 * and ordered newest first. A ref that is no `v<version>` tag is skipped,
 * and so is a version semver cannot read.
 */
export function themeVersions(refNames: readonly string[]): string[] {
  return versionsNewestFirst(
    refNames
      .map((refName) => {
        const tag = refName.startsWith('refs/tags/')
          ? refName.slice('refs/tags/'.length)
          : refName;
        return THEME_VERSION_TAG.exec(tag)?.[1];
      })
      .filter((version): version is string => {
        return version !== undefined;
      })
  );
}

/**
 * Whether one version of a theme is newer than another, by what a version
 * means rather than by its text, so `1.10.0` is newer than `1.9.0` and a
 * pre-release older than the release it leads to.
 *
 * Each has to be a version `versionSchema` takes, which every version a
 * Project holds is, because that is what parsed it on the way in.
 */
export function isNewerVersion(version: string, than: string): boolean {
  return Semver.gt(version, than);
}

/**
 * Whether a version is a pre-release, such as `2.0.0-beta.1`, which a theme
 * tags ahead of the release it leads to.
 *
 * Core lists one among a theme's versions and takes it only when it is
 * named, so a consumer offering an editor a version has this to say which
 * one it is offering.
 */
export function isPreReleaseVersion(version: string): boolean {
  return Semver.prerelease(version) !== null;
}

/**
 * The newest version of a theme, or null when it tagged none. A pre-release
 * is left out, because it is taken only when it is named.
 */
export function newestThemeVersion(refNames: readonly string[]): string | null {
  return (
    themeVersions(refNames).find((version) => {
      return isPreReleaseVersion(version) === false;
    }) ?? null
  );
}
