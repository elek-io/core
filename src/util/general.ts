import Os from 'os';
import Fs from 'fs-extra';
import Path from 'path';
import { v4 as Uuid } from 'uuid';
import Slugify from 'slugify';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';

/**
 * The directory in which everything is stored and will be worked in
 */
export const workingDirectory = Path.join(Os.homedir(), 'elek.io');

/**
 * A collection of often used paths
 */
export const pathTo = {
  projects: Path.join(workingDirectory, 'projects'),
  tmp: Path.join(workingDirectory, 'tmp'),
  logs: Path.join(workingDirectory, 'logs'),
  project: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId);
  },
  projectConfig: (projectId: string): string => {
    return Path.join(pathTo.project(projectId), 'elek.project.json');
  },
  projectLogs: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'logs');
  },
  pages: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'pages');
  },
  page: (projectId: string, pageId: string, language: string): string => {
    return Path.join(pathTo.pages(projectId), `${pageId}.${language}.json`);
  },
  blocks: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'blocks');
  },
  block: (projectId: string, blockId: string, language: string): string => {
    return Path.join(pathTo.blocks(projectId), `${blockId}.${language}.md`);
  },
  theme: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'theme');
  },
  themeConfig: (projectId: string): string => {
    const defaultPath = Path.join(pathTo.theme(projectId), 'elek.theme.json');
    const alternativePath = Path.join(pathTo.theme(projectId), 'package.json');

    if (Fs.existsSync(defaultPath)) {
      return defaultPath;
    }

    return alternativePath;
  },
  public: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'public');
  },
  assets: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'assets');
  },
  asset: (projectId: string, assetId: string, language: string): string => {
    return Path.join(pathTo.assets(projectId), `${assetId}.${language}.json`);
  },
  lfs: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId, 'lfs');
  },
  lfsFile: (projectId: string, assetId: string, language: string, extension: string): string => {
    return Path.join(pathTo.lfs(projectId), `${assetId}.${language}.${extension}`);
  }
};

/**
 * Returns a new UUID
 */
export function uuid(): string {
  return Uuid();
}

/**
 * Returns a complete default type, hydrated with the partials of value
 * 
 * @todo switch to lodash
 */
export function assignDefaultIfMissing<T>(value: Partial<T> | undefined | null, defaultsTo: T): T {
  return Object.assign(defaultsTo, value);
}

/**
 * Returns the slug of given string
 */
export function slug(string: string): string {
  return Slugify(string, {
    replacement: '-',  // replace spaces with replacement character, defaults to `-`
    remove: undefined, // remove characters that match regex, defaults to `undefined`
    lower: true,       // convert to lower case, defaults to `false`
    strict: true       // strip special characters except replacement, defaults to `false`
  });
}

/**
 * Basically a Promise.all() without rejecting if one promise fails to resolve
 */
export async function returnResolved<T>(promises: Promise<T>[]): Promise<T[]> {
  const toCheck: Promise<T | Error>[] = [];
  for (let index = 0; index < promises.length; index++) {
    const promise = promises[index];
    // Here comes the trick:
    // By using "then" and "catch" we are able to create an array of Project and Error types
    // without throwing and stopping the later Promise.all() call prematurely
    toCheck.push(promise.then((result) => {
      return result;
    }).catch((error) => {
      // Because the error parameter could be anything, 
      // we need to specifically call an Error 
      return new Error(error);
    }));
  }
  // Resolve all promises
  // Here we do not expect any error to fail the call to Promise.all()
  // because we caught it earlier and returning an Error type instead of throwing it
  const checked = await Promise.all(toCheck);
  // This way we can easily filter out any Errors by type
  // Note that we also need to use a User-Defined Type Guard here,
  // because otherwise TS does not recognize we are filtering the errors out
  //                         >       |        < 
  return checked.filter((item): item is T => {
    return item instanceof Error !== true;
  });
}

/**
 * Custom async typescript ready implementation of Node.js child_process
 * 
 * @see https://nodejs.org/api/child_process.html
 * @see https://github.com/ralphtheninja/await-spawn
 */
export function spawnChildProcess(command: string, args: ReadonlyArray<string>, options?: SpawnOptionsWithoutStdio): Promise<string> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, options);
    let log = '';

    childProcess.stdout.on('data', (data) => {
      log += data;
    });

    childProcess.stderr.on('data', (data) => {
      log += data;
    });

    childProcess.on('error', (error) => {
      throw error;
    });

    childProcess.on('exit', (code) => {
      if (code === 0) {
        return resolve(log);
      }
      return reject(log);
    });
  });
}

/**
 * Returns all subdirectories of given directory
 */
export async function subdirectories(path: string): Promise<Fs.Dirent[]> {
  const dirent = await Fs.promises.readdir(path, { withFileTypes: true });
  return dirent.filter((dirent) => {
    return dirent.isDirectory();
  });
}

/**
 * Returns all files of given directory which can be filtered by extension
 */
export async function files(path: string, extension?: string): Promise<Fs.Dirent[]> {
  const dirent = await Fs.promises.readdir(path, { withFileTypes: true });
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
 * Returns the relative path for given path 
 * by stripping out everything up to the working directory
 */
export function getRelativePath(path: string): string {
  let relativePath = path.replace(workingDirectory, '');
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substr(1);
  }
  return relativePath;
}
