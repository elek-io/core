import { RequiredParameterMissingError } from '../error/index.js';
import {
  fileReferenceSchema,
  objectTypeSchema,
  type FileReference,
  type ObjectType,
} from '../schema/index.js';
import { files, folders, isNotEmpty, pathTo } from '../util/node.js';
import { AbstractService } from './AbstractService.js';

/**
 * A service for entities that are stored as files or folders on disk.
 * Provides listing of file and folder references.
 */
export abstract class AbstractEntityService extends AbstractService {
  /**
   * Settles all promises and returns only the fulfilled values.
   * Logs a warning for each rejected promise.
   */
  protected async settleAndWarn<T>(
    promises: Promise<T>[]
  ): Promise<Awaited<T>[]> {
    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'rejected') {
        const error =
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason));
        this.logService.warn({
          source: 'core',
          message: `settleAndWarn: ${error.message}`,
          meta: { error },
        });
      }
    }
    return results
      .filter(
        (result): result is PromiseFulfilledResult<Awaited<T>> =>
          result.status === 'fulfilled'
      )
      .map((result) => result.value);
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
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFileReferences(pathTo.lfs(projectId)); // LFS folder is correct, since we want the extension of the file itself, not the AssetFile (.json)

      case objectTypeSchema.enum.project:
        return this.getFolderReferences(pathTo.projects);

      case objectTypeSchema.enum.collection:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFolderReferences(pathTo.collections(projectId));

      case objectTypeSchema.enum.component:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFolderReferences(pathTo.components(projectId));

      case objectTypeSchema.enum.entry:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        if (!collectionId) {
          throw new RequiredParameterMissingError('collectionId');
        }
        return this.getFileReferences(
          pathTo.collection(projectId, collectionId)
        );

      default:
        throw new Error(`Trying to list files of unsupported type "${type}"`);
    }
  }

  private async getFolderReferences(path: string): Promise<FileReference[]> {
    const possibleFolders = await folders(path);

    const results = possibleFolders.map((possibleFolder) => {
      const folderReference: FileReference = {
        id: possibleFolder.name,
      };

      try {
        return fileReferenceSchema.parse(folderReference);
      } catch {
        this.logService.warn({
          source: 'core',
          message: `Function "getFolderReferences" is ignoring folder "${possibleFolder.name}" in "${path}" as it does not match the expected format`,
        });

        return null;
      }
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

      const fileReference = {
        id: fileNameArray[0],
        extension: fileNameArray[1],
      };

      try {
        return fileReferenceSchema.parse(fileReference);
      } catch {
        this.logService.warn({
          source: 'core',
          message: `Function "getFileReferences" is ignoring file "${possibleFile.name}" in "${path}" as it does not match the expected format`,
        });

        return null;
      }
    });

    return results.filter(isNotEmpty);
  }
}
