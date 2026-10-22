import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import z from 'zod';
import ElekIoCore from '../index.node.js';
import type { SetUserProps } from '../schema/userSchema.js';
import { createTmpCore, tmpDirPath } from '../test/util.js';
import { gitGlobalConfig } from '../util/git.js';
import { uuid } from '../util/shared.js';

/**
 * What lets Core work where the paths it builds pass the 260 characters
 * Windows resolves a path against: `core.longpaths`, in a scope git reads
 * before a repository's own config, on every git command Core runs.
 *
 * The cases at the top are the user-visible failure and only exist on
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
 * filesystem to take. Its removal is registered with vitest, so a case
 * that throws cannot leave a tree this deep behind.
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
  onTestFinished(async () => {
    await Fs.remove(path);
  });
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

  it.runIf(isWindows)(
    'holds an Asset there, which Git LFS stores and reads back',
    async function () {
      const dataDir = deepDataDir();
      const core = new ElekIoCore({ dataDir });
      try {
        await core.user.set(user);
        const project = await core.projects.create({
          name: 'Deep Assets',
          description: 'An Asset past the Windows path limit',
          settings: { language: { default: 'en', supported: ['en'] } },
        });

        // Git LFS is a separate binary with its own file IO, so what holds
        // for git is no answer for the Asset binaries it stores
        const asset = await core.assets.create({
          projectId: project.id,
          filePath: Path.resolve('src/test/data/150x150.png'),
          name: 'Deep',
          description: 'A 150x150 image below a deep data directory',
        });
        expect(asset.absolutePath.length).toBeGreaterThan(260);

        const status = await core.git.status(
          core.util.pathTo.project(project.id)
        );
        expect(status.files).toEqual([]);

        const read = await core.assets.read({
          projectId: project.id,
          id: asset.id,
        });
        expect(await Fs.readFile(read.absolutePath)).toEqual(
          await Fs.readFile(Path.resolve('src/test/data/150x150.png'))
        );
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

/**
 * A configuration key git resolved, the scope it read it from and the value
 * it held there. git writes one per scope the key appears in, in the order
 * it reads them, rather than one for the value it ended up with.
 */
const paramEventSchema = z.looseObject({
  scope: z.string(),
  param: z.string(),
  value: z.string(),
});
type ParamEvent = z.infer<typeof paramEventSchema>;

/** A git process, and every scope it read `core.longpaths` from. */
interface TracedGitCommand {
  argv: string[];
  longPaths: ParamEvent[];
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
    commands.push({
      // The first entry is the path of the git binary
      argv: startEventSchema.parse(start).argv.slice(1),
      longPaths: events
        .filter((event) => event.event === 'def_param')
        .map((event) => paramEventSchema.parse(event))
        .filter((event) => event.param === 'core.longpaths'),
    });
  }
  return commands;
}

/** The last value git read for the key, which is the one it resolved to. */
function resolved(command: TracedGitCommand): string | null {
  return command.longPaths.at(-1)?.value ?? null;
}

/**
 * The last value git read in the global scope, which is the one Core's own
 * file put there, before git opened the repository's config. Naming the
 * scope rather than "anything before the repository" keeps a machine whose
 * system config happens to carry the key from standing in for Core.
 */
function resolvedGlobally(command: TracedGitCommand): string | null {
  return (
    command.longPaths.findLast((event) => event.scope === 'global')?.value ??
    null
  );
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
    expect(commands).not.toEqual([]);
    expect(commands.filter((command) => resolved(command) !== 'true')).toEqual(
      []
    );

    // The one the user-visible failure turns on. git decides long paths
    // while it reads the config, so a value only the command line carries
    // comes too late for the repository's own config file
    expect(
      commands.filter((command) => resolvedGlobally(command) !== 'true')
    ).toEqual([]);

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

describe('the global configuration Core hands git', function () {
  it('reads the files git would have read, and adds the key under them', async function () {
    const dir = tmpDirPath();
    const ambient = Path.join(dir, 'their.gitconfig');
    await Fs.outputFile(
      ambient,
      '[user]\n\tname = Their Person\n[core]\n\tlongpaths = false\n'
    );
    const ours = Path.join(dir, 'ours.gitconfig');
    await Fs.outputFile(
      ours,
      gitGlobalConfig({ global: ambient, xdgConfigHome: undefined })
    );

    const listed = await gitExec(
      [
        'config',
        '--show-scope',
        '--get-regexp',
        'user\\.name|core\\.longpaths',
      ],
      dir,
      {
        env: {
          GIT_CONFIG_GLOBAL: ours,
          // So only what Core wrote and what it included is listed
          GIT_CONFIG_SYSTEM: Path.join(dir, 'no-such.gitconfig'),
        },
      }
    );

    // Theirs is read, in the global scope where git read it before, and the
    // key Core needs comes after it, so it is what git resolves
    expect(listed.stdout.trim().split('\n')).toEqual([
      'global\tuser.name Their Person',
      'global\tcore.longpaths false',
      'global\tcore.longpaths true',
    ]);
  }, 60000);

  it('reads both files git looks at when the host process names none', function () {
    const includes = (content: string): string[] =>
      [...content.matchAll(/^\tpath = (?<path>.+)$/gm)].map(
        (match) => match.groups?.['path'] ?? ''
      );

    expect(
      includes(gitGlobalConfig({ global: undefined, xdgConfigHome: undefined }))
    ).toEqual(['"~/.config/git/config"', '"~/.gitconfig"']);
    // A backslash is an escape in a config value, so a Windows path is
    // written with its own doubled
    expect(
      includes(
        gitGlobalConfig({
          global: undefined,
          xdgConfigHome: 'C:\\Users\\A\\cfg',
        })
      )
    ).toEqual(['"C:\\\\Users\\\\A\\\\cfg/git/config"', '"~/.gitconfig"']);
    // git's own rule: the variable replaces both files, and an empty value
    // means there is no global configuration to read
    expect(
      includes(gitGlobalConfig({ global: '', xdgConfigHome: undefined }))
    ).toEqual([]);
  });
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
