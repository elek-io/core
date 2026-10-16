import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import type ElekIoCore from '../index.node.js';
import type { SetUserProps } from '../schema/userSchema.js';
import { startFakeCloud } from '../test/cloud.js';
import { createTmpCore, execGit, tmpDirPath } from '../test/util.js';
import { recordsGitIdentity } from '../util/git.js';
import { uuid } from '../util/shared.js';

/**
 * Who a commit and a tag are signed as, after the User changes.
 *
 * Core hands git the current User on every command that records one, and
 * writes no identity into a Project's git config, so there is no second
 * copy to fall out of step. What is asserted is what git recorded, not what
 * Core passed.
 */

const before: SetUserProps = {
  userType: 'local',
  id: null,
  name: 'Before Person',
  email: 'before@example.com',
  language: 'en',
  localApi: { isEnabled: false, port: 31310 },
};

const after: SetUserProps = {
  ...before,
  name: 'After Person',
  email: 'after@example.com',
};

async function createProject(core: ElekIoCore): Promise<string> {
  const project = await core.projects.create({
    name: 'Identity',
    description: 'Who commits are signed as',
    settings: { language: { default: 'en', supported: ['en'] } },
  });
  return project.id;
}

async function createCollection(
  core: ElekIoCore,
  projectId: string
): Promise<void> {
  await core.collections.create({
    projectId,
    icon: 'home',
    name: { singular: { en: 'Page' }, plural: { en: 'Pages' } },
    slug: { singular: 'page', plural: 'pages' },
    description: { en: 'A page' },
    fieldDefinitions: [],
  });
}

/** The author and the committer of the newest commit, as git recorded them */
async function signatures(path: string): Promise<string[]> {
  const line = await execGit(path, [
    'log',
    '-1',
    '--format=%an <%ae>|%cn <%ce>',
  ]);
  return line.split('|');
}

describe('the identity a commit carries', function () {
  it('follows the User as author and committer once it changes', async function () {
    const { core } = createTmpCore();
    await core.user.set(before);
    const projectId = await createProject(core);
    const path = core.util.pathTo.project(projectId);
    expect(await signatures(path)).toEqual([
      'Before Person <before@example.com>',
      'Before Person <before@example.com>',
    ]);

    await core.user.set(after);
    await createCollection(core, projectId);

    expect(await signatures(path)).toEqual([
      'After Person <after@example.com>',
      'After Person <after@example.com>',
    ]);
  }, 60000);

  it('follows the User on a Release, its commit and its tag', async function () {
    const { core } = createTmpCore();
    await core.user.set(before);
    const projectId = await createProject(core);
    const path = core.util.pathTo.project(projectId);
    await createCollection(core, projectId);

    await core.user.set(after);
    await core.releases.create({ projectId });

    // The Release tag is the only tag the Project has
    const tagger = await execGit(path, [
      'for-each-ref',
      '--format=%(taggername) %(taggeremail)',
      'refs/tags',
    ]);
    expect(tagger).toBe('After Person <after@example.com>');
    const released = await execGit(path, [
      'log',
      '-1',
      '--format=%an <%ae>|%cn <%ce>',
      'main',
    ]);
    expect(released.split('|')).toEqual([
      'After Person <after@example.com>',
      'After Person <after@example.com>',
    ]);
  }, 60000);

  it('keeps the author of a replayed commit and makes the User its committer', async function () {
    const { core } = createTmpCore();
    await core.user.set(before);
    const projectId = await createProject(core);
    const path = core.util.pathTo.project(projectId);
    await createCollection(core, projectId);
    // `main` moves on underneath `draft`, so the rebase has a commit to replay
    await execGit(path, ['switch', 'main']);
    await Fs.writeFile(`${path}/elsewhere.txt`, 'elsewhere\n');
    await execGit(path, ['add', 'elsewhere.txt']);
    await execGit(path, [
      '-c',
      'user.name=Elsewhere',
      '-c',
      'user.email=elsewhere@example.com',
      'commit',
      '--message=Elsewhere',
    ]);
    await execGit(path, ['switch', 'draft']);

    await core.user.set(after);
    await core.git.rebase(path, 'main');

    expect(await signatures(path)).toEqual([
      'Before Person <before@example.com>',
      'After Person <after@example.com>',
    ]);
  }, 60000);

  it('follows signing in to an elek.io account', async function () {
    const account = {
      id: uuid(),
      name: 'Account Person',
      email: 'account@example.com',
    };
    const cloud = await startFakeCloud({
      'POST /api/auth/sign-in/email': () =>
        Response.json(
          { user: account },
          { headers: { 'set-auth-token': 'identity-session-token' } }
        ),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });
    await core.user.set(before);
    const projectId = await createProject(core);

    await core.cloud.account.signIn({
      email: account.email,
      password: 'correct horse battery staple',
    });
    await createCollection(core, projectId);

    expect(await signatures(core.util.pathTo.project(projectId))).toEqual([
      'Account Person <account@example.com>',
      'Account Person <account@example.com>',
    ]);
  }, 60000);
});

