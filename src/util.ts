import Os from 'os';
import Fs from 'fs-extra';
import Path from 'path';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { v4 as Uuid } from 'uuid';
import Slugify from 'slugify';
import Globby from 'globby';
import Git from 'isomorphic-git';
import Http from 'isomorphic-git/http/node';
import { ProjectConfig } from './project';
import { ThemeConfig } from './theme';
import { PageConfig } from './page';
import { BlockConfig } from './block';
import { sign } from 'crypto';
import { stat } from 'fs';

/**
 * The directory in which everything is stored and will be worked in
 */
export const workingDirectory = Path.join(Os.homedir(), 'elek.io');

/**
 * A collection of often used paths
 */
export const pathTo = {
  projects: Path.join(workingDirectory, 'projects')
};

/**
 * A collection of config file names
 */
export const configNameOf = {
  project: 'elek.project.json',
  theme: 'package.json'
};

/**
 * Returns a new UUID
 * @todo remove once ID is returned from API
 */
export function uuid(): string {
  return Uuid();
}

/**
 * JSON file helper
 */
export const json = {
  /**
   * Reads the content of given file and returnes parsed JSON
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  read: async (path: string): Promise<any> => {
    const content = await Fs.readFile(path);
    return JSON.parse(content.toString());
  },
  /**
   * Reads the header of given buffer and returnes parsed JSON
   * 
   * Used to extract JSON headers from markdown files
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readHeader: async (buffer: Buffer): Promise<any | undefined> => {
    const content = buffer.toString();
    if (content.startsWith('---') === false) {
      throw new Error('File contained no JSON header');
    }
    const header = content.substring(
      content.indexOf('---') + 3, 
      content.lastIndexOf('---')
    );
    return JSON.parse(header);
  },
  /**
   * Writes JSON in human readable format to given file
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  write: async (path: string, content: any): Promise<void> => {
    await Fs.writeFile(path, JSON.stringify(content, null, 2));
  }
};

/**
 * Returns true if the "value" object has all keys of "source",
 * otherwise an array of missing keys
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function hasKeysOf(value: any, source: any): true | string[] {
  const missingKeys: string[] = [];
  Object.keys(source).forEach((key) => {
    if (Object.keys(value).includes(key) === false) {
      missingKeys.push(key);
    }
  });
  if (missingKeys.length > 0) {
    return missingKeys;
  }
  return true;
}

/**
 * Returns a complete default type, hydrated with the partials of value
 */
export function assignDefaultIfMissing<T>(value: Partial<T>, defaultsTo: T): T {
  return Object.assign(defaultsTo, value);
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
  // because we catched it earlier and returning an Error type instead of throwing it
  const checked = await Promise.all(toCheck);
  // This way we can easily filter out any Error types
  // and are able to return only initialized projects 
  // that did not throw an error.
  // Note that we also need to use a User-Defined Type Guard here,
  // because otherwise TS does not recognize we are filtering the errors out
  //                         >       |        < 
  return checked.filter((item): item is T => {
    return item instanceof Error !== true;
  });
}

/**
 * Read file helper
 */
export const read = {
  /**
   * Reads a project config file and returns it's JSON
   */
  project: async (projectId: string): Promise<ProjectConfig> => {
    const path = Path.join(pathTo.projects, projectId, configNameOf.project);
    const content = await json.read(path);
    const missingKeys = hasKeysOf(content, new ProjectConfig());
    if (missingKeys !== true) {
      throw new Error(`Project config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return content;
  },
  /**
   * Reads a theme config file and returns it's JSON
   */
  theme: async (projectId: string): Promise<ThemeConfig> => {
    const path = Path.join(pathTo.projects, projectId, 'theme', configNameOf.theme);
    const content = await json.read(path);
    const missingKeys = hasKeysOf(content, new ThemeConfig());
    if (missingKeys !== true) {
      throw new Error(`Theme config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return content;
  },
  /**
   * Reads a page config file and returns it's JSON
   */
  page: async (projectId: string, pageId: string): Promise<PageConfig> => {
    const path = Path.join(pathTo.projects, projectId, 'pages', `${pageId}.json`);
    const content = await json.read(path);
    const missingKeys = hasKeysOf(content, new PageConfig());
    if (missingKeys !== true) {
      throw new Error(`Page config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return content;
  },
  block: async (projectId: string, blockId: string): Promise<{config: BlockConfig, content: string}> => {
    const path = Path.join(pathTo.projects, projectId, 'blocks', `${blockId}.md`);
    const content = await Fs.readFile(path);
    const header = await json.readHeader(content);
    const missingKeys = hasKeysOf(header, new BlockConfig());
    if (missingKeys !== true) {
      throw new Error(`Block config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return {
      config: header,
      content: content.toString().substring(content.toString().lastIndexOf('---') + 3)
    };
  }
};

/**
 * Write file helper
 */
export const write = {
  /**
   * Writes to a project's config file
   */
  project: async (projectId: string, config: ProjectConfig): Promise<void> => {
    const missingKeys = hasKeysOf(config, new ProjectConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid project config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    await json.write(Path.join(pathTo.projects, projectId, configNameOf.project), config);
  },
  /**
   * Writes to a theme's config file
   */
  theme: async (projectId: string, config: ThemeConfig): Promise<void> => {
    const missingKeys = hasKeysOf(config, new ThemeConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid theme config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    await json.write(Path.join(pathTo.projects, projectId, 'theme', configNameOf.theme), config);
  },
  /**
   * Writes to a page's config file
   */
  page: async (projectId: string, pageId: string, config: PageConfig): Promise<void> => {
    const missingKeys = hasKeysOf(config, new PageConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid page config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    await json.write(Path.join(pathTo.projects, projectId, 'pages', `${pageId}.json`), config);
  },
  /**
   * Writes to a block's config header and content
   */
  block: async (projectId: string, blockId: string, config: BlockConfig, content?: string): Promise<void> => {
    const path = Path.join(pathTo.projects, projectId, 'blocks', `${blockId}.md`);
    const missingKeys = hasKeysOf(config, new BlockConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid block config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    // Now write the file with header and given content
    await Fs.writeFile(path, `---
${JSON.stringify(config, null, 2)}
---
${content}`);
  }
};

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

export interface GitSignature {
  name: string;
  email: string;
}

/**
 * A collection of useful Git commands
 */
export const git = {
  /**
   * Initializes a new repository
   */
  init: (localPath: string, options?: Partial<Parameters<typeof Git.init>[0]>): Promise<void> => {
    return Git.init(assignDefaultIfMissing(options || {}, {
      fs: Fs,
      dir: localPath
    }));
  },
  /**
   * Clones a repository
   */
  clone: async (url: string, localPath: string, options?: Partial<Parameters<typeof Git.clone>[0]>): Promise<void> => {
    return Git.clone(assignDefaultIfMissing(options || {}, {
      fs: Fs,
      http: Http,
      url: url,
      dir: localPath
    }));
  },
  /**
   * Fetches and merges commits from a remote repository
   */
  pull: async (localPath: string, options?: Partial<Parameters<typeof Git.pull>[0]>): Promise<void> => {
    return Git.pull(assignDefaultIfMissing(options || {}, {
      fs: Fs,
      http: Http,
      dir: localPath
    }));
  },
  /**
   * Adds and commits given files
   */
  commit: async (localPath: string, signature: GitSignature, files: string | string[], message: string, options?: Partial<Parameters<typeof Git.commit>[0]>): Promise<string> => {

    // Support the * (add and commit everything) syntax
    if (files === '*') {
      files = await Globby(['./**', './**/.*'], {
        cwd: localPath,
        gitignore: true
      });
    }

    // Convert single string to string array for ease of use
    if (typeof files === 'string') {
      files = [files];
    }

    // The .add() method only accepts relative paths
    // so we need to remove the localPath part of it if needed
    files = files.map((file) => {
      if (file.includes(localPath)) {
        return file.replace(localPath + '/', '');
      }
      return file;
    });

    // Only commit changed files, not all of them again and again
    files = files.filter(async (file) => {
      const status = await Git.status({
        fs: Fs,
        dir: localPath,
        filepath: file
      });
      return status === '*added' || status === '*modified' || status === '*deleted';
    });

    await Promise.all(files.map(async (file) => {
      // Add all changed files to the staging area
      return Git.add({
        fs: Fs,
        dir: localPath,
        filepath: file
      });
    }));

    // Now create the commit
    return Git.commit(assignDefaultIfMissing(options || {}, {
      fs: Fs,
      dir: localPath,
      author: signature,
      message: message
    }));
  },
  /**
   * Checkout a branch
   * 
   * If the branch already exists it will check out that branch. 
   * Otherwise, it will create a new remote tracking branch set to track the remote branch of that name.
   */
  checkout: async (localPath: string, name: string, isNew = false, options?: Partial<Parameters<typeof Git.checkout>[0]>): Promise<void> => {
    if (isNew === true) {
      await Git.branch({
        fs: Fs,
        dir: localPath,
        ref: name
      });
    }

    return Git.checkout(assignDefaultIfMissing(options || {}, {
      fs: Fs,
      dir: localPath,
      ref: name
    }));
  }
};

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