import { describe, expect, it } from 'vitest';
import { classifyUnsafeAddress, firstReleaseByCommit } from './git.js';

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

/**
 * What must not reach git, because a theme's address is kept in a Project.
 * The shapes that execute are proven against real git in
 * `ContractService.theme.test.ts`.
 */
describe('classifyUnsafeAddress', function () {
  const safe = [
    'https://github.com/acme/dealer-site.git',
    'http://git.example.test/acme/dealer-site.git',
    'ssh://git@github.com/acme/dealer-site.git',
    'ssh://git@git.example.test:2222/acme/dealer-site.git',
    'git://git.example.test/acme/dealer-site.git',
    'git@github.com:acme/dealer-site.git',
    '/srv/themes/dealer-site.git',
    'C:\\themes\\dealer-site.git',
    '\\\\server\\themes\\dealer-site.git',
    'file:///srv/themes/dealer-site.git',
  ];
  for (const address of safe) {
    it(`takes "${address}", which a Project's remote takes too`, function () {
      expect(classifyUnsafeAddress(address)).toBeNull();
    });
  }

  const refused: Array<[label: string, address: string, text: string]> = [
    ['an empty address', '', 'must not be empty'],
    ['an address of whitespace alone', '   ', 'must not be empty'],
    [
      'a newline, which would break a config line',
      'https://host/repo.git\nhost=evil',
      'control character',
    ],
    [
      'an option of git',
      '--upload-pack=touch /tmp/pwned',
      'one of its own options',
    ],
    ['a short option of git', '-u', 'one of its own options'],
    [
      'the ext helper, which runs a command',
      'ext::sh -c touch% /tmp/pwned',
      'remote helper',
    ],
    ['another remote helper', 'fd::7', 'remote helper'],
    ['a helper spelled in capitals', 'EXT::sh -c id', 'remote helper'],
    [
      'a password in the address',
      'https://nils:ghp_secret@github.com/acme/site.git',
      'carries a credential',
    ],
    [
      'a user alone in the address',
      'https://nils@github.com/acme/site.git',
      'carries a credential',
    ],
    [
      'a token alone in the address',
      'https://ghp_secret@github.com/acme/site.git',
      'carries a credential',
    ],
    [
      'a password on an ssh scheme',
      'ssh://git:secret@github.com/acme/site.git',
      'carries a credential',
    ],
    [
      'a password holding an at sign, whole',
      'https://nils:p@ssw0rd@github.com/acme/site.git',
      'carries a credential',
    ],
    [
      'a percent encoded credential',
      'https://nils%40acme:ghp_secret@github.com/acme/site.git',
      'carries a credential',
    ],
    [
      'a path relative to wherever it is read from',
      './dealer-site.git',
      'has to be absolute',
    ],
    [
      'a path relative to the parent directory',
      '../themes/dealer-site.git',
      'has to be absolute',
    ],
    [
      'a bare name, which git reads as a path too',
      'dealer-site.git',
      'has to be absolute',
    ],
  ];
  for (const [label, address, text] of refused) {
    it(`refuses ${label}`, function () {
      const error = classifyUnsafeAddress(address);
      expect(error?.type).toEqual('BadRequest');
      expect(error?.message).toContain(text);
    });
  }

  it('never repeats the credential it refused', function () {
    const error = classifyUnsafeAddress(
      'https://nils:ghp_secret@github.com/acme/site.git'
    );
    expect(error?.message).not.toContain('ghp_secret');
    expect(error?.message).not.toContain('nils');
    expect(error?.message).toContain('[redacted]@github.com/acme/site.git');
  });

  it('keeps the user of the SSH shorthand, which is part of the address', function () {
    expect(classifyUnsafeAddress('git@github.com:acme/site.git')).toBeNull();
  });

  it('keeps an at sign in a query string, which is no credential', function () {
    expect(classifyUnsafeAddress('https://host/repo.git?from=a@b')).toBeNull();
  });
});
