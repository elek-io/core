import Fs from 'fs-extra';
import mime from 'mime';
import type { SaveAssetProps } from '../schema/index.js';
import {
  assetFileSchema,
  assetSchema,
  migrateAssetSchema,
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
  type CountAssetsProps,
  type CreateAssetProps,
  type CrudServiceWithListCount,
  type DeleteAssetProps,
  type ElekIoCoreOptions,
  type ListAssetsProps,
  type PaginatedList,
  type ReadAssetProps,
  type UpdateAssetProps,
  type AssetHistoryProps,
  type GitCommit,
  assetHistorySchema,
} from '../schema/index.js';
import { applyMigrations, assetMigrations } from './migrations/index.js';
import { pathTo } from '../util/node.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Asset files on disk
 */
export class AssetService
  extends AbstractEntityService
  implements CrudServiceWithListCount<Asset>
{
  private readonly coreVersion: string;
  private readonly jsonFileService: JsonFileService;
  private readonly gitService: GitService;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.enum.Asset, options, logService);

    this.coreVersion = coreVersion;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new Asset
   */
  public async create(props: CreateAssetProps): Promise<Asset> {
    const validatedProps = createAssetSchema.parse(props);

    const id = uuid();
    const projectPath = pathTo.project(validatedProps.projectId);
    const fileType = this.getFileType(validatedProps.filePath);
    const size = await this.getFileSize(validatedProps.filePath);
    const assetPath = pathTo.asset(
      validatedProps.projectId,
      id,
      fileType.extension
    );
    const assetFilePath = pathTo.assetFile(validatedProps.projectId, id);

    const { projectId: _, filePath: __, ...validatedAssetProps } = validatedProps;
    const assetFile: AssetFile = {
      ...validatedAssetProps,
      name: slug(validatedProps.name),
      objectType: 'asset',
      id,
      coreVersion: this.coreVersion,
      created: datetime(),
      updated: null,
      extension: fileType.extension,
      mimeType: fileType.mimeType,
      size,
    };

    try {
      await Fs.copyFile(validatedProps.filePath, assetPath);
      await this.jsonFileService.create(
        assetFile,
        assetFilePath,
        assetFileSchema
      );
    } catch (error) {
      // To avoid partial data being added to the repository / git status reporting uncommitted files
      await this.delete({ ...assetFile, projectId: validatedProps.projectId });
      throw error;
    }

    await this.gitService.add(projectPath, [assetFilePath, assetPath]);
    await this.gitService.commit(projectPath, {
      method: 'create',
      reference: { objectType: 'asset', id },
    });

    return this.toAsset(validatedProps.projectId, assetFile);
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
   * Returns the commit history of an Asset
   */
  public async history(props: AssetHistoryProps): Promise<GitCommit[]> {
    assetHistorySchema.parse(props);

    return this.gitService.log(pathTo.project(props.projectId), {
      filePath: pathTo.assetFile(props.projectId, props.id),
    });
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
    const validatedProps = updateAssetSchema.parse(props);

    const projectPath = pathTo.project(validatedProps.projectId);
    const assetFilePath = pathTo.assetFile(
      validatedProps.projectId,
      validatedProps.id
    );
    const prevAssetFile = await this.read(validatedProps);

    const {
      projectId: _,
      newFilePath: __,
      ...validatedUpdateProps
    } = validatedProps;
    const assetFile: AssetFile = {
      ...prevAssetFile,
      ...validatedUpdateProps,
      name: slug(validatedProps.name),
      updated: datetime(),
    };

    if (validatedProps.newFilePath) {
      // Overwrite the file itself (in LFS folder)...

      const fileType = this.getFileType(validatedProps.newFilePath);
      const size = await this.getFileSize(validatedProps.newFilePath);
      const prevAssetPath = pathTo.asset(
        validatedProps.projectId,
        validatedProps.id,
        prevAssetFile.extension
      );
      const assetPath = pathTo.asset(
        validatedProps.projectId,
        validatedProps.id,
        fileType.extension
      );

      // @todo use try catch to handle FS error and restore previous state
      await Fs.remove(prevAssetPath); // Need to explicitly remove old Asset, because it could have a different extension
      await Fs.copyFile(validatedProps.newFilePath, assetPath);
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

    return this.toAsset(validatedProps.projectId, assetFile);
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
    const limit = props.limit ?? 15;

    const assetReferences = await this.listReferences(
      objectTypeSchema.enum.asset,
      props.projectId
    );

    const partialAssetReferences =
      limit === 0
        ? assetReferences.slice(offset)
        : assetReferences.slice(offset, offset + limit);

    const assets = await this.settleAndWarn(
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
  public isAsset(obj: unknown): obj is Asset {
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
  private toAsset(
    projectId: string,
    assetFile: AssetFile,
    commitHash?: string
  ): Asset {
    const assetPath = commitHash
      ? pathTo.tmpAsset(assetFile.id, commitHash, assetFile.extension)
      : pathTo.asset(projectId, assetFile.id, assetFile.extension);

    return {
      ...assetFile,
      absolutePath: assetPath,
    };
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
    const loose = migrateAssetSchema.parse(potentiallyOutdatedAssetFile);
    const migrated = applyMigrations(loose, assetMigrations, this.coreVersion);
    return assetFileSchema.parse(migrated);
  }
}
