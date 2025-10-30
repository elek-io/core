import Fs from 'fs-extra';
import mime from 'mime';
import type {
  SaveAssetProps} from '../schema/index.js';
import {
  assetFileSchema,
  assetSchema,
  countAssetsSchema,
  createAssetSchema,
  deleteAssetSchema,
  listAssetsSchema,
  objectTypeSchema,
  readAssetSchema,
  saveAssetSchema,
  serviceTypeSchema,
  updateAssetSchema,
  type Asset,
  type AssetFile,
  type BaseFile,
  type CountAssetsProps,
  type CreateAssetProps,
  type CrudServiceWithListCount,
  type DeleteAssetProps,
  type ElekIoCoreOptions,
  type ListAssetsProps,
  type PaginatedList,
  type ReadAssetProps,
  type UpdateAssetProps,
} from '../schema/index.js';
import { pathTo } from '../util/node.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Asset files on disk
 */
export class AssetService
  extends AbstractCrudService
  implements CrudServiceWithListCount<Asset>
{
  private readonly jsonFileService: JsonFileService;
  private readonly gitService: GitService;

  constructor(
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.enum.Asset, options, logService);

    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new Asset
   */
  public async create(props: CreateAssetProps): Promise<Asset> {
    createAssetSchema.parse(props);

    const id = uuid();
    const projectPath = pathTo.project(props.projectId);
    const fileType = this.getFileType(props.filePath);
    const size = await this.getFileSize(props.filePath);
    const assetPath = pathTo.asset(props.projectId, id, fileType.extension);
    const assetFilePath = pathTo.assetFile(props.projectId, id);

    const assetFile: AssetFile = {
      ...props,
      name: slug(props.name),
      objectType: 'asset',
      id,
      created: datetime(),
      updated: null,
      extension: fileType.extension,
      mimeType: fileType.mimeType,
      size,
    };

    try {
      await Fs.copyFile(props.filePath, assetPath);
      await this.jsonFileService.create(
        assetFile,
        assetFilePath,
        assetFileSchema
      );
    } catch (error) {
      // To avoid partial data being added to the repository / git status reporting uncommitted files
      await this.delete({ ...assetFile, projectId: props.projectId });
      throw error;
    }

    await this.gitService.add(projectPath, [assetFilePath, assetPath]);
    await this.gitService.commit(projectPath, {
      method: 'create',
      reference: { objectType: 'asset', id },
    });

    return this.toAsset(props.projectId, assetFile);
  }

  /**
   * Returns an Asset by ID
   *
   * If a commit hash is provided, the Asset is read from history
   */
  public async read(props: ReadAssetProps): Promise<Asset> {
    readAssetSchema.parse(props);

    if (!props.commitHash) {
      const assetFile = await this.jsonFileService.read(
        pathTo.assetFile(props.projectId, props.id),
        assetFileSchema
      );

      return this.toAsset(props.projectId, assetFile);
    } else {
      const assetFile = this.migrate(
        JSON.parse(
          await this.gitService.getFileContentAtCommit(
            pathTo.project(props.projectId),
            pathTo.assetFile(props.projectId, props.id),
            props.commitHash
          )
        )
      );

      const assetBlob = await this.gitService.getFileContentAtCommit(
        pathTo.project(props.projectId),
        pathTo.asset(props.projectId, props.id, assetFile.extension),
        props.commitHash,
        'binary'
      );
      await Fs.writeFile(
        pathTo.tmpAsset(assetFile.id, props.commitHash, assetFile.extension),
        assetBlob,
        'binary'
      );

      return this.toAsset(props.projectId, assetFile, props.commitHash);
    }
  }

  /**
   * Copies an Asset to given file path on disk
   */
  public async save(props: SaveAssetProps) {
    saveAssetSchema.parse(props);

    const asset = await this.read(props);
    await Fs.copyFile(asset.absolutePath, props.filePath);
  }

  /**
   * Updates given Asset
   *
   * Use the optional "newFilePath" prop to update the Asset itself
   */
  public async update(props: UpdateAssetProps): Promise<Asset> {
    updateAssetSchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const assetFilePath = pathTo.assetFile(props.projectId, props.id);
    const prevAssetFile = await this.read(props);

    // Overwrite old data with new
    // It's ok to have projectId inside props, since the prevAssetFile is read with the same data
    const assetFile: AssetFile = {
      ...prevAssetFile,
      ...props,
      name: slug(props.name),
      updated: datetime(),
    };

    if (props.newFilePath) {
      // Overwrite the file itself (in LFS folder)...

      const fileType = this.getFileType(props.newFilePath);
      const size = await this.getFileSize(props.newFilePath);
      const prevAssetPath = pathTo.asset(
        props.projectId,
        props.id,
        prevAssetFile.extension
      );
      const assetPath = pathTo.asset(
        props.projectId,
        props.id,
        fileType.extension
      );

      // @todo use try catch to handle FS error and restore previous state
      await Fs.remove(prevAssetPath); // Need to explicitly remove old Asset, because it could have a different extension
      await Fs.copyFile(props.newFilePath, assetPath);
      await this.gitService.add(projectPath, [prevAssetPath, assetPath]);

      // ...and update meta information
      assetFile.extension = fileType.extension;
      assetFile.mimeType = fileType.mimeType;
      assetFile.size = size;
    }

    await this.jsonFileService.update(
      assetFile,
      assetFilePath,
      assetFileSchema
    );
    await this.gitService.add(projectPath, [assetFilePath]);
    await this.gitService.commit(projectPath, {
      method: 'update',
      reference: { objectType: 'asset', id: assetFile.id },
    });

    return this.toAsset(props.projectId, assetFile);
  }

  /**
   * Deletes given Asset
   */
  public async delete(props: DeleteAssetProps): Promise<void> {
    deleteAssetSchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const assetFilePath = pathTo.assetFile(props.projectId, props.id);
    const assetPath = pathTo.asset(props.projectId, props.id, props.extension);
    await Fs.remove(assetPath);
    await Fs.remove(assetFilePath);
    await this.gitService.add(projectPath, [assetFilePath, assetPath]);
    await this.gitService.commit(projectPath, {
      method: 'delete',
      reference: { objectType: 'asset', id: props.id },
    });
  }

  public async list(props: ListAssetsProps): Promise<PaginatedList<Asset>> {
    listAssetsSchema.parse(props);

    const offset = props.offset || 0;
    const limit = props.limit || 15;

    const assetReferences = await this.listReferences(
      objectTypeSchema.enum.asset,
      props.projectId
    );

    const partialAssetReferences = assetReferences.slice(offset, limit);

    const assets = await this.returnResolved(
      partialAssetReferences.map((assetReference) => {
        return this.read({
          projectId: props.projectId,
          id: assetReference.id,
        });
      })
    );

    return {
      total: assetReferences.length,
      limit,
      offset,
      list: assets,
    };
  }

  public async count(props: CountAssetsProps): Promise<number> {
    countAssetsSchema.parse(props);

    const count = (
      await this.listReferences(objectTypeSchema.enum.asset, props.projectId)
    ).length;

    return count;
  }

  /**
   * Checks if given object is of type Asset
   */
  public isAsset(obj: BaseFile | unknown): obj is Asset {
    return assetSchema.safeParse(obj).success;
  }

  /**
   * Returns the size of an file in bytes
   *
   * @param path Path of the file to get the size from
   */
  private async getFileSize(path: string) {
    return (await Fs.stat(path)).size;
  }

  /**
   * Creates an Asset from given AssetFile
   *
   * @param projectId   The project's ID
   * @param assetFile   The AssetFile to convert
   */
  private async toAsset(
    projectId: string,
    assetFile: AssetFile,
    commitHash?: string
  ): Promise<Asset> {
    const assetPath = commitHash
      ? pathTo.tmpAsset(assetFile.id, commitHash, assetFile.extension)
      : pathTo.asset(projectId, assetFile.id, assetFile.extension);

    const history = await this.gitService.log(pathTo.project(projectId), {
      filePath: pathTo.assetFile(projectId, assetFile.id),
    });

    const asset: Asset = {
      ...assetFile,
      absolutePath: assetPath,
      history,
    };

    return asset;
  }

  /**
   * Returns the found and supported extension as well as mime type,
   * otherwise throws an error
   *
   * @param filePath Path to the file to check
   */
  private getFileType(filePath: string) {
    const mimeType = mime.getType(filePath);

    if (mimeType === null) {
      throw new Error(`Unsupported MIME type of file "${filePath}"`);
    }

    const extension = mime.getExtension(mimeType);

    if (extension === null) {
      throw new Error(
        `Unsupported extension for MIME type "${mimeType}" of file "${filePath}"`
      );
    }

    return {
      extension,
      mimeType,
    };
  }

  /**
   * Migrates an potentially outdated Asset file to the current schema
   */
  public migrate(potentiallyOutdatedAssetFile: unknown) {
    // @todo

    return assetFileSchema.parse(potentiallyOutdatedAssetFile);
  }
}
