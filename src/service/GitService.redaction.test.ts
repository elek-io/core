import Fs from 'fs-extra';
import Path from 'node:path';
import { assert, describe, expect, it } from 'vitest';
import core, { testUserProps, uuid } from '../test/setup.js';
import { createProject } from '../test/util.js';
import { CoreError } from '../util/shared.js';
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

  it('does not write it when the command fails either', async function () {
    const project = await createProject();
    const path = core.util.pathTo.project(project.id);
    await rejectNextCommit(path, 'nothing a log file may hold');

    await expect(
      core.git.commit(path, {
        method: 'create',
        reference: { objectType: 'entry', id: uuid() },
      })
    ).rejects.toThrow(CoreError);

    const written = await readLogs();
    expect(written).not.toContain(testUserProps.name);
    expect(written).not.toContain(testUserProps.email);
    await project.destroy();
  });
});

describe('a failed git command', function () {
  it('says what failed without repeating the command line or git', async function () {
    const project = await createProject();
    const path = core.util.pathTo.project(project.id);
    // git echoes the offending argument back and its output is localized,
    // so nothing built from it can be redacted by pattern. The hook stands
    // in for that output. See contributing/logging.md
    await rejectNextCommit(path, `refusing ${testUserProps.name}`);

    const error: unknown = await core.git
      .commit(path, {
        method: 'create',
        reference: { objectType: 'entry', id: uuid() },
      })
      .catch((reason: unknown) => reason);

    assert(error instanceof CoreError);
    expect(error.message).not.toContain(testUserProps.name);
    expect(error.message).not.toContain(testUserProps.email);
    // The exit code and the redacted command are what is left, and they
    // are enough to find the command in the log line above the failure
    expect(error.message).toContain('--author=[redacted]');
    expect(error.message).toContain('exit code');

    // git's own words are thrown but never logged, so whoever made the
    // call still has them
    assert(error.cause instanceof Error);
    expect(error.cause.message).toContain(testUserProps.name);
    await project.destroy();
  });
});

/**
 * Makes the next commit in the repository fail, with the given text on
 * git's stderr, which is where an identity git echoed back would sit.
 */
async function rejectNextCommit(
  projectPath: string,
  stderr: string
): Promise<void> {
  const hook = Path.join(projectPath, '.git', 'hooks', 'pre-commit');
  await Fs.writeFile(hook, `#!/bin/sh\necho "${stderr}" >&2\nexit 1\n`, {
    encoding: 'utf8',
  });
  await Fs.chmod(hook, 0o755);
}

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
