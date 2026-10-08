import Fs from 'fs-extra';
import { CoreError } from '../util/shared.js';
import {
  fileReferenceSchema,
  objectTypeSchema,
  projectFileSchema,
  type ElekIoCoreOptions,
  type FileReference,
  type ObjectType,
  type ProjectFile,
  type ProjectLanguages,
  type ServiceType,
  type Uuid,
} from '../schema/index.js';
import {
  files,
  folders,
  isFileNotFound,
  isNotEmpty,
  type PathTo,
} from '../util/node.js';
import { AbstractService } from './AbstractService.js';
import type { CacheService } from './CacheService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * The base every entity service extends, for entities stored as files or
 * folders on disk. It hands them three things:
 *
 * - git-backed writes that roll the working tree back when the body throws
 * - list reads that tolerate a single unreadable file rather than failing
 * - reference listing over a Project's folders
 */
export abstract class AbstractEntityService extends AbstractService {
  protected readonly gitService: GitService;
  protected readonly jsonFileService: JsonFileService;
  protected readonly cacheService: CacheService;

  protected constructor(
    type: ServiceType,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    cacheService: CacheService
  ) {
    super(type, options, pathTo, logService);
    this.gitService = gitService;
    this.jsonFileService = jsonFileService;
    this.cacheService = cacheService;
  }

  /**
   * Reads and parses `project.json`, through `JsonFileService`'s cache when
   * caching is on.
   *
   * A missing or schema-invalid file raises a raw fs error or a `ZodError`
   * here, becoming a `CoreError` only once the `validated()` boundary
   * converts it. So callers must not reach for this outside one.
   */
  protected async readProjectFile(projectId: Uuid): Promise<ProjectFile> {
    return this.jsonFileService.read(
      this.pathTo.projectFile(projectId),
      projectFileSchema
    );
  }

  /**
   * Returns the project's supported languages, used to build strict
   * entity schemas before `validated()` runs.
   */
  protected async readProjectLanguages(
    projectId: Uuid
  ): Promise<ProjectLanguages> {
    const projectFile = await this.readProjectFile(projectId);
    return projectFile.settings.language.supported;
  }

