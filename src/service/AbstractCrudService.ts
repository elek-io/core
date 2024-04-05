import {
  fileReferenceSchema,
  gitCommitIconSchema,
  objectTypeSchema,
  type BaseFile,
  type ElekIoCoreOptions,
  type FileReference,
  type GitTag,
  type ObjectType,
  type PaginatedList,
  type ServiceType,
  type Sort,
  type SupportedAssetExtension,
  type SupportedLanguage,
} from '@elek-io/shared';
import { orderBy, remove } from 'lodash-es';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError.js';
import * as CoreUtil from '../util/index.js';

/**
 * A base service that provides properties for most other services
 */
export default abstract class AbstractCrudService {
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
   * Returns the filtered, sorted and paginated version of given list
   *
   * @todo Sorting and filtering requires all models to be loaded
   * from disk. This results in a huge memory spike before the
   * filtering and pagination takes effect - removing most of it again.
   * This approach is still better than returning everything and
   * letting the frontend handle it, since the memory usage would then be constant.
   * But this still could fill the memory limit of node.js (default 1,4 GB).
   *
   * @param list Array to filter, sort and paginate
   * @param sort Array of sort objects containing information about what to sort and how
   * @param filter Filter all object values of `list` by this string
   * @param limit Limit the result to this amount. If 0 is given, no limit is applied
   * @param offset Start at this index instead of 0
   */
  protected async paginate<T extends BaseFile | GitTag>(
    list: T[],
    sort: Sort<T>[] = [],
    filter = '',
    limit = 15,
    offset = 0
  ): Promise<PaginatedList<T>> {
    let result = list;
    const total = list.length;
    const normalizedFilter = filter.trim().toLowerCase();

    // Filter
    if (normalizedFilter !== '') {
      remove(result, (model) => {
        let key: keyof T;
        for (key in model) {
          const value = model[key];
          if (String(value).toLowerCase().includes(normalizedFilter)) {
            return false;
          }
        }
        return true;
      });
    }

    // Sort
    if (sort.length !== 0) {
      const keys = sort.map((value) => value.by);
      const orders = sort.map((value) => value.order);
      result = orderBy(result, keys, orders);
    }

    // Paginate
    if (limit !== 0) {
      result = result.slice(offset, offset + limit);
    }

    return {
      total,
      limit,
      offset,
      list: result,
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
        return this.getFileReferences(CoreUtil.pathTo.lfs(projectId)); // LFS folder is correct, since we want the extension of the file itself, not the AssetFile (.json)

      case objectTypeSchema.Enum.project:
        return this.getFolderReferences(CoreUtil.pathTo.projects);

      case objectTypeSchema.Enum.collection:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFolderReferences(CoreUtil.pathTo.collections(projectId));

      case objectTypeSchema.Enum.entry:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        if (!collectionId) {
          throw new RequiredParameterMissingError('collectionId');
        }
        return this.getFileReferences(
          CoreUtil.pathTo.collection(projectId, collectionId)
        );

      case objectTypeSchema.Enum.sharedValue:
        if (!projectId) {
          throw new RequiredParameterMissingError('projectId');
        }
        return this.getFileReferences(CoreUtil.pathTo.sharedValues(projectId));

      default:
        throw new Error(`Trying to list files of unsupported type "${type}"`);
    }
  }

  private async getFolderReferences(path: string): Promise<FileReference[]> {
    const possibleFolders = await CoreUtil.folders(path);
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

    return results.filter(CoreUtil.notEmpty);
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns them as FileReference
   *
   * Ignores files not matching the [id].[language].[extension]
   * or [id].[extension] format for their names
   */
  private async getFileReferences(path: string): Promise<FileReference[]> {
    const possibleFiles = await CoreUtil.files(path);

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

    return results.filter(CoreUtil.notEmpty);
  }
}
