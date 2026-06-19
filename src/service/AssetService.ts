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
import { datetime, slug, uuid, CoreError } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { ReferenceService } from './ReferenceService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Asset files on disk
 */
export class AssetService extends AbstractEntityService {
  private readonly coreVersion: string;
  private readonly referenceService: ReferenceService;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    referenceService: ReferenceService
  ) {
    super(
      serviceTypeSchema.enum.Asset,
      options,
      logService,
      gitService,
      jsonFileService
    );

    this.coreVersion = coreVersion;
    this.referenceService = referenceService;
  }

  /**
   * Creates a new Asset
   */
  public create(props: CreateAssetProps): Promise<Asset> {
    return this.validated(
      'create',
      createAssetSchema,
      props,
      async (validatedProps) => {
        const id = uuid();
        const projectPath = pathTo.project(validatedProps.projectId);
        const fileType = this.getFileType(validatedProps.filePath);

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

        const size = await this.getFileSize(validatedProps.filePath);
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

        return this.withGitRollback(projectPath, async () => {
          await Fs.copyFile(validatedProps.filePath, assetPath);
          await this.jsonFileService.create(
            assetFile,
            assetFilePath,
            assetFileSchema
          );
          await this.gitService.add(projectPath, [assetFilePath, assetPath]);
          await this.gitService.commit(projectPath, {
            method: 'create',
            reference: { objectType: 'asset', id },
          });
          return this.toAsset(validatedProps.projectId, assetFile);
        }, [assetPath, assetFilePath]);
      }
    );
  }

  /**
   * Returns an Asset by ID
   *
   * If a commit hash is provided, the Asset is read from history
   */
  public read(props: ReadAssetProps): Promise<Asset> {
    return this.validated('read', readAssetSchema, props, async () => {
      if (!props.commitHash) {
        const assetFile = await this.jsonFileService.read(
          pathTo.assetFile(props.projectId, props.id),
          assetFileSchema
        );
        return this.toAsset(props.projectId, assetFile);
      } else {
        const content = await this.gitService.getFileContentAtCommit(
          pathTo.project(props.projectId),
          pathTo.assetFile(props.projectId, props.id),
          props.commitHash
        );
        const assetFile = this.migrate(JSON.parse(content));
        const assetPath = pathTo.asset(
          props.projectId,
          props.id,
          assetFile.extension
        );
        let blob = await this.gitService.getFileContentAtCommit(
          pathTo.project(props.projectId),
          assetPath,
          props.commitHash,
          'binary'
        );
        // LFS-tracked binaries are stored as pointers, so `getFileContentAtCommit` (`git show`) returns the
        // pointer text. Resolve it to the real bytes from the local LFS store.
        if (this.gitService.lfs.isPointer(blob)) {
          blob = await this.gitService.lfs.smudge(
            pathTo.project(props.projectId),
            blob,
            assetPath
          );
        }
        await Fs.writeFile(
          pathTo.tmpAsset(assetFile.id, props.commitHash, assetFile.extension),
          blob,
          'binary'
        );
        return this.toAsset(props.projectId, assetFile, props.commitHash);
      }
    });
  }

  /**
   * Returns the commit history of an Asset
   */
  public history(props: AssetHistoryProps): Promise<GitCommit[]> {
    return this.validated('history', assetHistorySchema, props, async () => {
      return this.gitService.log(pathTo.project(props.projectId), {
        filePath: pathTo.assetFile(props.projectId, props.id),
      });
    });
  }

  /**
   * Copies an Asset to given file path on disk
   */
  public save(props: SaveAssetProps): Promise<void> {
    return this.validated('save', saveAssetSchema, props, async () => {
      const asset = await this.read(props);
      await Fs.copyFile(asset.absolutePath, props.filePath);
    });
  }

  /**
   * Updates given Asset
   *
   * Use the optional "newFilePath" prop to update the Asset itself
   */
  public update(props: UpdateAssetProps): Promise<Asset> {
    return this.validated(
      'update',
      updateAssetSchema,
      props,
      async (validatedProps) => {
        const projectPath = pathTo.project(validatedProps.projectId);
        const assetFilePath = pathTo.assetFile(
          validatedProps.projectId,
          validatedProps.id
        );

        const prevAsset = await this.read(validatedProps);
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

        return this.withGitRollback(projectPath, async () => {
          if (validatedProps.newFilePath) {
            const fileType = this.getFileType(validatedProps.newFilePath);

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

            const size = await this.getFileSize(validatedProps.newFilePath);
            assetFile.extension = fileType.extension;
            assetFile.mimeType = fileType.mimeType;
            assetFile.size = size;

            await Fs.copyFile(validatedProps.newFilePath, assetPath);
            // Only remove the previous binary when the extension changed, so its
            // path differs from the one just written. A same-extension
            // replacement reuses the same path, so removing it here would delete
            // the file we just copied in.
            const pathsToStage = [assetPath];
            if (prevAssetPath !== assetPath) {
              await Fs.remove(prevAssetPath);
              pathsToStage.push(prevAssetPath);
            }
            await this.gitService.add(projectPath, pathsToStage);
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
        });
      }
    );
  }

  /**
   * Deletes given Asset
   */
  public delete(props: DeleteAssetProps): Promise<void> {
    return this.validated('delete', deleteAssetSchema, props, async () => {
      const referencingEntries =
        await this.referenceService.findEntriesReferencing({
          projectId: props.projectId,
          assetId: props.id,
        });
      if (referencingEntries.length > 0) {
        const list = referencingEntries
          .map((r) => `Entry "${r.entryId}" (Collection "${r.collectionId}")`)
          .join(', ');
        throw CoreError.conflict(
          `Cannot delete Asset "${props.id}": it is still referenced by ${list}`,
          referencingEntries
        );
      }

      const projectPath = pathTo.project(props.projectId);
      const assetFilePath = pathTo.assetFile(props.projectId, props.id);
      const assetPath = pathTo.asset(
        props.projectId,
        props.id,
        props.extension
      );

      return this.withGitRollback(projectPath, async () => {
        await Fs.remove(assetPath);
        await Fs.remove(assetFilePath);
        await this.gitService.add(projectPath, [assetFilePath, assetPath]);
        await this.gitService.commit(projectPath, {
          method: 'delete',
          reference: { objectType: 'asset', id: props.id },
        });
      });
    });
  }

  public list(props: ListAssetsProps): Promise<PaginatedList<Asset>> {
    return this.validated('list', listAssetsSchema, props, async () => {
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

      const assets = await this.collectResults(
        partialAssetReferences.map((assetReference) =>
          this.read({
            projectId: props.projectId,
            id: assetReference.id,
          })
        )
      );
      return {
        total: assetReferences.length,
        limit,
        offset,
        list: assets,
      };
    });
  }

  public count(props: CountAssetsProps): Promise<number> {
    return this.validated('count', countAssetsSchema, props, async () => {
      const refs = await this.listReferences(
        objectTypeSchema.enum.asset,
        props.projectId
      );
      return refs.length;
    });
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
  private async getFileSize(path: string): Promise<number> {
    const stats = await Fs.stat(path);
    return stats.size;
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
  private getFileType(filePath: string): {
    extension: string;
    mimeType: string;
  } {
    const mimeType = mime.getType(filePath);

    if (mimeType === null) {
      throw CoreError.badRequest(`Unsupported MIME type of file "${filePath}"`);
    }

    const extension = mime.getExtension(mimeType);

    if (extension === null) {
      throw CoreError.badRequest(
        `Unsupported extension for MIME type "${mimeType}" of file "${filePath}"`
      );
    }

    return {
      extension,
      mimeType,
    };
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