  /**
   * Runs an operation and, when it throws, removes every `cleanupPaths` entry
   * and resets the working tree before re-throwing the original error.
   *
   * The reset is `git reset --hard HEAD`, so it is repository wide and keeps
   * whatever the operation already committed. A body that has to be
   * all-or-nothing therefore makes exactly one commit. It also leaves
   * untracked files alone, which is what `cleanupPaths` is for.
   *
   * @see ../../contributing/error-handling-internals.md
   */
  protected async withGitRollback<T>(
    projectPath: string,
    operation: () => Promise<T>,
    cleanupPaths?: string[]
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      for (const cleanupPath of cleanupPaths ?? []) {
        await Fs.remove(cleanupPath).catch((e: unknown) =>
          this.logService.error({
            source: 'core',
            message: `Failed to remove "${cleanupPath}" during rollback: ${e instanceof Error ? e.message : String(e)}`,
            meta: {
              'file.path': cleanupPath,
              'exception.message': e instanceof Error ? e.message : String(e),
            },
          })
        );
      }
      try {
        // A hard reset restores files on disk and clears every cache
        // (handled centrally in GitService), so cached contents stay in sync
        await this.gitService.reset(projectPath, 'hard', 'HEAD');
      } catch (resetError) {
        this.logService.error({
          source: 'core',
          message: `Failed to reset working tree during rollback, manual git reset may be needed: ${resetError instanceof Error ? resetError.message : String(resetError)}`,
          meta: {
            'exception.message':
              resetError instanceof Error
                ? resetError.message
                : String(resetError),
          },
        });
        // The reset did not run to completion, so it could not clear the
        // caches itself. Drop them defensively since disk state is now uncertain
        this.cacheService.clear();
      }
      throw error;
    }
  }

  /**
   * Runs multiple promises, logs rejected results, returns fulfilled values.
   */
  protected async collectResults<T>(promises: Promise<T>[]): Promise<T[]> {
    const settled = await Promise.allSettled(promises);
    const values: T[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        values.push(r.value);
      } else {
        this.logService.warn({
          source: 'core',
          message: `collectResults: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
          meta: {
            'exception.message':
              r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
        });
      }
    }
    return values;
  }

  /**
   * Returns a list of all file references of given project and type
   *
   * Every type but `project` needs a `projectId`, and `entry` needs a
   * `collectionId` as well. A missing one throws `BadRequest`, an
   * unsupported type `Internal`, and a directory that is not there
   * `NotFound`.
   *
   * A file or folder whose name does not parse is warned about and dropped
   * rather than failing the list.
   */
  protected async listReferences(
    type: ObjectType,
    projectId?: string,
    collectionId?: string
  ): Promise<FileReference[]> {
    switch (type) {
      case objectTypeSchema.enum.asset:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        // Core writes a .gitkeep into every Project folder, so git
        // tracks it while it is still empty
        return this.getFileReferences(this.pathTo.assets(projectId), [
          '.gitkeep',
        ]);

      case objectTypeSchema.enum.project:
        return this.getFolderReferences(this.pathTo.projects);

      case objectTypeSchema.enum.collection:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        return this.getFolderReferences(this.pathTo.collections(projectId));

      case objectTypeSchema.enum.component:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        return this.getFolderReferences(this.pathTo.components(projectId));

      case objectTypeSchema.enum.entry:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        if (!collectionId) {
          throw CoreError.badRequest(
            'Missing required parameter "collectionId"'
          );
        }
        // Entries live in the Collection folder, next to the
        // Collection's own file
        return this.getFileReferences(
          this.pathTo.collection(projectId, collectionId),
          ['collection.json']
        );

      default:
        throw CoreError.internal(
          `Trying to list files of unsupported type "${type}"`
        );
    }
  }

  private async getFolderReferences(path: string): Promise<FileReference[]> {
    const possibleFolders = await folders(path).catch(notFoundIfMissing(path));
    const results = possibleFolders.map((possibleFolder) => {
      const parsed = fileReferenceSchema.safeParse({
        id: possibleFolder.name,
      });

      if (parsed.success) {
        return parsed.data;
      }

      this.logService.warn({
        source: 'core',
        message: `Function "getFolderReferences" is ignoring folder "${possibleFolder.name}" in "${path}" as it does not match the expected format`,
        meta: { 'file.name': possibleFolder.name, 'file.directory': path },
      });

      return null;
    });

    return results.filter(isNotEmpty);
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns them as FileReference
   *
   * Ignores files if the extension is not supported.
   *
   * @param ignore Names of the files Core writes into this folder
   * itself. They are never entities and are skipped silently, so a
   * consumer is not warned about files that are supposed to be there.
   * Everything else that does not parse is still warned about.
   */
  private async getFileReferences(
    path: string,
    ignore: string[]
  ): Promise<FileReference[]> {
    const possibleFiles = await files(path).catch(notFoundIfMissing(path));
    const results = possibleFiles.map((possibleFile) => {
      if (ignore.includes(possibleFile.name)) {
        return null;
      }

      const fileNameArray = possibleFile.name.split('.');

      const parsed = fileReferenceSchema.safeParse({
        id: fileNameArray[0],
        extension: fileNameArray[1],
      });

      if (parsed.success) {
        return parsed.data;
      }

      this.logService.warn({
        source: 'core',
        message: `Function "getFileReferences" is ignoring file "${possibleFile.name}" in "${path}" as it does not match the expected format`,
        meta: { 'file.name': possibleFile.name, 'file.directory': path },
      });

      return null;
    });

    return results.filter(isNotEmpty);
  }
}

/**
 * Turns a missing directory into the `NotFound` an absent entity answers
 * with, so listing the Entries of a Collection that is not there fails the
 * same way reading it does. Anything else a read of the directory raises is
 * a real failure and passes through.
 *
 * @see ../../docs/error-handling.md
 */
function notFoundIfMissing(path: string): (error: unknown) => never {
  return (error) => {
    if (isFileNotFound(error)) {
      throw CoreError.notFound(`Directory "${path}" does not exist`);
    }
    throw error;
  };
}
