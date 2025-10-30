import { RequiredParameterMissingError } from '../error/index.js';
import {
  fileReferenceSchema,
  objectTypeSchema,
  type ElekIoCoreOptions,
  type FileReference,
  type ObjectType,
  type ServiceType,
} from '../schema/index.js';
import { files, folders, isNoError, notEmpty, pathTo } from '../util/node.js';
import type { LogService } from './LogService.js';

/**
 * A base service that provides properties for most other services
 */
export abstract class AbstractCrudService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;
  protected readonly logService: LogService;

  /**
   * Do not instantiate directly as this is an abstract class
   */
  protected constructor(
    type: ServiceType,
    options: ElekIoCoreOptions,
    logService: LogService
  ) {
    this.type = type;
    this.options = options;
    this.logService = logService;
  }

  /**
   * Basically a Promise.all() without rejecting if one promise fails to resolve
   */
  protected async returnResolved<T>(promises: Promise<T>[]) {
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
            this.logService.warn(
              `[returnResolved] Catched error while resolving promise: ${error}`
            );
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
    //                >       |        <
    return checked.filter(isNoError);
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

      case objectTypeSchema.enum.sharedValue:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFileReferences(pathTo.sharedValues(projectId));

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
        this.logService.warn(
          `[getFolderReferences] Ignoring folder "${possibleFolder.name}" in "${path}" as it does not match the expected format`
        );
        return null;
      }
    });

    return results.filter(notEmpty);
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns them as FileReference
   *
   * Ignores files if the extension is not supported.
   */
  private async getFileReferences(path: string): Promise<FileReference[]> {
    const possibleFiles = await files(path);

    const results = await Promise.all(
      possibleFiles.map(async (possibleFile) => {
        const fileNameArray = possibleFile.name.split('.');

        const fileReference = {
          id: fileNameArray[0],
          extension: fileNameArray[1],
        };

        try {
          return fileReferenceSchema.parse(fileReference);
        } catch {
          this.logService.warn(
            `[getFileReferences] Ignoring file "${possibleFile.name}" in "${path}" as it does not match the expected format`
          );
          return null;
        }
      })
    );

    return results.filter(notEmpty);
  }
}
