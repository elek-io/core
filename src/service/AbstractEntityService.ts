import Fs from 'fs-extra';
import { ResultAsync, errAsync } from 'neverthrow';
import { CoreErrors, type CoreError, type CoreResult } from '../util/shared.js';
import {
  fileReferenceSchema,
  objectTypeSchema,
  type ElekIoCoreOptions,
  type FileReference,
  type ObjectType,
  type ServiceType,
} from '../schema/index.js';
import { files, folders, isNotEmpty, pathTo } from '../util/node.js';
import { AbstractService } from './AbstractService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * A service for entities that are stored as files or folders on disk.
 * Provides listing of file and folder references.
 */
export abstract class AbstractEntityService extends AbstractService {
  protected readonly gitService: GitService;
  protected readonly jsonFileService: JsonFileService;

  protected constructor(
    type: ServiceType,
    options: ElekIoCoreOptions,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService
  ) {
    super(type, options, logService);
    this.gitService = gitService;
    this.jsonFileService = jsonFileService;
  }

  /**
   * Wraps an operation with automatic git rollback on failure.
   *
   * On error:
   * 1. Removes any files/dirs specified in `cleanupPaths` (for newly created files)
   * 2. Runs `git reset --hard HEAD` to restore the working tree
   * 3. Returns the original error
   *
   * @param projectPath  Path to the project's git repository
   * @param operation    The operation to execute (returns CoreResult)
   * @param cleanupPaths Optional paths to remove before git reset (for create operations)
   */
  protected withGitRollback<T>(
    projectPath: string,
    operation: () => CoreResult<T>,
    cleanupPaths?: string[]
  ): CoreResult<T> {
    return operation().orElse((originalError) =>
      ResultAsync.fromSafePromise(
        (async () => {
          for (const cleanupPath of cleanupPaths ?? []) {
            await Fs.remove(cleanupPath).catch((e: unknown) =>
              this.logService.error({
                source: 'core',
                message: `Failed to remove "${cleanupPath}" during rollback: ${e instanceof Error ? e.message : String(e)}`,
              })
            );
          }
          const resetResult = await this.gitService.reset(
            projectPath,
            'hard',
            'HEAD'
          );
          if (resetResult.isErr()) {
            this.logService.error({
              source: 'core',
              message: `Failed to reset working tree during rollback, manual git reset may be needed: ${resetResult.error.message}`,
            });
          }
          // Clear the JSON file cache since git reset restored files on disk
          // that may differ from what the cache holds
          this.jsonFileService.clearCache();
        })()
      ).andThen(() => errAsync<T, CoreError>(originalError))
    );
  }

  /**
   * Runs multiple CoreResult values, logs Err results, returns Ok values.
   */
  protected async collectResults<T>(
    results: CoreResult<T>[]
  ): Promise<T[]> {
    const settled = await Promise.all(results);
    const values: T[] = [];
    for (const r of settled) {
      if (r.isOk()) {
        values.push(r.value);
      } else {
        this.logService.warn({
          source: 'core',
          message: `collectResults: ${r.error.message}`,
          meta: { error: r.error },
        });
      }
    }
    return values;
  }

  /**
   * Returns a list of all file references of given project and type
   *
   * @param type File type of the references wanted
   * @param projectId Project to get all asset references from
   * @param collectionId Only needed when requesting files of type "Entry"
   */
  protected listReferences(
    type: ObjectType,
    projectId?: string,
    collectionId?: string
  ): CoreResult<FileReference[]> {
    switch (type) {
      case objectTypeSchema.enum.asset:
        if (!projectId) {
          return errAsync(
            CoreErrors.badRequest('Missing required parameter "projectId"')
          );
        }
        return this.getFileReferences(pathTo.lfs(projectId));

      case objectTypeSchema.enum.project:
        return this.getFolderReferences(pathTo.projects);

      case objectTypeSchema.enum.collection:
        if (!projectId) {
          return errAsync(
            CoreErrors.badRequest('Missing required parameter "projectId"')
          );
        }
        return this.getFolderReferences(pathTo.collections(projectId));

      case objectTypeSchema.enum.component:
        if (!projectId) {
          return errAsync(
            CoreErrors.badRequest('Missing required parameter "projectId"')
          );
        }
        return this.getFolderReferences(pathTo.components(projectId));

      case objectTypeSchema.enum.entry:
        if (!projectId) {
          return errAsync(
            CoreErrors.badRequest('Missing required parameter "projectId"')
          );
        }
        if (!collectionId) {
          return errAsync(
            CoreErrors.badRequest('Missing required parameter "collectionId"')
          );
        }
        return this.getFileReferences(
          pathTo.collection(projectId, collectionId)
        );

      default:
        return errAsync(
          CoreErrors.internal(
            `Trying to list files of unsupported type "${type}"`
          )
        );
    }
  }

  private getFolderReferences(path: string): CoreResult<FileReference[]> {
    return ResultAsync.fromPromise(
      folders(path),
      CoreErrors.fromUnknown
    ).map((possibleFolders) => {
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
        });

        return null;
      });

      return results.filter(isNotEmpty);
    });
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns them as FileReference
   *
   * Ignores files if the extension is not supported.
   */
  private getFileReferences(path: string): CoreResult<FileReference[]> {
    return ResultAsync.fromPromise(
      files(path),
      CoreErrors.fromUnknown
    ).map((possibleFiles) => {
      const results = possibleFiles.map((possibleFile) => {
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
        });

        return null;
      });

      return results.filter(isNotEmpty);
    });
  }
}
