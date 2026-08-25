import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ElekIoCore from '../index.node.js';
import { logRecordSchema, type LogRecord } from '../schema/logSchema.js';
import { testUserProps, uuid } from '../test/setup.js';

/**
 * A packaged elek.io Desktop runs Core at `info`, so `info` is the whole
 * of what a real User's machine records and the whole of what a bug
 * report can carry. It has to hold what the User did, and none of how
 * Core did it. See contributing/logging.md.
 */
const dataDir = Path.join(Os.tmpdir(), `elek-io-core-loglevels-${uuid()}`);
let records: LogRecord[] = [];

beforeAll(async function () {
  const core = new ElekIoCore({ dataDir, log: { level: 'info' } });
  const logs = core.util.pathTo.logs;
  try {
    await core.user.set(testUserProps);
    const project = await core.projects.create({
      name: 'Log levels',
      description: 'A Project that only exists to be created and deleted',
      settings: { language: { default: 'en', supported: ['en'] } },
    });
    await core.projects.delete({ id: project.id, force: true });
  } finally {
    // Ends the logger, so what was written is on disk before it is read
    await core.dispose();
  }
  records = await readRecords(logs);
}, 120000);

afterAll(async function () {
  await Fs.remove(dataDir);
});

function messagesAt(level: string): string[] {
  return records
    .filter((record) => record.level === level)
    .map((record) => record.message);
}

function has(level: string, prefix: string): boolean {
  return messagesAt(level).some((message) => message.startsWith(prefix));
}

describe('a log file at level info', function () {
  it('is written in the record shape the schema describes', function () {
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(logRecordSchema.safeParse(record).success).toBe(true);
    }
  });

  it('holds every file mutation, which is what a User did', function () {
    expect(has('info', 'Created file')).toBe(true);
    expect(has('info', 'Updated file')).toBe(true);
    expect(has('info', 'Deleted ')).toBe(true);
  });

  it('holds the commit, so the file mutations resolve against the repository', function () {
    expect(has('info', 'Executed "git commit')).toBe(true);
  });

  it('names the git commands that changed the repository', function () {
    const commands = messagesAt('info').filter((message) =>
      message.startsWith('Executed "git ')
    );

    expect(commands.some((message) => message.includes('git init'))).toBe(true);
    expect(commands.some((message) => message.includes('git add'))).toBe(true);
  });

  it('does not hold how a file was read, which is noise at this level', function () {
    // 1868 cache hits against 354 file creations in one measured day, which
    // is why these stay at debug
    expect(has('info', 'Cache hit')).toBe(false);
    expect(has('info', 'Cache miss')).toBe(false);
  });

  it('does not hold the git commands that only asked something', function () {
    const commands = messagesAt('info').filter((message) =>
      message.startsWith('Executed "git ')
    );

    expect(commands.some((message) => message.includes('git --version'))).toBe(
      false
    );
    expect(commands.some((message) => message.includes('git status'))).toBe(
      false
    );
    expect(commands.some((message) => message.includes('git rev-parse'))).toBe(
      false
    );
  });

  it('carries the ids of what happened as attributes', function () {
    const commit = records.find((record) =>
      record.message.startsWith('Executed "git commit')
    );

    expect(commit?.attributes).toMatchObject({
      'elek.method': 'create',
      'elek.object.type': 'project',
    });
  });
});

async function readRecords(dir: string): Promise<LogRecord[]> {
  if (!(await Fs.pathExists(dir))) {
    return [];
  }
  const names = await Fs.readdir(dir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith('.log'))
      .map((name) => Fs.readFile(Path.join(dir, name), 'utf8'))
  );
  return contents
    .join('\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line))
    .map((line) => logRecordSchema.parse(line));
}
