import { spawn, type SpawnOptionsWithoutStdio } from 'child_process';
import Fs from 'fs-extra';
import { filter, flatten, groupBy, uniq } from 'lodash-es';
import Os from 'os';
import Path from 'path';
import slugify from 'slugify';
import { v4 as generateUuid } from 'uuid';
import { uuidSchema, type Uuid } from '../schema/baseSchema.js';
import { projectFolderSchema } from '../schema/projectSchema.js';

// Hack to make slugify work with ESM
// @see https://github.com/simov/slugify/issues/24
// @ts-ignore
const Slugify = slugify.default || slugify;

/**
 * Returns a new UUID
 */
export function uuid(): Uuid {
  return generateUuid();
}

/**
 * Returns the current UNIX timestamp
 *
 * Since the UNIX timestamp is the number of seconds
 * that have elapsed from January 1, 1970, UTC and
 * `Date.now()` returns the time in milliseconds,
 * we need to convert this into seconds.
 */
export function currentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Returns the slug of given string
 */
export function slug(string: string): string {
  return Slugify(string, {
    replacement: '-', // replace spaces with replacement character, defaults to `-`
    remove: undefined, // remove characters that match regex, defaults to `undefined`
    lower: true, // convert to lower case, defaults to `false`
    strict: true, // strip special characters except replacement, defaults to `false`
  });
}

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
  // logs: Path.join(workingDirectory, 'logs'),

  projects: Path.join(workingDirectory, 'projects'),
  project: (projectId: string): string => {
    return Path.join(pathTo.projects, projectId);
  },
  projectFile: (projectId: string): string => {
    return Path.join(pathTo.project(projectId), 'project.json');
  },
  // projectLogs: (projectId: string): string => {
  //   return Path.join(pathTo.project(projectId), projectFolderSchema.Enum.logs);
  // },

  // public: (projectId: string): string => {
  //   return Path.join(pathTo.project(projectId), 'public');
  // },

  lfs: (projectId: string): string => {
    return Path.join(pathTo.project(projectId), projectFolderSchema.Enum.lfs);
  },

  collections: (projectId: string): string => {
    return Path.join(
      pathTo.project(projectId),
      projectFolderSchema.Enum.collections
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
      projectFolderSchema.Enum.assets
    );
  },
  assetFile: (projectId: string, id: string, language: string): string => {
    return Path.join(pathTo.assets(projectId), `${id}.${language}.json`);
  },
  asset: (
    projectId: string,
    id: string,
    language: string,
    extension: string
  ): string => {
    return Path.join(pathTo.lfs(projectId), `${id}.${language}.${extension}`);
  },
};

/**
 * Searches for a potential project ID in given path string and returns it
 *
 * Mainly used for logging inside the GitService, where we don't have a project ID,
 * but always have a path which could contain one. The ID is then used,
 * to log to the current project log, instead of logging to the main log file.
 *
 * @todo I really dont like this and I do not know how much performance we loose here
 */
export const fromPath = {
  projectId: (path: string): string | undefined => {
    const startsWith = 'projects/';
    const endsWith = '/';
    const start = path.indexOf(startsWith) + startsWith.length;
    // Return early
    if (start === -1) {
      return undefined;
    }
    const end = path.indexOf(endsWith, start);
    // Use path length if there is no ending "/"
    const result = path.substring(start, end === -1 ? path.length : end);
    if (result && uuidSchema.safeParse(result).success) {
      return result;
    }
    return undefined;
  },
};

/**
 * Returns a complete default type, hydrated with the partials of value
 */
export function assignDefaultIfMissing<T extends {}>(
  value: Partial<T> | undefined | null,
  defaultsTo: T
): T {
  return Object.assign(defaultsTo, value);
}

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
 * Basically a Promise.all() without rejecting if one promise fails to resolve
 */
export async function returnResolved<T>(promises: Promise<T>[]) {
  const toCheck: Promise<T | Error>[] = [];
  for (let index = 0; index < promises.length; index++) {
    const promise = promises[index];
    if (!promise) {
      throw new Error(`No promise found at index "${index}"`);
    }
    // Here comes the trick:
    // By using "then" and "catch" we are able to create an array of Project and Error types
    // without throwing and stopping the later Promise.all() call prematurely
    toCheck.push(
      promise
        .then((result) => {
          return result;
        })
        .catch((error) => {
          // Because the error parameter could be anything,
          // we need to specifically call an Error
          return new Error(error);
        })
    );
  }
  // Resolve all promises
  // Here we do not expect any error to fail the call to Promise.all()
  // because we caught it earlier and returning an Error type instead of throwing it
  const checked = await Promise.all(toCheck);
  // This way we can easily filter out any Errors by type
  // Note that we also need to use a User-Defined Type Guard here,
  // because otherwise TS does not recognize we are filtering the errors out
  //                         >       |        <
  return checked.filter(isNoError);
}

/**
 * Custom async typescript ready implementation of Node.js child_process
 *
 * @see https://nodejs.org/api/child_process.html
 * @see https://github.com/ralphtheninja/await-spawn
 */
export function spawnChildProcess(
  command: string,
  args: ReadonlyArray<string>,
  options?: SpawnOptionsWithoutStdio
): Promise<string> {
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
 * Returns all folders of given path
 */
export async function folders(path: string): Promise<Fs.Dirent[]> {
  const dirent = await Fs.readdir(path, { withFileTypes: true });
  return dirent.filter((dirent) => {
    return dirent.isDirectory();
  });
}

/**
 * Returns all files of given path which can be filtered by extension
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

/**
 * Searches given array of objects for duplicates of given key and returns them
 *
 * @param arr Array with possible duplicate values
 * @param key Key of object T to get duplicates of
 */
export function getDuplicates<T>(arr: T[], key: keyof T) {
  const grouped = groupBy(arr, (item) => {
    return item[key];
  });
  return uniq(
    flatten(
      filter(grouped, (item) => {
        return item.length > 1;
      })
    )
  );
}
