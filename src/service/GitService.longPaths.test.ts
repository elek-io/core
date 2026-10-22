import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import z from 'zod';
import ElekIoCore from '../index.node.js';
import type { SetUserProps } from '../schema/userSchema.js';
import { createTmpCore, tmpDirPath } from '../test/util.js';
import { uuid } from '../util/shared.js';

/**
 * What lets Core work where the paths it builds pass the 260 characters
 * Windows resolves a path against: `core.longpaths`, on every git command
 * Core runs.
 *
 * The two cases at the top are the user-visible failure and only exist on
 * Windows. The ones below hold everywhere, because what Core hands git
 * does. See contributing/testing.md.
 */

/** Windows is the only platform with a 260 character path limit. */
const isWindows = process.platform === 'win32';

/** What the Entry file below the data directory should measure. */
const entryFilePathLength = 340;

/** `projects/<uuid>/collections/<uuid>/<uuid>.json`, with its separators. */
const entryFileDepth = 137;

const user: SetUserProps = {
  userType: 'local',
  id: null,
  name: 'Deep Person',
  email: 'deep@example.com',
  language: 'en',
  localApi: { isEnabled: false, port: 31310 },
};

/**
 * A data directory long enough for the Entry file below it to reach
 * `entryFilePathLength`, padded with segments short enough for any
 * filesystem to take.
 */
function deepDataDir(): string {
  const segments = [Os.tmpdir(), `elek-io-core-longpaths-${uuid()}`];
  const target = entryFilePathLength - entryFileDepth;
  let path = Path.join(...segments);
  while (path.length < target) {
    const missing = target - path.length - 1;
    segments.push('d'.repeat(Math.min(Math.max(missing, 1), 32)));
    path = Path.join(...segments);
  }
  return path;
}

/** The path of an Entry file as Core would lay it out below `dataDir`. */
function entryFilePath(dataDir: string): string {
  return Path.join(
    dataDir,
    'projects',
    uuid(),
    'collections',
    uuid(),
    `${uuid()}.json`
  );
}

describe('a path past the Windows limit', function () {
  it.runIf(isWindows)(
    'can be written, read and removed by the machine itself',
    async function () {
      const dataDir = deepDataDir();
      const file = entryFilePath(dataDir);
      expect(file.length).toBeGreaterThanOrEqual(entryFilePathLength);

      await Fs.outputFile(file, '{"deep":true}\n');

      expect(await Fs.readFile(file, 'utf8')).toBe('{"deep":true}\n');

      await Fs.remove(dataDir);

      expect(await Fs.pathExists(dataDir)).toBe(false);
    },
    60000
  );
});

describe('a Project past the Windows limit', function () {
  it.runIf(isWindows)(
    'is created, committed to and read back at about 340 characters',
    async function () {
      const dataDir = deepDataDir();
      const core = new ElekIoCore({ dataDir });
      try {
        await core.user.set(user);
        const project = await core.projects.create({
          name: 'Deep',
          description: 'A Project past the Windows path limit',
          settings: { language: { default: 'en', supported: ['en'] } },
        });
        const collection = await core.collections.create({
          projectId: project.id,
          icon: 'home',
          name: { singular: { en: 'Page' }, plural: { en: 'Pages' } },
          slug: { singular: 'page', plural: 'pages' },
          description: { en: 'A page' },
          fieldDefinitions: [
            {
              id: uuid(),
              slug: 'title',
              valueType: 'string',
              fieldType: 'text',
              label: { en: 'Title' },
              description: null,
              defaultValue: null,
              isRequired: true,
              isDisabled: false,
              isUnique: false,
              inputWidth: '12',
              min: null,
              max: null,
            },
          ],
        });
        const entry = await core.entries.create({
          projectId: project.id,
          collectionId: collection.id,
          values: {
            title: {
              objectType: 'value',
              valueType: 'string',
              content: { en: 'Deep enough' },
            },
          },
        });

        const file = core.util.pathTo.entryFile(
          project.id,
          collection.id,
          entry.id
        );
        expect(file.length).toBeGreaterThanOrEqual(entryFilePathLength);

        // Every write commits, so a clean status is git having read the
        // whole working tree at this depth
        const status = await core.git.status(
          core.util.pathTo.project(project.id)
        );
        expect(status.files).toEqual([]);

        const read = await core.entries.read({
          projectId: project.id,
          collectionId: collection.id,
          id: entry.id,
        });
        expect(read.id).toBe(entry.id);
      } finally {
        await core.dispose();
      }

      await Fs.remove(dataDir);

      expect(await Fs.pathExists(dataDir)).toBe(false);
    },
    120000
  );
});

/** Every event of a git trace carries these, whatever kind it is. */
const traceEventSchema = z.looseObject({
  event: z.string(),
  sid: z.string(),
});

