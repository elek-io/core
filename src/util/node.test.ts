import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createPathTo,
  isNotEmpty,
  files,
  folders,
  resolveDataDir,
} from './node.js';

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

describe('resolveDataDir', () => {
  const defaultDataDir = Path.join(Os.homedir(), 'elek.io');

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the default data directory when nothing is configured', () => {
    vi.stubEnv('ELEK_IO_DATA_DIR', undefined);

    expect(resolveDataDir()).toBe(defaultDataDir);
  });

  it('returns the ELEK_IO_DATA_DIR environment variable when set', () => {
    const envDataDir = Path.join(Os.tmpdir(), 'elek-io-core-env-test');
    vi.stubEnv('ELEK_IO_DATA_DIR', envDataDir);

    expect(resolveDataDir()).toBe(envDataDir);
  });

  it('prefers the given data directory over the environment variable', () => {
    const envDataDir = Path.join(Os.tmpdir(), 'elek-io-core-env-test');
    const optionDataDir = Path.join(Os.tmpdir(), 'elek-io-core-option-test');
    vi.stubEnv('ELEK_IO_DATA_DIR', envDataDir);

    expect(resolveDataDir(optionDataDir)).toBe(optionDataDir);
  });

  it('treats an empty or whitespace-only environment variable as unset', () => {
    vi.stubEnv('ELEK_IO_DATA_DIR', '');
    expect(resolveDataDir()).toBe(defaultDataDir);

    vi.stubEnv('ELEK_IO_DATA_DIR', '   ');
    expect(resolveDataDir()).toBe(defaultDataDir);
  });

  it('treats an empty or whitespace-only argument as unset', () => {
    vi.stubEnv('ELEK_IO_DATA_DIR', undefined);
    expect(resolveDataDir('')).toBe(defaultDataDir);
    expect(resolveDataDir('   ')).toBe(defaultDataDir);

    const envDataDir = Path.join(Os.tmpdir(), 'elek-io-core-env-test');
    vi.stubEnv('ELEK_IO_DATA_DIR', envDataDir);
    expect(resolveDataDir('')).toBe(envDataDir);
  });

  it('resolves relative paths against the current working directory', () => {
    vi.stubEnv('ELEK_IO_DATA_DIR', undefined);

    expect(resolveDataDir('./some/data-dir')).toBe(
      Path.resolve('some/data-dir')
    );
  });

  it('normalizes trailing separators', () => {
    vi.stubEnv('ELEK_IO_DATA_DIR', undefined);
    const dataDir = Path.join(Os.tmpdir(), 'elek-io-core-trailing-test');

    expect(resolveDataDir(dataDir + Path.sep)).toBe(dataDir);
  });
});

describe('createPathTo', () => {
  const root = Path.join(Os.tmpdir(), 'elek-io-core-path-test');
  const pathTo = createPathTo(root);

  it('roots every static path under the given data directory', () => {
    expect(pathTo.tmp).toBe(Path.join(root, 'tmp'));
    expect(pathTo.userFile).toBe(Path.join(root, 'user.json'));
    expect(pathTo.logs).toBe(Path.join(root, 'logs'));
    expect(pathTo.projects).toBe(Path.join(root, 'projects'));
  });

  it('roots every path builder under the given data directory', () => {
    const project = Path.join(root, 'projects', 'p1');

    expect(pathTo.project('p1')).toBe(project);
    expect(pathTo.projectFile('p1')).toBe(Path.join(project, 'project.json'));
    expect(pathTo.lfs('p1')).toBe(Path.join(project, 'lfs'));
    expect(pathTo.components('p1')).toBe(Path.join(project, 'components'));
    expect(pathTo.component('p1', 'c1')).toBe(
      Path.join(project, 'components', 'c1')
    );
    expect(pathTo.componentFile('p1', 'c1')).toBe(
      Path.join(project, 'components', 'c1', 'component.json')
    );
    expect(pathTo.componentIndex('p1')).toBe(
      Path.join(project, 'components', 'slug.index.json')
    );
    expect(pathTo.collections('p1')).toBe(Path.join(project, 'collections'));
    expect(pathTo.collection('p1', 'c1')).toBe(
      Path.join(project, 'collections', 'c1')
    );
    expect(pathTo.collectionFile('p1', 'c1')).toBe(
      Path.join(project, 'collections', 'c1', 'collection.json')
    );
    expect(pathTo.collectionIndex('p1')).toBe(
      Path.join(project, 'collections', 'slug.index.json')
    );
    expect(pathTo.entries('p1', 'c1')).toBe(
      Path.join(project, 'collections', 'c1')
    );
    expect(pathTo.entryFile('p1', 'c1', 'e1')).toBe(
      Path.join(project, 'collections', 'c1', 'e1.json')
    );
    expect(pathTo.assets('p1')).toBe(Path.join(project, 'assets'));
    expect(pathTo.assetFile('p1', 'a1')).toBe(
      Path.join(project, 'assets', 'a1.json')
    );
    expect(pathTo.asset('p1', 'a1', 'png')).toBe(
      Path.join(project, 'lfs', 'a1.png')
    );
    expect(pathTo.tmpAsset('a1', 'abc123', 'png')).toBe(
      Path.join(root, 'tmp', 'a1.abc123.png')
    );
  });

  it('yields disjoint paths for two different data directories', () => {
    const otherRoot = Path.join(Os.tmpdir(), 'elek-io-core-other-path-test');
    const otherPathTo = createPathTo(otherRoot);

    expect(otherPathTo.projects).not.toBe(pathTo.projects);
    expect(otherPathTo.project('p1')).not.toBe(pathTo.project('p1'));
    expect(otherPathTo.tmpAsset('a1', 'abc123', 'png')).not.toBe(
      pathTo.tmpAsset('a1', 'abc123', 'png')
    );
  });
});
