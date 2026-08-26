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
import type { PathTo } from '../util/node.js';
import {
  applyMigrations,
  assetMigrations,
  migrating,
} from './migrations/index.js';
import { datetime, slug, uuid, CoreError } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { ReferenceService } from './ReferenceService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * An Asset is two files, the binary under `lfs/` tracked by Git LFS and a JSON
 * metadata sidecar under `assets/`. Every mutating method writes both and
 * commits them together, so the pair never drifts apart in history.
 *
 * @see ../../docs/asset-management.md
 */
export class AssetService extends AbstractEntityService {
  private readonly coreVersion: string;
  private readonly referenceService: ReferenceService;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    referenceService: ReferenceService
  ) {
    super(
      serviceTypeSchema.enum.Asset,
      options,
      pathTo,
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
    return this.mutating(
      'create',
      createAssetSchema,
      props,
      async (validatedProps) => {
        await this.assertNotProvisioned('create', validatedProps.projectId);

        const id = uuid();
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const fileType = this.getFileType(validatedProps.filePath);

        const assetPath = this.pathTo.asset(
          validatedProps.projectId,
          id,
          fileType.extension
        );
        const assetFilePath = this.pathTo.assetFile(
          validatedProps.projectId,
          id
        );

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
          this.pathTo.assetFile(props.projectId, props.id),
          assetFileSchema
        );
        return this.toAsset(props.projectId, assetFile);
      } else {
        const content = await this.gitService.getFileContentAtCommit(
          this.pathTo.project(props.projectId),
          this.pathTo.assetFile(props.projectId, props.id),
          props.commitHash
        );
        const assetFile = this.migrate(JSON.parse(content));
        const assetPath = this.pathTo.asset(
          props.projectId,
          props.id,
          assetFile.extension
        );
        let blob = await this.gitService.getFileContentAtCommit(
          this.pathTo.project(props.projectId),
          assetPath,
          props.commitHash,
          'binary'
        );
        // LFS-tracked binaries are stored as pointers, so `getFileContentAtCommit` returns the
        // pointer text. Resolve it to the real bytes from the local LFS store.
        if (this.gitService.lfs.isPointer(blob)) {
          blob = await this.gitService.lfs.smudge(
            this.pathTo.project(props.projectId),
            blob,
            assetPath
          );
        }
        await Fs.writeFile(
          this.pathTo.tmpAsset(
            assetFile.id,
            props.commitHash,
            assetFile.extension
          ),
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
      return this.gitService.log(this.pathTo.project(props.projectId), {
        filePath: this.pathTo.assetFile(props.projectId, props.id),
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
    return this.mutating(
      'update',
      updateAssetSchema,
      props,
      async (validatedProps) => {
        await this.assertNotProvisioned('update', validatedProps.projectId);

        const projectPath = this.pathTo.project(validatedProps.projectId);
        const assetFilePath = this.pathTo.assetFile(
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

            const prevAssetPath = this.pathTo.asset(
              validatedProps.projectId,
              validatedProps.id,
              prevAsset.extension
            );
            const assetPath = this.pathTo.asset(
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
              await this.jsonFileService.delete(prevAssetPath);
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
    return this.mutating('delete', deleteAssetSchema, props, async () => {
      await this.assertNotProvisioned('delete', props.projectId);

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

      const projectPath = this.pathTo.project(props.projectId);
      const assetFilePath = this.pathTo.assetFile(props.projectId, props.id);
      const assetPath = this.pathTo.asset(
        props.projectId,
        props.id,
        props.extension
      );

      return this.withGitRollback(projectPath, async () => {
        await this.jsonFileService.delete(assetPath);
        await this.jsonFileService.delete(assetFilePath);
        await this.gitService.add(projectPath, [assetFilePath, assetPath]);
        await this.gitService.commit(projectPath, {
          method: 'delete',
          reference: { objectType: 'asset', id: props.id },
        });
      });
    });
  }

  /**
   * One page of Assets, built from the JSON sidecars in `assets/` alone. No
   * binary is opened, and the order is whatever the filesystem returns.
   *
   * `limit` defaults to 15 and `limit: 0` returns everything from `offset`.
   * `total` counts every Asset in the Project rather than the page, and an
   * Asset whose sidecar cannot be read is left out with a logged warning
   * rather than failing the call, so `list` can be shorter than both.
   */
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

  /**
   * Counts the JSON sidecars in `assets/` without opening one, so it equals
   * the `total` a `list` reports. It still counts an Asset `list` had to drop
   * as unreadable, and one whose binary was never fetched.
   */
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
   */
  private async getFileSize(path: string): Promise<number> {
    const stats = await Fs.stat(path);
    return stats.size;
  }

  /**
   * Creates an Asset from given AssetFile
   */
  private toAsset(
    projectId: string,
    assetFile: AssetFile,
    commitHash?: string
  ): Asset {
    const assetPath = commitHash
      ? this.pathTo.tmpAsset(assetFile.id, commitHash, assetFile.extension)
      : this.pathTo.asset(projectId, assetFile.id, assetFile.extension);

    return {
      ...assetFile,
      absolutePath: assetPath,
    };
  }

  /**
   * Returns the found and supported extension as well as mime type,
   * otherwise throws an error
   */
  private getFileType(filePath: string): {
    extension: string;
    mimeType: string;
  } {
    const mimeType = mime.getType(filePath);

    // Neither message names the file. The path is the one the User picked
    // on their own disk, so it carries the name they gave it, and the
    // service boundary logs a message. See contributing/logging.md
    if (mimeType === null) {
      throw CoreError.badRequest(
        'The file has no MIME type Core recognises, so it cannot be stored as an Asset'
      );
    }

    const extension = mime.getExtension(mimeType);

    if (extension === null) {
      throw CoreError.badRequest(
        `No file extension is known for MIME type "${mimeType}"`
      );
    }

    return {
      extension,
      mimeType,
    };
  }

  /**
   * Migrates a potentially outdated Asset file to the current schema.
   *
   * Throws `BadRequest` when the file does not match what Core expects, with
   * the underlying `ZodError` as its cause, and `VersionSkew` when it was
   * written by a newer Core than the one installed. Reads no disk.
   */
  public migrate(potentiallyOutdatedAssetFile: unknown) {
    return migrating('Asset', () => {
      const loose = migrateAssetSchema.parse(potentiallyOutdatedAssetFile);
      const migrated = applyMigrations(
        loose,
        assetMigrations,
        this.coreVersion
      );
      return assetFileSchema.parse(migrated);
    });
  }
}
