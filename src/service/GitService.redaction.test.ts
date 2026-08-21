import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import core, { testUserProps } from '../test/setup.js';
import { createProject } from '../test/util.js';
import { redactGitArgs } from './GitService.js';

/**
 * Core's log files can be attached to a bug report, so a git command line
 * must never carry the User's identity into one. See contributing/logging.md.
 */
describe('redactGitArgs', function () {
  it('redacts the author of a commit', function () {
    expect(
      redactGitArgs([
        'commit',
        '--message=Create entry 1234',
        '--author=John Doe <john.doe@test.com>',
      ])
    ).toEqual(['commit', '--message=Create entry 1234', '--author=[redacted]']);
  });

  it('redacts the values written by git config', function () {
    expect(
      redactGitArgs(['config', '--local', 'user.name', 'John Doe'])
    ).toEqual(['config', '--local', 'user.name', '[redacted]']);
    expect(
      redactGitArgs(['config', '--local', 'user.email', 'john.doe@test.com'])
    ).toEqual(['config', '--local', 'user.email', '[redacted]']);
  });

  it('redacts credentials embedded in a remote URL', function () {
    expect(
      redactGitArgs([
        'remote',
        'add',
        'origin',
        'https://user:secret@example.com/org/repo.git',
      ])
    ).toEqual([
      'remote',
      'add',
      'origin',
      'https://[redacted]@example.com/org/repo.git',
    ]);
  });

  it('leaves everything else alone, because ids and paths are what make a line useful', function () {
    const args = [
      'add',
      '--',
      'collections/6f1e/2b7c.json',
      '--porcelain=2',
      'push.autoSetupRemote',
      'true',
    ];

    expect(redactGitArgs(args)).toEqual(args);
  });

  it('leaves a remote URL without credentials alone', function () {
    expect(
      redactGitArgs(['clone', 'https://example.com/org/repo.git'])
    ).toEqual(['clone', 'https://example.com/org/repo.git']);
  });
});

describe('git identity never reaches a log file', function () {
  it('does not write the User name or email while creating a Project', async function () {
    // Creating a Project runs `git config --local user.name/user.email` and
    // commits with `--author=`, which is every identity site there is.
    const project = await createProject();
    const written = await readLogs();

    expect(written).not.toContain(testUserProps.name);
    expect(written).not.toContain(testUserProps.email);
    await project.destroy();
  });
});

async function readLogs(): Promise<string> {
  const dir = core.util.pathTo.logs;
  if (!(await Fs.pathExists(dir))) {
    return '';
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );
  return contents.join('\n');
}
