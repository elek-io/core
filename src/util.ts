import Os from 'os';
import Fs from 'fs-extra';
import Path from 'path';
import { v4 as Uuid } from 'uuid';
import Slugify from 'slugify';
import Git from 'nodegit';
import { ProjectConfig } from './project';
import { ThemeConfig } from './theme';
import { PageConfig } from './page';
import { BlockConfig } from './block';

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
  theme: 'elek.theme.json'
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
  promises.forEach((promise) => {
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
  });
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

/**
 * A collection of useful Git commands
 */
export const git = {
  init: (path: string): Promise<Git.Repository> => {
    return Git.Repository.init(path, 0);
  },
  clone: async (url: string, localPath: string, options?: Git.CloneOptions): Promise<Git.Repository> => {
    return Git.Clone.clone(url, localPath, options);
  },
  pull: async (repository: Git.Repository | string): Promise<Git.Oid> => {
    // Check if we need to resolve that repository
    if (typeof repository === 'string') {
      repository = await Git.Repository.open(repository);
    }

    await repository.fetchAll();
    return repository.mergeBranches('master', 'origin/master');
  },
  /**
   * @todo check if pathspec could be used to only get the status of given files
   */
  commit: async (repository: Git.Repository, signature: Git.Signature, files: string | string[], message: string, isInit = false): Promise<Git.Oid> => {
    // Check if all files should be committed
    if (files !== '*') {
      // If not, we only want to commit changes
      // So first we need to get the status of given files
      const status = await repository.getStatus();
      files = status.filter((file) => {
        // Filter out any files that are modified but not included in the files we want to commit
        return files.includes(file.path());
      }).map((file) => {
        // Now return the path
        return file.path();
      });
    }
    
    // Add the files to the staging area
    const index = await repository.refreshIndex();
    await index.addAll(files);
    index.write();
    const oid = await index.writeTree();

    // If we're creating an inital commit, it has no parents. Note that unlike
    // normal we don't get the head either, because there isn't one yet.
    const parents: Git.Commit[] = [];
    if (isInit !== true) {
      // For normal commits we need the current HEAD as a parent
      parents.push(await repository.getHeadCommit());
    }
    
    // Now create the commit
    return repository.createCommit('HEAD', signature, signature, message, oid, parents);
  },
  status: (repository: Git.Repository): Promise<Git.StatusFile[]> => {
    return repository.getStatus();
  },
  checkout: async (repository: Git.Repository, name: string, isNew = false): Promise<Git.Reference> => {
    if (isNew === true) {
      await repository.createBranch(name, await repository.getHeadCommit());
    }
    return repository.checkoutBranch(name);
  },
  open: (path: string): Promise<Git.Repository> => {
    return Git.Repository.open(path);
  },
  discover: (path: string): Promise<Git.Buf> => {
    return Git.Repository.discover(path, 0, '');
  }
};
