import Fs from 'fs-extra';
import Os from 'os';
import Path from 'path';
import { execFile } from 'child_process';
import { projectFolderSchema } from '../schema/projectSchema.js';
import type { LogService } from '../service/LogService.js';

/**
 * The directory in which everything is stored and will be worked in
 *
 * @todo make the workingDirectory an elek option to be set via app.getPath('home') (electron instead of node)?
 */
export const workingDirectory = Path.join(Os.homedir(), 'elek.io');

/**
 * A collection of often used paths
 */
export const pathTo = {
  tmp: Path.join(workingDirectory, 'tmp'),
  userFile: Path.join(workingDirectory, 'user.json'),
  logs: Path.join(workingDirectory, 'logs'),

  projects: Path.join(workingDirectory, 'projects'),
  project: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId);
  },
  projectFile: (projectId: string): string => {
    return Path.join(pathTo.project(projectId), 'project.json');
  },
  // projectLogs: (projectId: string): string => {
  //   return Path.join(pathTo.project(projectId), projectFolderSchema.enum.logs);
  // },

  // public: (projectId: string): string => {
  //   return Path.join(pathTo.project(projectId), 'public');
  // },

  lfs: (projectId: string): string => {
    return Path.join(pathTo.project(projectId), projectFolderSchema.enum.lfs);
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

  entries: (projectId: string, collectionId: string): string => {
    return Path.join(pathTo.collection(projectId, collectionId));
  },
  entryFile: (projectId: string, collectionId: string, id: string) => {
    return Path.join(pathTo.entries(projectId, collectionId), `${id}.json`);
  },

  sharedValues: (projectId: string): string => {
    return Path.join(pathTo.project(projectId), 'shared-values');
  },
  sharedValueFile: (projectId: string, id: string, language: string) => {
    return Path.join(pathTo.sharedValues(projectId), `${id}.${language}.json`);
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

/**
 * Used as parameter for filter() methods to assure,
 * only values not null, undefined or empty strings are returned
 *
 * @param value Value to check
 */
export function notEmpty<T>(value: T | null | undefined): value is T {
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

export function isNoError<T>(item: T | Error): item is T {
  return item instanceof Error !== true;
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
 */
export function execCommand(
  command: string,
  args: string[],
  logger: LogService
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const fullCommand = `"${command}" ${args.join(' ')}`;
    // const execOptions: ExecOptions = {
    //   cwd: path,
    //   encoding: 'utf8',
    //   maxBuffer: options ? options.maxBuffer : 10 * 1024 * 1024,
    //   env,
    // };
    const start = Date.now();

    execFile(command, args, { shell: true }, (error, stdout, stderr) => {
      const durationMs = Date.now() - start;
      if (error) {
        logger.error(
          `Error executing command (${fullCommand}) after ${durationMs}ms: ${error}`
        );
        reject(error);
      } else {
        logger.info(
          `Command (${fullCommand}) executed successfully in ${durationMs}ms.`
        );
        resolve({ stdout, stderr });
      }
    });
  });
}
