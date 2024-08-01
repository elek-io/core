import { fileTypeFromFile } from 'file-type';
import Fs from 'fs-extra';
import isSvg from 'is-svg';
import {
  assetFileSchema,
  assetSchema,
  countAssetsSchema,
  createAssetSchema,
  deleteAssetSchema,
  listAssetsSchema,
  objectTypeSchema,
  readAssetSchema,
  serviceTypeSchema,
  supportedAssetExtensionSchema,
  supportedAssetMimeTypeSchema,
  supportedAssetTypeSchema,
  updateAssetSchema,
  type Asset,
  type AssetFile,
  type BaseFile,
  type CountAssetsProps,
  type CreateAssetProps,
  type DeleteAssetProps,
  type ElekIoCoreOptions,
  type ExtendedCrudService,
  type ListAssetsProps,
  type PaginatedList,
  type ReadAssetProps,
  type UpdateAssetProps,
} from '../schema/index.js';
import { pathTo, returnResolved } from '../util/node.js';
import { datetime, uuid } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import type { GitService } from './GitService.js';
import { JsonFileService } from './JsonFileService.js';

/**
 * Service that manages CRUD functionality for Asset files on disk
 */
export class AssetService
  extends AbstractCrudService
  implements ExtendedCrudService<Asset>
{
  private readonly jsonFileService: JsonFileService;
  private readonly gitService: GitService;

  constructor(
    options: ElekIoCoreOptions,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.Enum.Asset, options);

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
    const fileType = await this.getSupportedFileTypeOrThrow(props.filePath);
    const size = await this.getAssetSize(props.filePath);
    const assetPath = pathTo.asset(props.projectId, id, fileType.extension);
    const assetFilePath = pathTo.assetFile(props.projectId, id);

    const assetFile: AssetFile = {
      ...props,
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
    await this.gitService.commit(projectPath, this.gitMessage.create);

    return this.toAsset(props.projectId, assetFile);
  }

  /**
   * Returns an Asset by ID
   */
  public async read(props: ReadAssetProps): Promise<Asset> {
    readAssetSchema.parse(props);

    const assetFile = await this.jsonFileService.read(
      pathTo.assetFile(props.projectId, props.id),
      assetFileSchema
    );

    return this.toAsset(props.projectId, assetFile);
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
      updated: datetime(),
    };

    if (props.newFilePath) {
      // Overwrite the file itself (in LFS folder)...

      const fileType = await this.getSupportedFileTypeOrThrow(
        props.newFilePath
      );
      const size = await this.getAssetSize(props.newFilePath);
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
    await this.gitService.commit(projectPath, this.gitMessage.update);

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
    await this.gitService.commit(projectPath, this.gitMessage.delete);
  }

  public async list(props: ListAssetsProps): Promise<PaginatedList<Asset>> {
    listAssetsSchema.parse(props);

    const offset = props.offset || 0;
    const limit = props.limit || 15;

    const assetReferences = await this.listReferences(
      objectTypeSchema.Enum.asset,
      props.projectId
    );

    const partialAssetReferences = assetReferences.slice(offset, limit);

    const assets = await returnResolved(
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
      await this.listReferences(objectTypeSchema.Enum.asset, props.projectId)
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
   * Returns the size of an Asset in bytes
   *
   * @param path Path of the Asset to get the size from
   */
  private async getAssetSize(path: string) {
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
    assetFile: AssetFile
  ): Promise<Asset> {
    const assetPath = pathTo.asset(
      projectId,
      assetFile.id,
      assetFile.extension
    );

    const asset: Asset = {
      ...assetFile,
      absolutePath: assetPath,
    };

    return asset;
  }

  /**
   * Returns the found and supported extension as well as mime type,
   * otherwise throws an error
   *
   * @param filePath Path to the file to check
   */
  private async getSupportedFileTypeOrThrow(filePath: string) {
    const fileSize = (await Fs.stat(filePath)).size;

    // Only try to parse potential SVG's
    // that are smaller than 500 kB
    if (fileSize / 1000 <= 500) {
      const fileBuffer = await Fs.readFile(filePath);
      if (isSvg(fileBuffer.toString()) === true) {
        return {
          extension: supportedAssetExtensionSchema.Enum.svg,
          mimeType: supportedAssetMimeTypeSchema.Enum['image/svg+xml'],
        };
      }
    }

    // We do not use fileBuffer here again because fromFile() is recommended
    // @see https://www.npmjs.com/package/file-type#filetypefrombufferbuffer
    const fileType = await fileTypeFromFile(filePath);

    const result = supportedAssetTypeSchema.parse({
      extension: fileType?.ext,
      mimeType: fileType?.mime,
    });

    return result;
  }
}
