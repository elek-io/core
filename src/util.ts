import Os from 'os';
import Fs from 'fs';
import Util from 'util';
import Path from 'path';
import { v4 as Uuid } from 'uuid';
import Slugify from 'slugify';
import Rimraf from 'rimraf';
import Mkdirp from 'mkdirp';
import Git from 'nodegit';
import { ProjectConfig } from './project';
import { ThemeConfig } from './theme';
import { PageConfig } from './page';

/**
 * The directory in which everything is stored and will be worked in
 */
export const workingDirectory = Path.join(Os.homedir(), 'elek.io');

/**
 * A collection of often used paths
 */
export const pathTo = {
  projects: Path.join(workingDirectory, 'projects'),
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
  read: (path: string): any => {
    const content = Fs.readFileSync(path);
    return JSON.parse(content.toString());
  },
  /**
   * Writes JSON in human readable format to given file
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  write: (path: string, content: any): void => {
    Fs.writeFileSync(path, JSON.stringify(content, null, 2));
  }
};

/**
 * Returns true if the "value" object has all keys of "source",
 * otherwise an array of missing keys
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasKeysOf(value: any, source: any): true | string[] {
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
 * Configuration file helper
 */
export const config = {
  read: {
    /**
     * Reads a project config file and returns it's JSON
     */
    project: (projectId: string): ProjectConfig => {
      const path = Path.join(pathTo.projects, projectId, configNameOf.project);
      const content = json.read(path);
      const missingKeys = hasKeysOf(content, new ProjectConfig());
      if (missingKeys !== true) {
        throw new Error(`Project config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
      }
      return content;
    },
    /**
     * Reads a theme config file and returns it's JSON
     */
    theme: (projectId: string): ThemeConfig => {
      const path = Path.join(pathTo.projects, projectId, 'theme', configNameOf.theme);
      const content = json.read(path);
      const missingKeys = hasKeysOf(content, new ThemeConfig());
      if (missingKeys !== true) {
        throw new Error(`Theme config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
      }
      return content;
    },
    /**
     * Reads a page config file and returns it's JSON
     */
    page: (projectId: string, pageId: string): PageConfig => {
      const path = Path.join(pathTo.projects, projectId, 'pages', pageId);
      const content = json.read(path);
      const missingKeys = hasKeysOf(content, new PageConfig());
      if (missingKeys !== true) {
        throw new Error(`Page config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
      }
      return content;
    }
  },
  write: {
    /**
     * Writes to a project's config file
     */
    project: (projectId: string, content: ProjectConfig): void => {
      const missingKeys = hasKeysOf(content, new ProjectConfig());
      if (missingKeys !== true) {
        throw new Error(`Tried to write invalid project config. Missing required keys: ${missingKeys.join(', ')}`);
      }
      json.write(Path.join(pathTo.projects, projectId, configNameOf.project), content);
    },
    /**
     * Writes to a theme's config file
     */
    theme: (projectId: string, content: ThemeConfig): void => {
      const missingKeys = hasKeysOf(content, new ThemeConfig());
      if (missingKeys !== true) {
        throw new Error(`Tried to write invalid theme config. Missing required keys: ${missingKeys.join(', ')}`);
      }
      json.write(Path.join(pathTo.projects, projectId, 'theme', configNameOf.theme), content);
    },
    /**
     * Writes to a page's config file
     */
    page: (projectId: string, pageId: string, content: PageConfig): void => {
      const missingKeys = hasKeysOf(content, new PageConfig());
      if (missingKeys !== true) {
        throw new Error(`Tried to write invalid page config. Missing required keys: ${missingKeys.join(', ')}`);
      }
      json.write(Path.join(pathTo.projects, projectId, 'pages', pageId), content);
    }
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
 * Creates given directory recusively like consoles `mkdir -p`
 */
export function mkdir(directory: string): Promise<string | undefined> {
  return Mkdirp(directory);
}

/**
 * Deletes given directory with all it's content like consoles `rm -rf`
 */
export function rmrf(directory: string): Promise<void> {
  return Util.promisify(Rimraf)(directory);
}

/**
 * A collection of useful Git commands
 */
export const git = {
  init: (path: string): Promise<Git.Repository> => {
    return Git.Repository.init(path, 0);
  },
  clone: (url: string, localPath: string, options?: Git.CloneOptions): Promise<Git.Repository> => {
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
  commit: async (repository: Git.Repository, signature: Git.Signature, files: string | string[], message: string, isInit = false): Promise<Git.Oid> => {
    const index = await repository.refreshIndex();
    await index.addAll(files);
    index.write();
    const oid = await index.writeTree();

    if (isInit === true) {
      // Since we're creating an inital commit, it has no parents. Note that unlike
      // normal we don't get the head either, because there isn't one yet.
      return repository.createCommit('HEAD', signature, signature, message, oid, []);
    }

    // For normal commits we need the current HEAD as a parent
    // const head = await Git.Reference.nameToId(repository, 'HEAD');
    const parent = await repository.getHeadCommit();

    return repository.createCommit('HEAD', signature, signature, message, oid, [parent]);
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
