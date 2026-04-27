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
   * Reads and parses the project file for the given project id.
   */
  protected async readProjectFile(projectId: Uuid): Promise<ProjectFile> {
    return this.jsonFileService.read(
      pathTo.projectFile(projectId),
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
   * Wraps an operation with automatic git rollback on failure.
   *
   * On error:
   * 1. Removes any files/dirs specified in `cleanupPaths` (for newly created files)
   * 2. Runs `git reset --hard HEAD` to restore the working tree
   * 3. Re-throws the original error
   *
   * @param projectPath  Path to the project's git repository
   * @param operation    The async operation to execute
   * @param cleanupPaths Optional paths to remove before git reset (for create operations)
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
          })
        );
      }
      try {
        await this.gitService.reset(projectPath, 'hard', 'HEAD');
      } catch (resetError) {
        this.logService.error({
          source: 'core',
          message: `Failed to reset working tree during rollback, manual git reset may be needed: ${resetError instanceof Error ? resetError.message : String(resetError)}`,
        });
      }
      // Clear the JSON file cache since git reset restored files on disk
      // that may differ from what the cache holds
      this.jsonFileService.clearCache();
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
            error:
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
   * @param type File type of the references wanted
   * @param projectId Project to get all asset references from
   * @param collectionId Only needed when requesting files of type "Entry"
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
        return this.getFileReferences(pathTo.lfs(projectId));

      case objectTypeSchema.enum.project:
        return this.getFolderReferences(pathTo.projects);

      case objectTypeSchema.enum.collection:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        return this.getFolderReferences(pathTo.collections(projectId));

      case objectTypeSchema.enum.component:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        return this.getFolderReferences(pathTo.components(projectId));

      case objectTypeSchema.enum.entry:
        if (!projectId) {
          throw CoreError.badRequest('Missing required parameter "projectId"');
        }
        if (!collectionId) {
          throw CoreError.badRequest(
            'Missing required parameter "collectionId"'
          );
        }
        return this.getFileReferences(
          pathTo.collection(projectId, collectionId)
        );

      default:
        throw CoreError.internal(
          `Trying to list files of unsupported type "${type}"`
        );
    }
  }

  private async getFolderReferences(path: string): Promise<FileReference[]> {
    const possibleFolders = await folders(path);
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
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns them as FileReference
   *
   * Ignores files if the extension is not supported.
   */
  private async getFileReferences(path: string): Promise<FileReference[]> {
    const possibleFiles = await files(path);
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
  }
}
