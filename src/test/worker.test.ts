import Net from 'node:net';
import Path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  cliRunDirName,
  createFileId,
  createRunId,
  currentDataDirBase,
  currentRunId,
  freePort,
  nodeRunDirName,
  pidOfRunId,
  portOf,
  runIdEnvVar,
  runIdOfRootDir,
  runIdOfWorkerDir,
  testDataDirBase,
  testFileDataDir,
  workerDirPrefix,
} from './worker.js';

// Fully resolved so it gets a drive letter on Windows, like a real
// Os.homedir() value. A drive-relative fake would gain the current
// drive inside testDataDirBase and break the comparisons.
const homedir = Path.resolve('/home/someone');

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

describe('createRunId', () => {
  it('names the pid of the run and a random part next to it', () => {
    expect(createRunId(4321)).toMatch(/^r4321-[0-9a-f]{12}$/);
  });

  it('is wider than the pid, so two runs of one pid differ', () => {
    expect(createRunId(4321)).not.toBe(createRunId(4321));
  });

  it('takes the pid of this process by default', () => {
    expect(pidOfRunId(createRunId())).toBe(process.pid);
  });
});

describe('pidOfRunId', () => {
  it('reads the pid out of a run id', () => {
    expect(pidOfRunId('r98765-0123456789ab')).toBe(98765);
  });

  it('reads nothing out of a string that is no run id', () => {
    expect(pidOfRunId('')).toBeUndefined();
    expect(pidOfRunId('98765')).toBeUndefined();
    expect(pidOfRunId('rabc-0123456789ab')).toBeUndefined();
    expect(pidOfRunId('r98765')).toBeUndefined();
  });

  it('reads nothing out of pid zero, which names a whole process group', () => {
    expect(pidOfRunId('r0-0123456789ab')).toBeUndefined();
  });
});

describe('currentRunId', () => {
  it('is the run id globalSetup put into the environment', () => {
    expect(pidOfRunId(currentRunId())).toBeTypeOf('number');
  });

  it('says what is missing when the environment carries no run id', () => {
    vi.stubEnv(runIdEnvVar, 'not-a-run-id');

    expect(() => currentRunId()).toThrow(runIdEnvVar);

    vi.unstubAllEnvs();
  });
});

describe('currentDataDirBase', () => {
  it('is the directory this run nests its per-file directories in', () => {
    const dataDir = process.env['ELEK_IO_DATA_DIR'] ?? '';

    expect(currentDataDirBase()).toBe(Path.dirname(dataDir));
  });

  it('refuses a data directory that is no directory of a run', () => {
    vi.stubEnv('ELEK_IO_DATA_DIR', Path.resolve('/somewhere/else'));

    expect(() => currentDataDirBase()).toThrow('ELEK_IO_DATA_DIR');

    vi.unstubAllEnvs();
  });
});

describe('testFileDataDir', () => {
  const props = {
    envDataDir: undefined,
    homedir,
    poolId: '3',
    runId: 'r4321-0123456789ab',
    fileId: 'aabbccddeeff',
  };

  it('nests a unique directory per test file beneath the base', () => {
    expect(testFileDataDir(props)).toBe(
      Path.join(
        homedir,
        'elek.io-test',
        'worker-3-r4321-0123456789ab-aabbccddeeff'
      )
    );
  });

  it('nests beneath a set ELEK_IO_DATA_DIR', () => {
    const envDataDir = Path.join(homedir, 'custom-test-data');

    expect(testFileDataDir({ ...props, envDataDir })).toBe(
      Path.join(envDataDir, 'worker-3-r4321-0123456789ab-aabbccddeeff')
    );
  });

  it('names the directory with the prefix globalSetup sweeps for', () => {
    expect(
      Path.basename(testFileDataDir(props)).startsWith(workerDirPrefix)
    ).toBe(true);
  });

  it('gives two runs disjoint paths, and two files of one run as well', () => {
    const first = createRunId(4321);
    const second = createRunId(4321);
    const paths = [
      testFileDataDir({ ...props, runId: first, fileId: createFileId() }),
      testFileDataDir({ ...props, runId: first, fileId: createFileId() }),
      testFileDataDir({ ...props, runId: second, fileId: createFileId() }),
    ];

    expect(new Set(paths).size).toBe(3);
  });
});

describe('runIdOfWorkerDir', () => {
  it('reads back the run a name was built from', () => {
    const runId = createRunId(4321);
    const name = Path.basename(
      testFileDataDir({
        envDataDir: undefined,
        homedir,
        poolId: '2',
        runId,
        fileId: createFileId(),
      })
    );

    expect(runIdOfWorkerDir(name)).toBe(runId);
  });

  it('reads nothing out of a name no run built', () => {
    // What the suite wrote before the directories carried a run
    expect(
      runIdOfWorkerDir('worker-1-0d9a1f3e-7c2b-4a51-9f0e-2b6d8c4a1e73')
    ).toBeUndefined();
    expect(runIdOfWorkerDir('keep-me')).toBeUndefined();
    expect(runIdOfWorkerDir('worker-1-r4321-xyz-aabbccddeeff')).toBeUndefined();
  });
});

describe('runIdOfRootDir', () => {
  it('reads back the run both repository-root names were built from', () => {
    const runId = createRunId(4321);

    expect(runIdOfRootDir(cliRunDirName(runId))).toBe(runId);
    expect(runIdOfRootDir(nodeRunDirName(runId))).toBe(runId);
  });

  it('tells the two names apart, so neither is read as the other', () => {
    const runId = createRunId(4321);

    expect(cliRunDirName(runId)).not.toBe(nodeRunDirName(runId));
  });

  it('reads nothing out of the names that carry no run', () => {
    expect(runIdOfRootDir('.elek.io')).toBeUndefined();
    expect(runIdOfRootDir('.elek.io-node-test')).toBeUndefined();
    expect(runIdOfRootDir('.elek.io-r4321')).toBeUndefined();
  });
});

describe('portOf', () => {
  it('reads the port of a bound TCP listener', () => {
    expect(portOf({ address: '127.0.0.1', family: 'IPv4', port: 31311 })).toBe(
      31311
    );
  });

  it('refuses an address that is no TCP one', () => {
    expect(() => portOf(null)).toThrow('bound TCP address');
    expect(() => portOf('/tmp/a.sock')).toThrow('bound TCP address');
  });
});

describe('freePort', () => {
  it('gives a port that can then be bound', async () => {
    const port = await freePort();
    const server = Net.createServer();

    await expect(
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      })
    ).resolves.toBeUndefined();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('gives a different port while the last one is still held', async () => {
    const held: Net.Server[] = [];
    const ports: number[] = [];
    for (let i = 0; i < 20; i++) {
      const port = await freePort();
      const server = Net.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      held.push(server);
      ports.push(port);
    }

    expect(new Set(ports).size).toBe(ports.length);

    await Promise.all(
      held.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
  });
});
