import { describe, expect, it } from 'vitest';
import { isMutatingGitCommand } from './GitService.js';

/**
 * A packaged elek.io Desktop runs Core at `info`, so `info` is the whole
 * of what a real User's machine records. A git command that changes a
 * repository or a remote belongs in that record, a command that only
 * asks it something does not. See contributing/logging.md.
 */
describe('isMutatingGitCommand', function () {
  it.each([
    [
      'commit',
      ['commit', '--message=Create entry 1234', '--author=[redacted]'],
    ],
    ['add', ['add', '--', 'collections/6f1e/2b7c.json']],
    ['init', ['init', '--initial-branch=work']],
    [
      'clone',
      ['clone', '--progress', 'https://example.com/repo.git', '/tmp/x'],
    ],
    ['push', ['push', 'origin', '--no-verify']],
    ['pull', ['pull']],
    ['fetch', ['fetch', '--depth', '1', 'origin', 'work']],
    ['merge', ['merge', '--squash', 'work']],
    ['rebase', ['rebase', 'origin/work']],
    ['reset', ['reset', '--hard', 'HEAD']],
    ['switch', ['switch', '--create', 'upgrade/core-0.23.0-to-0.24.0']],
    ['branch delete', ['branch', '--delete', '--force', 'work']],
    ['tag create', ['tag', '--annotate', '1234', '-m', 'Version: 1.0.0']],
    ['tag delete', ['tag', '--delete', '1234']],
    ['remote add', ['remote', 'add', 'origin', 'https://example.com/repo.git']],
    ['remote set-url', ['remote', 'set-url', 'origin', 'https://e.com/r.git']],
    ['config write', ['config', '--local', 'push.autoSetupRemote', 'true']],
    ['lfs install', ['lfs', 'install', '--local']],
    ['lfs fetch', ['lfs', 'fetch', '--all']],
    ['lfs checkout', ['lfs', 'checkout']],
  ])('records what %s did', function (_name, args) {
    expect(isMutatingGitCommand(args)).toBe(true);
  });

  it.each([
    ['status', ['status', '--porcelain=2']],
    ['log', ['log', '--max-count=10', '--format=%H']],
    ['rev-parse', ['rev-parse', 'HEAD']],
    ['ls-remote', ['ls-remote', '--quiet', 'origin']],
    ['ls-tree', ['ls-tree', '--name-only', 'HEAD', 'assets/']],
    ['cat-file', ['cat-file', 'blob', 'abc:project.json']],
    ['check-ref-format', ['check-ref-format', '--allow-onelevel', 'work']],
    ['version', ['--version']],
    ['exec-path', ['--exec-path']],
    ['branch list', ['branch', '--list', '--all']],
    ['branch show-current', ['branch', '--show-current']],
    [
      'tag list',
      ['tag', '--list', '--sort=-*authordate', '--format=%(refname)'],
    ],
    ['remote list', ['remote']],
    ['remote get-url', ['remote', 'get-url', 'origin']],
    ['config read', ['config', '--get', 'remote.origin.url']],
    ['lfs env', ['lfs', 'env']],
  ])('leaves %s out of it, it only asked', function (_name, args) {
    expect(isMutatingGitCommand(args)).toBe(false);
  });

  it('treats a command it does not know as a mutation', function () {
    // A command added later and never classified belongs in the record.
    // A noisy line is a smaller failure than a missing one
    expect(isMutatingGitCommand(['worktree', 'add', '/tmp/x'])).toBe(true);
  });
});
