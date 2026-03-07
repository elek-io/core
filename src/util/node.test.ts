import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isNotEmpty, isNotAnError, files, folders } from './node.js';

describe('isNotEmpty', () => {
  it('returns false for null', () => {
    expect(isNotEmpty(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNotEmpty(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isNotEmpty('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isNotEmpty('   ')).toBe(false);
    expect(isNotEmpty('\t')).toBe(false);
    expect(isNotEmpty('\n')).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(isNotEmpty('hello')).toBe(true);
  });

  it('returns true for numbers including zero', () => {
    expect(isNotEmpty(0)).toBe(true);
    expect(isNotEmpty(42)).toBe(true);
  });

  it('returns true for objects and arrays', () => {
    expect(isNotEmpty({})).toBe(true);
    expect(isNotEmpty([])).toBe(true);
  });
});

describe('isNotAnError', () => {
  it('returns true for non-error values', () => {
    expect(isNotAnError('hello')).toBe(true);
    expect(isNotAnError(42)).toBe(true);
    expect(isNotAnError(null)).toBe(true);
    expect(isNotAnError({})).toBe(true);
  });

  it('returns false for Error instances', () => {
    expect(isNotAnError(new Error('fail'))).toBe(false);
    expect(isNotAnError(new TypeError('type fail'))).toBe(false);
  });

  it('filters errors from mixed arrays', () => {
    const mixed = ['a', new Error('fail'), 'b', new TypeError('bad')];
    const filtered = mixed.filter(isNotAnError);

    expect(filtered).toEqual(['a', 'b']);
  });
});

describe('files', () => {
  const testDir = Path.join(Os.tmpdir(), 'elek-io-test-files');

  beforeAll(async () => {
    await Fs.ensureDir(testDir);
    await Fs.writeFile(Path.join(testDir, 'document.json'), '{}');
    await Fs.writeFile(Path.join(testDir, 'image.png'), '');
    await Fs.writeFile(Path.join(testDir, 'readme.txt'), '');
    await Fs.ensureDir(Path.join(testDir, 'subfolder'));
  });

  afterAll(async () => {
    await Fs.remove(testDir);
  });

  it('returns all files without extension filter', async () => {
    const result = await files(testDir);

    expect(result).toHaveLength(3);
    const names = result.map((d) => d.name).sort();
    expect(names).toEqual(['document.json', 'image.png', 'readme.txt']);
  });

  it('returns only files matching the given extension', async () => {
    const result = await files(testDir, '.json');

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('document.json');
  });

  it('returns no files when extension does not match', async () => {
    const result = await files(testDir, '.csv');

    expect(result).toHaveLength(0);
  });

  it('does not return directories', async () => {
    const result = await files(testDir);
    const names = result.map((d) => d.name);

    expect(names).not.toContain('subfolder');
  });
});

describe('folders', () => {
  const testDir = Path.join(Os.tmpdir(), 'elek-io-test-folders');

  beforeAll(async () => {
    await Fs.ensureDir(testDir);
    await Fs.writeFile(Path.join(testDir, 'file.txt'), '');
    await Fs.ensureDir(Path.join(testDir, 'subdir1'));
    await Fs.ensureDir(Path.join(testDir, 'subdir2'));
  });

  afterAll(async () => {
    await Fs.remove(testDir);
  });

  it('returns only directories', async () => {
    const result = await folders(testDir);
    const names = result.map((d) => d.name).sort();

    expect(names).toEqual(['subdir1', 'subdir2']);
  });

  it('does not return files', async () => {
    const result = await folders(testDir);
    const names = result.map((d) => d.name);

    expect(names).not.toContain('file.txt');
  });
});
