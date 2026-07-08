import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { projectFolderSchema } from '../schema/projectSchema.js';
import type { LogService } from '../service/LogService.js';

/**
 * Resolves the data directory Core reads and writes data in
 *
 * Precedence: the given directory wins over the ELEK_IO_DATA_DIR
 * environment variable, which wins over the default `~/elek.io`.
 * An empty or whitespace-only value counts as unset, for the
 * argument and the environment variable alike.
 * Relative paths are resolved against the current working directory.
 */
export function resolveDataDir(dataDir?: string): string {
  const fromArg = dataDir?.trim();
  const fromEnv = process.env['ELEK_IO_DATA_DIR']?.trim();
  return Path.resolve(fromArg || fromEnv || Path.join(Os.homedir(), 'elek.io'));
}

/**
 * Creates a collection of often used paths, rooted at the given data directory
 */
export function createPathTo(dataDir: string) {
  const pathTo = {
    tmp: Path.join(dataDir, 'tmp'),
    userFile: Path.join(dataDir, 'user.json'),
    logs: Path.join(dataDir, 'logs'),

    projects: Path.join(dataDir, 'projects'),
    project: (projectId: string): string => {
      return Path.join(pathTo.projects, projectId);
    },
    projectFile: (projectId: string): string => {
      return Path.join(pathTo.project(projectId), 'project.json');
    },

    lfs: (projectId: string): string => {
      return Path.join(pathTo.project(projectId), projectFolderSchema.enum.lfs);
    },

    components: (projectId: string): string => {
      return Path.join(
        pathTo.project(projectId),
        projectFolderSchema.enum.components
      );
    },
    component: (projectId: string, id: string) => {
      return Path.join(pathTo.components(projectId), id);
    },
    componentFile: (projectId: string, id: string) => {
      return Path.join(pathTo.component(projectId, id), 'component.json');
    },
    componentIndex: (projectId: string) => {
      return Path.join(pathTo.components(projectId), 'slug.index.json');
    },

    collections: (projectId: string): string => {
      return Path.join(
        pathTo.project(projectId),
        projectFolderSchema.enum.collections
      );
    },
    collection: (projectId: string, id: string) => {
      return Path.join(pathTo.collections(projectId), id);
    },
    collectionFile: (projectId: string, id: string) => {
      return Path.join(pathTo.collection(projectId, id), 'collection.json');
    },
    collectionIndex: (projectId: string) => {
      return Path.join(pathTo.collections(projectId), 'slug.index.json');
    },

    entries: (projectId: string, collectionId: string): string => {
      return Path.join(pathTo.collection(projectId, collectionId));
    },
    entryFile: (projectId: string, collectionId: string, id: string) => {
      return Path.join(pathTo.entries(projectId, collectionId), `${id}.json`);
    },

    assets: (projectId: string): string => {
      return Path.join(
        pathTo.project(projectId),
        projectFolderSchema.enum.assets
      );
    },
    assetFile: (projectId: string, id: string): string => {
      return Path.join(pathTo.assets(projectId), `${id}.json`);
    },
    asset: (projectId: string, id: string, extension: string): string => {
      return Path.join(pathTo.lfs(projectId), `${id}.${extension}`);
    },
    tmpAsset: (id: string, commitHash: string, extension: string) => {
      return Path.join(pathTo.tmp, `${id}.${commitHash}.${extension}`);
    },
  };
  return pathTo;
}
export type PathTo = ReturnType<typeof createPathTo>;

/**
 * Used as parameter for filter() methods to assure,
 * only values not null, undefined or empty strings are returned
 *
 * @param value Value to check
 */
export function isNotEmpty<T>(value: T | null | undefined): value is T {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return false;
    }
  }
  return true;
}

/**
 * Returns all folders of given path to a directory
 */
export async function folders(path: string): Promise<Fs.Dirent[]> {
  const dirent = await Fs.readdir(path, { withFileTypes: true });
  return dirent.filter((dirent) => {
    return dirent.isDirectory();
  });
}

/**
 * Returns all files of given path to a directory,
 * which can be filtered by extension
 */
export async function files(
  path: string,
  extension?: string
): Promise<Fs.Dirent[]> {
  const dirent = await Fs.readdir(path, { withFileTypes: true });
  return dirent.filter((dirent) => {
    if (extension && dirent.isFile() === true) {
      if (dirent.name.endsWith(extension)) {
        return true;
      }
      return false;
    }
    return dirent.isFile();
  });
}

/**
 * Executes a shell command async and returns the output.
 *
 * When on Windows, it will automatically append `.cmd` to the command if it is in the `commandsToSuffix` list.
 */
export function execCommand({
  command,
  args,
  options,
  logger,
}: {
  command: string;
  args: string[];
  options?: ExecFileOptions;
  logger: LogService;
}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const commandsToSuffix = ['pnpm'];
    const isWindows = Os.platform() === 'win32';
    const suffixedCommand = isWindows
      ? command
          .split(' ')
          .map((cmd) => (commandsToSuffix.includes(cmd) ? `${cmd}.cmd` : cmd))
          .join(' ')
      : command;
    const fullCommand = `${suffixedCommand} ${args.join(' ')}`;
    const execOptions: ExecFileOptions = {
      ...options,
      shell: true,
    };
    const start = Date.now();

    execFile(suffixedCommand, args, execOptions, (error, stdout, stderr) => {
      const durationMs = Date.now() - start;
      if (error) {
        logger.error({
          source: 'core',
          message: `Error executing command "${fullCommand}" after ${durationMs}ms: ${error.message}`,
          meta: { error, stdout: stdout.toString(), stderr: stderr.toString() },
        });
        reject(error instanceof Error ? error : new Error(error.message));
      } else {
        logger.info({
          source: 'core',
          message: `Command "${fullCommand}" executed successfully in ${durationMs}ms.`,
          meta: { stdout: stdout.toString(), stderr: stderr.toString() },
        });
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}