describe('the git config of a Project', function () {
  it('holds no identity, so nothing but the User can sign a commit', async function () {
    const { core } = createTmpCore();
    await core.user.set(before);
    const path = core.util.pathTo.project(await createProject(core));

    for (const key of ['user.name', 'user.email']) {
      const result = await gitExec(['config', '--local', '--get', key], path);
      // 1 is how `git config --get` says the key is not set
      expect(result.exitCode).toBe(1);
    }
    // What Core does rely on is still written
    expect(
      await execGit(path, ['config', '--local', '--get', 'pull.rebase'])
    ).toBe('true');
  }, 60000);

  it('lets a Core without a User clone, and refuses only the commit', async function () {
    const { core: author } = createTmpCore();
    await author.user.set(before);
    const projectId = await createProject(author);
    const remote = tmpDirPath();
    await execGit('', [
      'clone',
      '--bare',
      author.util.pathTo.project(projectId),
      remote,
    ]);
    // The remote's `draft` is what a clone lands on
    await execGit(author.util.pathTo.project(projectId), [
      'push',
      remote,
      'draft',
    ]);
    const { core } = createTmpCore();

    const cloned = await core.projects.clone({ url: remote });

    expect(await core.user.get()).toBeNull();
    await expect(createCollection(core, cloned.id)).rejects.toMatchObject({
      type: 'Unauthorized',
    });
  }, 60000);
});

describe('recordsGitIdentity', function () {
  it.each([
    ['commit', ['commit', '--message=Create entry 1234']],
    ['merge', ['merge', 'draft']],
    ['rebase', ['rebase', 'origin/draft']],
    ['pull', ['pull']],
    ['an annotated tag', ['tag', '--annotate', 'abc', '-m', 'Release']],
    // A command nobody classified gets the User, so one added later cannot
    // sign with whatever git finds on the machine
    ['an unclassified command', ['cherry-pick', 'abc']],
  ])('hands %s the User', function (_label, args) {
    expect(recordsGitIdentity(args)).toBe(true);
  });

  it.each([
    ['status', ['status', '--porcelain=2']],
    ['log', ['log', '--format=%H']],
    ['add', ['add', '--', '.']],
    ['fetch', ['fetch', 'origin']],
    ['push', ['push', 'origin', 'draft']],
    ['clone', ['clone', '--progress', 'url', 'path']],
    ['config', ['config', '--local', 'pull.rebase', 'true']],
    ['switch', ['switch', 'draft']],
    ['reset', ['reset', '--hard', 'HEAD']],
    ['an LFS transfer', ['lfs', 'fetch', '--all']],
  ])('reads no User for %s', function (_label, args) {
    expect(recordsGitIdentity(args)).toBe(false);
  });
});
