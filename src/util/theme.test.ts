import { describe, expect, it } from 'vitest';
import {
  isNewerVersion,
  isPreReleaseVersion,
  newestThemeVersion,
  themeVersions,
  themeVersionTag,
  versionsNewestFirst,
} from './theme.js';

describe('versionsNewestFirst', function () {
  it('orders by what a version means rather than by its text', function () {
    expect(versionsNewestFirst(['1.9.0', '1.10.0', '1.2.0'])).toEqual([
      '1.10.0',
      '1.9.0',
      '1.2.0',
    ]);
  });

  it('puts a pre-release before the release it leads to', function () {
    expect(versionsNewestFirst(['1.0.0-rc.1', '1.0.0'])).toEqual([
      '1.0.0',
      '1.0.0-rc.1',
    ]);
  });

  it('leaves out what semver cannot read and lists a version once', function () {
    expect(versionsNewestFirst(['1.0.0', 'latest', '1.0', '1.0.0'])).toEqual([
      '1.0.0',
    ]);
  });

  it('is empty for nothing', function () {
    expect(versionsNewestFirst([])).toEqual([]);
  });
});

describe('themeVersions', function () {
  it('reads every v<version> tag and orders them newest first', function () {
    expect(
      themeVersions([
        'refs/tags/v1.0.0',
        'refs/tags/v1.10.0',
        'refs/tags/v1.2.0',
        'refs/tags/v2.0.0-beta.1',
      ])
    ).toEqual(['2.0.0-beta.1', '1.10.0', '1.2.0', '1.0.0']);
  });

  it('skips a ref that is no version tag of the theme', function () {
    expect(
      themeVersions([
        'refs/heads/main',
        'refs/tags/latest',
        'refs/tags/release-1.0.0',
        'refs/tags/1.0.0',
        'refs/tags/v1',
        'refs/tags/v1.0',
        'refs/tags/vv1.0.0',
        'refs/tags/v01.1.0',
        'refs/tags/v1.0.0-beta_1',
        'refs/tags/v1.0.0',
      ])
    ).toEqual(['1.0.0']);
  });

  it('reads a pre-release identifier holding a dash', function () {
    expect(themeVersions(['refs/tags/v1.1.0-rc-hotfix.1'])).toEqual([
      '1.1.0-rc-hotfix.1',
    ]);
  });

  it('reads a bare tag name as well as a full ref name', function () {
    expect(themeVersions(['v1.0.0'])).toEqual(['1.0.0']);
  });

  it('lists a version advertised twice once', function () {
    expect(themeVersions(['refs/tags/v1.0.0', 'v1.0.0'])).toEqual(['1.0.0']);
  });

  it('is empty for a theme that tagged nothing', function () {
    expect(themeVersions([])).toEqual([]);
  });
});

describe('newestThemeVersion', function () {
  it('takes the newest version rather than the newest tag', function () {
    expect(
      newestThemeVersion([
        'refs/tags/v1.10.0',
        'refs/tags/v1.9.0',
        'refs/tags/v1.2.0',
      ])
    ).toEqual('1.10.0');
  });

  it('leaves out a pre-release, which is taken only when it is named', function () {
    expect(
      newestThemeVersion(['refs/tags/v1.0.0', 'refs/tags/v2.0.0-beta.1'])
    ).toEqual('1.0.0');
  });

  it('is null for a theme whose only versions are pre-releases', function () {
    expect(newestThemeVersion(['refs/tags/v2.0.0-beta.1'])).toBeNull();
  });

  it('is null for a theme that tagged no version', function () {
    expect(newestThemeVersion(['refs/heads/main'])).toBeNull();
  });
});

describe('themeVersionTag', function () {
  it('names the tag a version is read from', function () {
    expect(themeVersionTag('1.2.0')).toEqual('v1.2.0');
  });
});

describe('isNewerVersion', function () {
  it('reads what a version means rather than its text', function () {
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(false);
  });

  it('reads a pre-release as older than the release it leads to', function () {
    expect(isNewerVersion('2.0.0-beta.1', '2.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0', '2.0.0-beta.1')).toBe(true);
    expect(isNewerVersion('2.0.0-beta.2', '2.0.0-beta.1')).toBe(true);
  });

  it('is false for one version against itself', function () {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('isPreReleaseVersion', function () {
  it('is true for a version a theme tags ahead of a release', function () {
    expect(isPreReleaseVersion('2.0.0-beta.1')).toBe(true);
    expect(isPreReleaseVersion('2.0.0-0')).toBe(true);
  });

  it('is false for the release it leads to, build metadata included', function () {
    expect(isPreReleaseVersion('2.0.0')).toBe(false);
    expect(isPreReleaseVersion('2.0.0+build.1')).toBe(false);
  });
});
