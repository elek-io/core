import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  testDataDirBase,
  testFileDataDir,
  workerApiPort,
  workerDirPrefix,
} from './worker.js';

const homedir = Path.join(Path.sep, 'home', 'someone');

describe('testDataDirBase', () => {
  it('defaults to elek.io-test inside the home directory', () => {
    expect(testDataDirBase({ envDataDir: undefined, homedir })).toBe(
      Path.join(homedir, 'elek.io-test')
    );
  });

  it('uses a set ELEK_IO_DATA_DIR as the base instead', () => {
    const envDataDir = Path.join(homedir, 'custom-test-data');

    expect(testDataDirBase({ envDataDir, homedir })).toBe(envDataDir);
  });

  it('treats an empty or whitespace-only ELEK_IO_DATA_DIR as unset', () => {
    const defaultBase = Path.join(homedir, 'elek.io-test');

    expect(testDataDirBase({ envDataDir: '', homedir })).toBe(defaultBase);
    expect(testDataDirBase({ envDataDir: '   ', homedir })).toBe(defaultBase);
  });

  it('resolves a relative ELEK_IO_DATA_DIR against the current working directory', () => {
    expect(testDataDirBase({ envDataDir: './some/data-dir', homedir })).toBe(
      Path.resolve('some/data-dir')
    );
  });
});

describe('testFileDataDir', () => {
  it('nests a unique directory per test file beneath the base', () => {
    const dir = testFileDataDir({
      envDataDir: undefined,
      homedir,
      poolId: '3',
      uniqueId: 'abc-123',
    });

    expect(dir).toBe(Path.join(homedir, 'elek.io-test', 'worker-3-abc-123'));
  });

  it('nests beneath a set ELEK_IO_DATA_DIR', () => {
    const envDataDir = Path.join(homedir, 'custom-test-data');
    const dir = testFileDataDir({
      envDataDir,
      homedir,
      poolId: '1',
      uniqueId: 'abc-123',
    });

    expect(dir).toBe(Path.join(envDataDir, 'worker-1-abc-123'));
  });

  it('names the directory with the prefix globalSetup sweeps for', () => {
    const dir = testFileDataDir({
      envDataDir: undefined,
      homedir,
      poolId: '1',
      uniqueId: 'abc-123',
    });

    expect(Path.basename(dir).startsWith(workerDirPrefix)).toBe(true);
  });
});

describe('workerApiPort', () => {
  it('offsets the default API port by the pool id', () => {
    expect(workerApiPort('1')).toBe(31311);
    expect(workerApiPort('4')).toBe(31314);
  });

  it('throws for a missing or invalid pool id', () => {
    expect(() => workerApiPort(undefined)).toThrow();
    expect(() => workerApiPort('')).toThrow();
    expect(() => workerApiPort('abc')).toThrow();
    expect(() => workerApiPort('0')).toThrow();
  });
});
