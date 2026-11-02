import { describe, expect, it } from 'vitest';
import { firstReleaseByCommit } from './git.js';

/**
 * The ancestry half of naming the Release that first included a commit. The
 * service half, which reads the tags and the walk from git, is proven in
 * `EntryService.history.test.ts` against real Projects.
 */
describe('firstReleaseByCommit', function () {
  /**
   * A walk as `git rev-list --parents --topo-order` prints it, children
   * before parents, built from a list of `commit parent...` lines.
   */
  function walkOf(...lines: string[]) {
    return `${lines.join('\n')}\n`;
  }

  it('should name the oldest Release that contains a commit', function () {
    const walk = walkOf(
      'release2 version2',
      'version2 change2',
      'change2 release1',
      'release1 change1',
      'change1'
    );

    const releases = firstReleaseByCommit(
      walk,
      new Set(['release1', 'release2'])
    );

    expect(releases.get('change1')).toEqual('release1');
    expect(releases.get('change2')).toEqual('release2');
  });

  it('should name no Release for a commit no Release descends from', function () {
    const walk = walkOf('change2 release1', 'release1 change1', 'change1');

    const releases = firstReleaseByCommit(walk, new Set(['release1']));

    expect(releases.has('change2')).toBe(false);
  });

  it('should name the Release after the merge for a merged commit, whatever its date', function () {
    // `merge` joins the Release made elsewhere with a change made before it
    const walk = walkOf(
      'release2 merge',
      'merge release1 elsewhere',
      'release1 shared',
      'elsewhere shared',
      'shared'
    );

    const releases = firstReleaseByCommit(
      walk,
      new Set(['release1', 'release2'])
    );

    expect(releases.get('elsewhere')).toEqual('release2');
    expect(releases.get('shared')).toEqual('release1');
  });

  it('should name nothing while the Project holds no Release', function () {
    const walk = walkOf('change2 change1', 'change1');

    expect(firstReleaseByCommit(walk, new Set()).size).toEqual(0);
  });
});
