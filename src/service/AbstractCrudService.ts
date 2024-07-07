import { RequiredParameterMissingError } from '../error/index.js';
import {
  fileReferenceSchema,
  gitCommitIconSchema,
  objectTypeSchema,
  type ElekIoCoreOptions,
  type FileReference,
  type ObjectType,
  type ServiceType,
  type SupportedAssetExtension,
  type SupportedLanguage,
} from '../schema/index.js';
import { files, folders, notEmpty, pathTo } from '../util/node.js';

/**
 * A base service that provides properties for most other services
 */
export abstract class AbstractCrudService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;

  /**
   * Dynamically generated git messages for operations
   */
  public readonly gitMessage: {
    create: string;
    update: string;
    delete: string;
  };

  /**
   * Do not instantiate directly as this is an abstract class
   */
  protected constructor(type: ServiceType, options: ElekIoCoreOptions) {
    this.type = type;
    this.options = options;
    this.gitMessage = {
      create: `${gitCommitIconSchema.enum.CREATE} Created ${this.type}`,
      update: `${gitCommitIconSchema.enum.UPDATE} Updated ${this.type}`,
      delete: `${gitCommitIconSchema.enum.DELETE} Deleted ${this.type}`,
    };
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
      case objectTypeSchema.Enum.asset:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFileReferences(pathTo.lfs(projectId)); // LFS folder is correct, since we want the extension of the file itself, not the AssetFile (.json)

      case objectTypeSchema.Enum.project:
        return this.getFolderReferences(pathTo.projects);

      case objectTypeSchema.Enum.collection:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFolderReferences(pathTo.collections(projectId));

      case objectTypeSchema.Enum.entry:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        if (!collectionId) {
          throw new RequiredParameterMissingError('collectionId');
        }
        return this.getFileReferences(
          pathTo.collection(projectId, collectionId)
        );

      case objectTypeSchema.Enum.sharedValue:
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
      } catch (error) {
        return null;
      }
    });

    return results.filter(notEmpty);
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns them as FileReference
   *
   * Ignores files not matching the [id].[language].[extension]
   * or [id].[extension] format for their names
   */
  private async getFileReferences(path: string): Promise<FileReference[]> {
    const possibleFiles = await files(path);

    const results = await Promise.all(
      possibleFiles.map(async (possibleFile) => {
        const fileNameArray = possibleFile.name.split('.');

        const fileReference: FileReference = {
          id: fileNameArray[0],
          language:
            fileNameArray.length === 3
              ? (fileNameArray[1] as SupportedLanguage)
              : undefined,
          extension:
            fileNameArray.length === 2
              ? (fileNameArray[1] as SupportedAssetExtension)
              : (fileNameArray[2] as SupportedAssetExtension),
        };

        try {
          return fileReferenceSchema.parse(fileReference);
        } catch (error) {
          return null;
        }
      })
    );

    return results.filter(notEmpty);
  }
}
