import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import { logLevelSchema, type LogLevel } from '../schema/baseSchema.js';
import { elekIoCoreOptionsSchema } from '../schema/coreSchema.js';
import {
  contentChannelSchema,
  projectFolderSchema,
} from '../schema/projectSchema.js';
import { CoreError } from './shared.js';

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
 * Resolves whether Core runs in read-only mode
 *
 * Precedence: the given value wins over the ELEK_IO_READ_ONLY
 * environment variable, which defaults to false. The environment
 * variable counts as true only when set to `true`, an empty or
 * whitespace-only value counts as unset.
 */
export function resolveReadOnly(isReadOnly?: boolean): boolean {
  if (isReadOnly !== undefined) {
    return isReadOnly;
  }
  return process.env['ELEK_IO_READ_ONLY']?.trim() === 'true';
}

/**
 * Resolves the lowest level Core logs
 *
 * Precedence: the given level wins over the ELEK_IO_LOG_LEVEL
 * environment variable, which wins over the default `info`. An empty
 * or whitespace-only value counts as unset. A level Core does not
 * know throws rather than falling back, so a typo turns into a
 * message instead of silently leaving the logs as they were.
 */
export function resolveLogLevel(level?: LogLevel): LogLevel {
  if (level !== undefined) {
    return level;
  }
  const fromEnv = process.env['ELEK_IO_LOG_LEVEL']?.trim();
  if (!fromEnv) {
    return 'info';
  }
  const parsed = logLevelSchema.safeParse(fromEnv);
  if (!parsed.success) {
    throw CoreError.badRequest(
      `ELEK_IO_LOG_LEVEL must be "error", "warn", "info" or "debug", got "${fromEnv}"`
    );
  }
  return parsed.data;
}

/**
 * Resolves the content ref to provision
 *
 * Precedence: the ELEK_IO_CHANNEL environment variable wins over the
 * given ref, which wins over the default `production`. The
 * environment variable applies to every Project of a deployment, so
 * it only accepts channels, never exact versions. Versions are
 * per-Project decisions and belong into configuration. An empty or
 * whitespace-only value counts as unset.
 */
export function resolveContentRef(ref?: string): string {
  const fromEnv = process.env['ELEK_IO_CHANNEL']?.trim();
  if (fromEnv) {
    const channel = contentChannelSchema.safeParse(fromEnv);
    if (!channel.success) {
      throw CoreError.badRequest(
        `ELEK_IO_CHANNEL must be "production", "preview" or "draft", got "${fromEnv}". Pin exact versions per Project through the ref option instead.`
      );
    }
    return channel.data;
  }
  return ref?.trim() || 'production';
}

/**
 * Resolves the base URL of the elek.io Cloud API
 *
 * Precedence: the given URL wins over the ELEK_IO_CLOUD_URL environment
 * variable, which wins over the default `https://api.elek.io`. An empty
 * or whitespace-only value counts as unset. A trailing slash is dropped,
 * since a path is appended to this.
 *
 * Something that is not a URL throws rather than falling back, because
 * falling back would send a report to production on the strength of a
 * typo in a staging setup.
 */
export function resolveCloudUrl(url?: string): string {
  const fromArg = url?.trim();
  const fromEnv = process.env['ELEK_IO_CLOUD_URL']?.trim();
  const candidate = fromArg || fromEnv || 'https://api.elek.io';
  // The same rule the option is validated by, rather than a second one
  const parsed =
    elekIoCoreOptionsSchema.shape.cloud.shape.url.safeParse(candidate);
  if (!parsed.success) {
    throw CoreError.badRequest(
      `ELEK_IO_CLOUD_URL must be a URL, got "${candidate}"`
    );
  }
  return parsed.data.replace(/\/+$/, '');
}

/**
 * Name of the marker file whose presence identifies a provisioned copy
 * of a Project. A dotfile, so the Project's gitignore covers it.
 */
export const PROVISIONED_MARKER = '.elek-provisioned';

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
    projectProvisionedMarker: (projectId: string): string => {
      return Path.join(pathTo.project(projectId), PROVISIONED_MARKER);
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
 * Whether a caught error is Node's "no such file or directory".
 *
 * `fs` reports a missing path with an `ENOENT` code rather than a type, so
 * this is the one place that knows the shape. Callers turn it into the
 * `NotFound` that `docs/error-handling.md` promises.
 */
export function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

/**
 * Returns all folders of given path to a directory
 */
export async function folders(path: string): Promise<Fs.Dirent[]> {
  const dirents = await Fs.readdir(path, { withFileTypes: true });
  return dirents.filter((dirent) => {
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
  const dirents = await Fs.readdir(path, { withFileTypes: true });
  return dirents.filter((dirent) => {
    if (extension && dirent.isFile() === true) {
      if (dirent.name.endsWith(extension)) {
        return true;
      }
      return false;
    }
    return dirent.isFile();
  });
}
