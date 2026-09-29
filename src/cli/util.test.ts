import { assert, describe, expect, it, vi } from 'vitest';
import { CoreError } from '../util/shared.js';
import {
  escapeForSingleQuotedString,
  isInsideGitDirectory,
  loadCompiler,
  runOnChange,
} from './util.js';

// Stands in for an install without the optional peer dependency, where
// resolving it rejects with ERR_MODULE_NOT_FOUND
vi.mock('tsdown', () => {
  throw new Error(`Cannot find package 'tsdown'`);
});

describe('loadCompiler', () => {
  it('fails with a CoreError naming both packages to install', async () => {
    await expect(loadCompiler()).rejects.toThrow(CoreError);
    await expect(loadCompiler()).rejects.toThrow(/tsdown/);
    await expect(loadCompiler()).rejects.toThrow(/typescript/);
  });

  it('keeps the resolution failure as the cause', async () => {
    const error: unknown = await loadCompiler().catch(
      (reason: unknown) => reason
    );

    // The message is actionable on its own, the cause keeps the raw
    // resolution failure for whoever debugs the install
    assert(error instanceof CoreError);
    expect(error.cause).toBeInstanceOf(Error);
  });
});

describe('escapeForSingleQuotedString', () => {
  it.each([
    ["it's", "it\\'s", 'a quote, which would close the literal'],
    ['back\\slash', 'back\\\\slash', 'a backslash, which escapes what follows'],
    ['first\nsecond', 'first\\nsecond', 'a line feed, which ends the line'],
    ['a\r\nb', 'a\\r\\nb', 'a carriage return and a line feed'],
  ])('escapes %j as %j, %s', (value, expected) => {
    const escaped = escapeForSingleQuotedString(value);

    expect(escaped).toEqual(expected);
    // A single quoted literal is one line of source, so nothing left in it
    // may end that line. generateTypesAction.test.ts transpiles the file
    expect(escaped).not.toMatch(/[\r\n]/);
  });
});

describe('isInsideGitDirectory', () => {
  it.each([
    ['/home/nils/elek.io/projects/a/.git/index', 'a POSIX path'],
    ['C:\\Users\\nils\\elek.io\\projects\\a\\.git\\index', 'a Windows path'],
    ['/home/nils/elek.io/projects/a/.git/refs/heads/work', 'a nested ref'],
  ])('ignores %j, %s', (path) => {
    expect(isInsideGitDirectory(path)).toBe(true);
  });

  it.each([
    ['/home/nils/elek.io/projects/a/project.json', 'a Project file'],
    [
      'C:\\Users\\nils\\elek.io\\projects\\a\\project.json',
      'a Project file on Windows',
    ],
    [
      '/home/nils/elek.io/projects/.gitignore',
      'a name only starting with .git',
    ],
    ['/home/nils/elek.io/projects/a/.gitattributes', 'another such name'],
  ])('watches %j, %s', (path) => {
    expect(isInsideGitDirectory(path)).toBe(false);
  });
});

describe('runOnChange', () => {
  it('prints a CoreError message and keeps watching', async () => {
    // A watcher callback fires long after the binary's own try/catch has
    // returned, so without this the failure is an unhandled rejection
    const printed: unknown[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((message: unknown) => {
        printed.push(message);
      });

    await runOnChange(() =>
      Promise.reject(CoreError.badRequest('Regeneration failed'))
    );

    expect(printed).toEqual(['Regeneration failed']);
    spy.mockRestore();
  });

  it('prints anything else through String()', async () => {
    const printed: unknown[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((message: unknown) => {
        printed.push(message);
      });

    await runOnChange(() => Promise.reject(new Error('boom')));

    expect(printed).toEqual(['Error: boom']);
    spy.mockRestore();
  });

  it('stays quiet on success', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runOnChange(() => Promise.resolve('done'));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
