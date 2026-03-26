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
import {
  datetime,
  slug,
  uuid,
  CoreErrors,
  parseSchema,
  ResultAsync,
  errAsync,
  ok,
  err,
  type CoreError,
  type CoreResult,
  type Result,
} from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Asset files on disk
 */
export class AssetService extends AbstractEntityService {
  private readonly coreVersion: string;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.enum.Asset, options, logService, gitService, jsonFileService);

    this.coreVersion = coreVersion;
  }

  /**
   * Creates a new Asset
   */
  public create(props: CreateAssetProps): CoreResult<Asset> {
    const validated = parseSchema(createAssetSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }
    const validatedProps = validated.value;

    const id = uuid();
    const projectPath = pathTo.project(validatedProps.projectId);
    const fileTypeResult = this.getFileType(validatedProps.filePath);
    if (fileTypeResult.isErr()) {
      return errAsync(fileTypeResult.error);
    }
    const fileType = fileTypeResult.value;

    const assetPath = pathTo.asset(
      validatedProps.projectId,
      id,
      fileType.extension
    );
    const assetFilePath = pathTo.assetFile(validatedProps.projectId, id);

    const {
      projectId: _,
      filePath: __,
      ...validatedAssetProps
    } = validatedProps;

    const result = this.getFileSize(validatedProps.filePath).andThen((size) => {
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

      return this.withGitRollback(
        projectPath,
        () =>
          ResultAsync.fromPromise(Fs.copyFile(validatedProps.filePath, assetPath), CoreErrors.fromUnknown)
            .andThen(() => this.jsonFileService.create(assetFile, assetFilePath, assetFileSchema))
            .andThen(() => this.gitService.add(projectPath, [assetFilePath, assetPath]))
            .andThen(() =>
              this.gitService.commit(projectPath, {
                method: 'create',
                reference: { objectType: 'asset', id },
              })
            )
            .map(() => this.toAsset(validatedProps.projectId, assetFile)),
        [assetPath, assetFilePath]
      );
    });

    return this.logged('create', result);
  }

  /**
   * Returns an Asset by ID
   *
   * If a commit hash is provided, the Asset is read from history
   */
  public read(props: ReadAssetProps): CoreResult<Asset> {
    const validated = parseSchema(readAssetSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    if (!props.commitHash) {
      const result = this.jsonFileService
        .read(pathTo.assetFile(props.projectId, props.id), assetFileSchema)
        .map((assetFile) => this.toAsset(props.projectId, assetFile));

      return this.logged('read', result);
    } else {
      const result = this.gitService
        .getFileContentAtCommit(
          pathTo.project(props.projectId),
          pathTo.assetFile(props.projectId, props.id),
          props.commitHash
        )
        .andThen((content) => {
          const assetFile = this.migrate(JSON.parse(content));
          return this.gitService
            .getFileContentAtCommit(
              pathTo.project(props.projectId),
              pathTo.asset(props.projectId, props.id, assetFile.extension),
              props.commitHash!,
              'binary'
            )
            .andThen((blob) =>
              ResultAsync.fromPromise(
                Fs.writeFile(
                  pathTo.tmpAsset(assetFile.id, props.commitHash!, assetFile.extension),
                  blob,
                  'binary'
                ),
                CoreErrors.fromUnknown
              ).map(() => this.toAsset(props.projectId, assetFile, props.commitHash))
            );
        });

      return this.logged('read', result);
    }
  }

  /**
   * Returns the commit history of an Asset
   */
  public history(props: AssetHistoryProps): CoreResult<GitCommit[]> {
    const validated = parseSchema(assetHistorySchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const result = this.gitService.log(pathTo.project(props.projectId), {
      filePath: pathTo.assetFile(props.projectId, props.id),
    });

    return this.logged('history', result);
  }

  /**
   * Copies an Asset to given file path on disk
   */
  public save(props: SaveAssetProps): CoreResult<void> {
    const validated = parseSchema(saveAssetSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const result = this.read(props).andThen((asset) =>
      ResultAsync.fromPromise(
        Fs.copyFile(asset.absolutePath, props.filePath),
        CoreErrors.fromUnknown
      )
    );

    return this.logged('save', result);
  }

  /**
   * Updates given Asset
   *
   * Use the optional "newFilePath" prop to update the Asset itself
   */
  public update(props: UpdateAssetProps): CoreResult<Asset> {
    const validated = parseSchema(updateAssetSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }
    const validatedProps = validated.value;

    const projectPath = pathTo.project(validatedProps.projectId);
    const assetFilePath = pathTo.assetFile(
      validatedProps.projectId,
      validatedProps.id
    );

    const result = this.read(validatedProps).andThen((prevAsset) => {
      const {
        projectId: _,
        newFilePath: __,
        ...validatedUpdateProps
      } = validatedProps;
      const assetFile: AssetFile = {
        ...prevAsset,
        ...validatedUpdateProps,
        name: slug(validatedProps.name),
        updated: datetime(),
      };

      return this.withGitRollback(projectPath, () => {
        if (validatedProps.newFilePath) {
          const fileTypeResult = this.getFileType(validatedProps.newFilePath);
          if (fileTypeResult.isErr()) {
            return errAsync<Asset, CoreError>(fileTypeResult.error);
          }
          const fileType = fileTypeResult.value;

          const prevAssetPath = pathTo.asset(
            validatedProps.projectId,
            validatedProps.id,
            prevAsset.extension
          );
          const assetPath = pathTo.asset(
            validatedProps.projectId,
            validatedProps.id,
            fileType.extension
          );

          return this.getFileSize(validatedProps.newFilePath).andThen((size) => {
            assetFile.extension = fileType.extension;
            assetFile.mimeType = fileType.mimeType;
            assetFile.size = size;

            return ResultAsync.fromPromise(Fs.copyFile(validatedProps.newFilePath!, assetPath), CoreErrors.fromUnknown)
              .andThen(() =>
                ResultAsync.fromPromise(Fs.remove(prevAssetPath), CoreErrors.fromUnknown)
              )
              .andThen(() => this.gitService.add(projectPath, [prevAssetPath, assetPath]))
              .andThen(() =>
                this.jsonFileService.update(assetFile, assetFilePath, assetFileSchema)
              )
              .andThen(() => this.gitService.add(projectPath, [assetFilePath]))
              .andThen(() =>
                this.gitService.commit(projectPath, {
                  method: 'update',
                  reference: { objectType: 'asset', id: assetFile.id },
                })
              )
              .map(() => this.toAsset(validatedProps.projectId, assetFile));
          });
        }

        return this.jsonFileService
          .update(assetFile, assetFilePath, assetFileSchema)
          .andThen(() => this.gitService.add(projectPath, [assetFilePath]))
          .andThen(() =>
            this.gitService.commit(projectPath, {
              method: 'update',
              reference: { objectType: 'asset', id: assetFile.id },
            })
          )
          .map(() => this.toAsset(validatedProps.projectId, assetFile));
      });
    });

    return this.logged('update', result);
  }

  /**
   * Deletes given Asset
   */
  public delete(props: DeleteAssetProps): CoreResult<void> {
    const validated = parseSchema(deleteAssetSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const projectPath = pathTo.project(props.projectId);
    const assetFilePath = pathTo.assetFile(props.projectId, props.id);
    const assetPath = pathTo.asset(props.projectId, props.id, props.extension);

    const result = this.withGitRollback(projectPath, () =>
      ResultAsync.fromPromise(Fs.remove(assetPath), CoreErrors.fromUnknown)
        .andThen(() =>
          ResultAsync.fromPromise(Fs.remove(assetFilePath), CoreErrors.fromUnknown)
        )
        .andThen(() => this.gitService.add(projectPath, [assetFilePath, assetPath]))
        .andThen(() =>
          this.gitService.commit(projectPath, {
            method: 'delete',
            reference: { objectType: 'asset', id: props.id },
          })
        )
        .map(() => undefined)
    );

    return this.logged('delete', result);
  }

  public list(props: ListAssetsProps): CoreResult<PaginatedList<Asset>> {
    const validated = parseSchema(listAssetsSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const offset = props.offset || 0;
    const limit = props.limit ?? 15;

    const result = this.listReferences(
      objectTypeSchema.enum.asset,
      props.projectId
    ).andThen((assetReferences) => {
      const partialAssetReferences =
        limit === 0
          ? assetReferences.slice(offset)
          : assetReferences.slice(offset, offset + limit);

      return ResultAsync.fromSafePromise(
        this.collectResults(
          partialAssetReferences.map((assetReference) =>
            this.read({
              projectId: props.projectId,
              id: assetReference.id,
            })
          )
        )
      ).map((assets) => ({
        total: assetReferences.length,
        limit,
        offset,
        list: assets,
      }));
    });

    return this.logged('list', result);
  }

  public count(props: CountAssetsProps): CoreResult<number> {
    const validated = parseSchema(countAssetsSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const result = this.listReferences(
      objectTypeSchema.enum.asset,
      props.projectId
    ).map((refs) => refs.length);

    return this.logged('count', result);
  }

  /**
   * Checks if given object is of type Asset
   */
  public isAsset(obj: unknown): obj is Asset {
    return assetSchema.safeParse(obj).success;
  }

  /**
   * Returns the size of a file in bytes
   *
   * @param path Path of the file to get the size from
   */
  private getFileSize(path: string): CoreResult<number> {
    return ResultAsync.fromPromise(Fs.stat(path), CoreErrors.fromUnknown).map(
      (stats) => stats.size
    );
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
   * otherwise returns an error
   *
   * @param filePath Path to the file to check
   */
  private getFileType(
    filePath: string
  ): Result<{ extension: string; mimeType: string }, CoreError> {
    const mimeType = mime.getType(filePath);

    if (mimeType === null) {
      return err(
        CoreErrors.badRequest(`Unsupported MIME type of file "${filePath}"`)
      );
    }

    const extension = mime.getExtension(mimeType);

    if (extension === null) {
      return err(
        CoreErrors.badRequest(
          `Unsupported extension for MIME type "${mimeType}" of file "${filePath}"`
        )
      );
    }

    return ok({
      extension,
      mimeType,
    });
  }

  /**
   * Migrates a potentially outdated Asset file to the current schema
   */
  public migrate(potentiallyOutdatedAssetFile: unknown) {
    const loose = migrateAssetSchema.parse(potentiallyOutdatedAssetFile);
    const migrated = applyMigrations(loose, assetMigrations, this.coreVersion);
    return assetFileSchema.parse(migrated);
  }
}
