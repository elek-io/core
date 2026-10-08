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
import type { CacheService } from './CacheService.js';
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
    cacheService: CacheService,
    gitService: GitService,
    referenceService: ReferenceService
  ) {
    super(
      serviceTypeSchema.enum.Asset,
      options,
      pathTo,
      logService,
      gitService,
      jsonFileService,
      cacheService
    );

    this.coreVersion = coreVersion;
    this.referenceService = referenceService;
  }

  /**
   * Copies the file at `filePath` into the Project, writes the JSON sidecar
   * and commits both. `name` is slugified on write, and `extension`,
   * `mimeType` and `size` are derived from the file rather than passed in.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * and `BadRequest` for a file type Core cannot recognise. A failure
   * mid-write rolls the working tree back.
   *
   * @see ../../contributing/error-handling-internals.md
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
   * Returns an Asset by ID, and with `commitHash` the version at that commit.
   *
   * A historical read has a side effect: it extracts the binary into Core's
   * tmp directory, resolving an LFS pointer against the local store, so an
   * unfetched blob fails. The returned `absolutePath` points at that temp
   * copy, which the next Core construction deletes.
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
   * The git log of the Asset's JSON metadata file, so it holds the commits
   * Core wrote through `create`, `update` and `delete` rather than the
   * binary's own history.
   *
   * Each entry's `hash` is what `read` and `save` accept as `commitHash`.
   */
  public history(props: AssetHistoryProps): Promise<GitCommit[]> {
    return this.validated('history', assetHistorySchema, props, async () => {
      return this.gitService.log(this.pathTo.project(props.projectId), {
        filePath: this.pathTo.assetFile(props.projectId, props.id),
      });
    });
  }

  /**
   * Copies an Asset's binary to `filePath`, overwriting a file already there.
   * The parent directory has to exist. With `commitHash` it saves that
   * historical version rather than the current one.
   *
   * Unlike the other write methods it writes nothing inside the Project, so
   * it works in read-only mode and on a provisioned copy.
   */
  public save(props: SaveAssetProps): Promise<void> {
    return this.validated('save', saveAssetSchema, props, async () => {
      const asset = await this.read(props);
      await Fs.copyFile(asset.absolutePath, props.filePath);
    });
  }

  /**
   * Rewrites the sidecar and commits it, slugifying `name`. With
   * `newFilePath` it also replaces the binary, re-deriving `extension`,
   * `mimeType` and `size`, and deletes the previous binary only when the new
   * extension differs.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * and `BadRequest` for an unrecognised file type. A failure mid-write rolls
   * the working tree back.
   *
   * @see ../../contributing/error-handling-internals.md
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
   * Removes the binary and its sidecar in one commit, after checking that
   * nothing points at the Asset. It throws `Conflict` naming every Entry that
   * still references it, with those Entries as the error's cause.
   *
   * `extension` has to be the stored one. A mismatch leaves the binary on
   * disk and still commits the sidecar removal.
   *
   * @see ../../contributing/error-handling-internals.md
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
   * A shape check against `assetSchema` that touches no disk, so it does not
   * mean the Asset exists in a Project. An `AssetFile` read off disk fails
   * it, because it carries no `absolutePath`.
   */
  public isAsset(obj: unknown): obj is Asset {
    return assetSchema.safeParse(obj).success;
  }

  private async getFileSize(path: string): Promise<number> {
    const stats = await Fs.stat(path);
    return stats.size;
  }

  /**
   * Creates an Asset from given AssetFile.
   *
   * With a `commitHash` the returned `absolutePath` points at the extracted
   * copy in Core's tmp directory rather than at the Project's binary under
   * `lfs/`.
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
   * Maps the path's extension to a MIME type through `mime.getType`, then
   * back to the canonical extension through `mime.getExtension`. The file
   * itself is never opened, and nothing is checked against a support list, so
   * `photo.jpeg` is stored with extension `jpg`.
   *
   * Either failed lookup throws `BadRequest`.
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