/** The command line the process was started with. */
const startEventSchema = z.looseObject({ argv: z.array(z.string()) });

/** A configuration key git resolved, and the value it resolved it to. */
const paramEventSchema = z.looseObject({
  param: z.string(),
  value: z.string(),
});

/** A git process, and what git resolved `core.longpaths` to while it ran. */
interface TracedGitCommand {
  argv: string[];
  longPaths: string | null;
}

/**
 * Every git process started while the trace was on, read from the files
 * git itself wrote, one per process. A process git started carries its
 * parent's id ahead of its own and is left out, Core did not run it.
 */
async function tracedGitCommands(dir: string): Promise<TracedGitCommand[]> {
  const commands: TracedGitCommand[] = [];
  for (const name of await Fs.readdir(dir)) {
    const events = (await Fs.readFile(Path.join(dir, name), 'utf8'))
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => traceEventSchema.parse(JSON.parse(line)));
    const start = events.find((event) => event.event === 'start');
    if (start === undefined || start.sid.includes('/')) continue;
    const resolved = events
      .filter((event) => event.event === 'def_param')
      .map((event) => paramEventSchema.parse(event))
      .find((event) => event.param === 'core.longpaths');
    commands.push({
      // The first entry is the path of the git binary
      argv: startEventSchema.parse(start).argv.slice(1),
      longPaths: resolved?.value ?? null,
    });
  }
  return commands;
}

describe('the setting every git command runs with', function () {
  it('is in effect for all of them, a clone by a read-only Core included', async function () {
    const trace = tmpDirPath();
    await Fs.ensureDir(trace);
    const readOnlyDataDir = tmpDirPath();
    const remote = tmpDirPath();
    // git writes what it resolved the setting to into the trace, so what is
    // asserted is git's own configuration rather than Core's command line
    vi.stubEnv('GIT_TRACE2_EVENT', trace);
    vi.stubEnv('GIT_TRACE2_CONFIG_PARAMS', 'core.longpaths');
    let projectPath = '';

    try {
      const { core } = createTmpCore();
      await core.user.set(user);
      const project = await core.projects.create({
        name: 'Configured',
        description: 'What every git command runs with',
        settings: { language: { default: 'en', supported: ['en'] } },
      });
      projectPath = core.util.pathTo.project(project.id);
      await core.git.clone(projectPath, remote, { bare: true });
      await core.git.status(projectPath);

      const readOnly = new ElekIoCore({
        isReadOnly: true,
        dataDir: readOnlyDataDir,
      });
      try {
        // The one command a repository's own config could never reach,
        // made by the Core that writes none
        await readOnly.projects.clone({ url: remote });
      } finally {
        await readOnly.dispose();
      }
    } finally {
      vi.unstubAllEnvs();
    }

    const commands = await tracedGitCommands(trace);
    expect(commands.filter((command) => command.longPaths !== 'true')).toEqual(
      []
    );

    // The pair comes first, so it can never be read as the command name
    const argv = commands.map((command) => command.argv);
    expect(argv.filter((args) => args[0] !== '-c')).toEqual([]);

    // The two clones and the call the constructor makes are in there
    const names = argv.map((args) => args[2]);
    expect(names.filter((name) => name === 'clone')).toHaveLength(2);
    expect(names).toContain('--version');

    // Nothing of it is written into the repository, so a Project an earlier
    // version created runs with it just the same. 1 is how git says the key
    // is not set
    const written = await gitExec(
      ['config', '--local', '--get', 'core.longpaths'],
      projectPath
    );
    expect(written.exitCode).toBe(1);
  }, 60000);
});

describe('the command line Core classifies, logs and redacts', function () {
  it('holds what the caller wrote, not what git is handed', async function () {
    const { core } = createTmpCore({ log: { level: 'debug' } });
    await core.user.set(user);
    const project = await core.projects.create({
      name: 'Logged',
      description: 'What a log file shows',
      settings: { language: { default: 'en', supported: ['en'] } },
    });
    const projectPath = core.util.pathTo.project(project.id);

    const debug = vi.spyOn(core.logger, 'debug');
    const info = vi.spyOn(core.logger, 'info');
    await core.git.status(projectPath);
    await core.git.add(projectPath, ['project.json']);

    const read = debug.mock.calls.map(
      ([props]) => props.meta?.['elek.git.command']
    );
    const changed = info.mock.calls.map(
      ([props]) => props.meta?.['elek.git.command']
    );
    expect(read).toContain('git status --porcelain=2');
    expect(changed).toContain('git add -- project.json');
    expect([...read, ...changed].join(' ')).not.toContain('core.longpaths');
  }, 60000);
});
