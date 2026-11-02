import { describe, expect, it } from 'vitest';
import {
  baselineVersions,
  bumpBetween,
  INITIAL_PROJECT_VERSION,
  releaseVersionOf,
} from './release.js';

/**
 * A Release's bump and the Release it was built on are read off the versions
 * of a Project's tags, because the tags of one Project can share a second and
 * a provisioned copy holds each of them without the history between them.
 * See contributing/releases.md.
 */
describe('releaseVersionOf', function () {
  it.each([
    ['0.1.0', '0.1.0'],
    ['0.3.0-preview.2', '0.3.0'],
    ['1.2.3+build.4', '1.2.3'],
    ['1.2.3-preview.1+build.4', '1.2.3'],
  ])('reads %s as the Release %s', function (version, expected) {
    expect(releaseVersionOf(version)).toEqual(expected);
  });
});

describe('bumpBetween', function () {
  it.each([
    [INITIAL_PROJECT_VERSION, '0.1.0', 'minor'],
    [INITIAL_PROJECT_VERSION, '1.0.0', 'major'],
    [INITIAL_PROJECT_VERSION, '0.0.2', 'patch'],
    ['0.2.0', '0.2.1', 'patch'],
    ['0.2.0', '0.3.0', 'minor'],
    ['0.2.0', '1.0.0', 'major'],
    // A preview carries the bump of the Release it targets
    ['0.2.0', '0.3.0-preview.1', 'minor'],
    ['0.2.0', '0.2.1-preview.3', 'patch'],
  ])('reads %s to %s as a %s bump', function (from, to, expected) {
    expect(bumpBetween(from, to)).toEqual(expected);
  });

  it('answers null where the two versions target one Release', function () {
    // Which two Releases of one Project never do, so nothing but a tag
    // written by hand reaches it
    expect(bumpBetween('0.2.0', '0.2.0')).toBeNull();
    expect(bumpBetween('0.2.0', '0.2.0-preview.1')).toBeNull();
  });
});

describe('baselineVersions', function () {
  /** A Project's tags, in the order a date sort returns them. */
  const releases = [
    { id: 'major', version: '1.0.0', isFull: true },
    { id: 'patch', version: '0.2.1', isFull: true },
    { id: 'patch-preview', version: '0.2.1-preview.1', isFull: false },
    { id: 'minor', version: '0.2.0', isFull: true },
    { id: 'first', version: '0.1.0', isFull: true },
    { id: 'first-preview', version: '0.1.0-preview.1', isFull: false },
  ];

  it('names the full Release below each Release, whatever order they come in', function () {
    const baselines = baselineVersions(releases);

    expect(baselines.get('major')).toEqual('0.2.1');
    expect(baselines.get('patch')).toEqual('0.2.0');
    expect(baselines.get('minor')).toEqual('0.1.0');
    expect(baselineVersions(releases.toReversed()).get('patch')).toEqual(
      '0.2.0'
    );
  });

  it('names the last full Release before a preview, never the preview itself', function () {
    const baselines = baselineVersions([
      ...releases,
      { id: 'second-preview', version: '0.2.1-preview.2', isFull: false },
    ]);

    expect(baselines.get('patch-preview')).toEqual('0.2.0');
    expect(baselines.get('second-preview')).toEqual('0.2.0');
    // The Release a preview targets is built on what the preview was
    expect(baselines.get('patch')).toEqual('0.2.0');
  });

  it('answers null for the first Release of a Project and its previews', function () {
    const baselines = baselineVersions(releases);

    expect(baselines.get('first')).toBeNull();
    expect(baselines.get('first-preview')).toBeNull();
    expect(baselineVersions([]).size).toEqual(0);
  });
});
