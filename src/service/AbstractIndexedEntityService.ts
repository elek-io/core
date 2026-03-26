import Fs from 'fs-extra';
import Path from 'node:path';
import type { z } from '@hono/zod-openapi';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { CoreErrors, type CoreResult } from '../util/shared.js';
import {
  indexFileSchema,
  uuidSchema,
  type ElekIoCoreOptions,
  type ServiceType,
} from '../schema/index.js';
import { folders } from '../util/node.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * A service for entities that support UUID-to-slug indexing.
 * Subclasses must implement abstract methods to define entity paths and slug extraction.
 */
export abstract class AbstractIndexedEntityService extends AbstractEntityService {
  private cachedIndex: Map<string, Record<string, string>> = new Map();
  private rebuildPromise: Map<string, Promise<Record<string, string>>> =
    new Map();

  protected constructor(
    type: ServiceType,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(type, options, logService, gitService, jsonFileService);
  }

  /** Path to the folder containing all entities of this type */
  protected abstract entitiesPath(projectId: string): string;
  /** Path to a specific entity folder */
  protected abstract entityPath(projectId: string, id: string): string;
  /** Path to the JSON file for a specific entity */
  protected abstract entityFilePath(projectId: string, id: string): string;
  /** Extract the slug value from a parsed entity file */
  protected abstract extractSlug(file: unknown): string;
  /** Zod schema for validating entity files */
  protected abstract entityFileSchema: z.ZodTypeAny;

  /**
   * Returns the cached index or rebuilds it from disk.
   * Deduplicates concurrent rebuild calls for the same project.
   */
  protected getIndex(projectId: string): CoreResult<Record<string, string>> {
    const cached = this.cachedIndex.get(projectId);
    if (cached) return okAsync(cached);

    const pending = this.rebuildPromise.get(projectId);
    if (pending) return ResultAsync.fromPromise(pending, CoreErrors.fromUnknown);

    const promise = this.rebuildIndexInternal(projectId);
    this.rebuildPromise.set(projectId, promise);

    return ResultAsync.fromPromise(promise, CoreErrors.fromUnknown)
      .map((result) => {
        this.cachedIndex.set(projectId, result);
        this.rebuildPromise.delete(projectId);
        return result;
      })
      .mapErr((e) => {
        this.rebuildPromise.delete(projectId);
        return e;
      });
  }

  /**
   * Writes the index file to disk and updates the in-memory cache.
   */
  protected writeIndex(
    projectId: string,
    index: Record<string, string>
  ): CoreResult<void> {
    const indexPath = Path.join(this.entitiesPath(projectId), 'index.json');
    return this.jsonFileService
      .update(index, indexPath, indexFileSchema)
      .map(() => {
        this.cachedIndex.set(projectId, index);
      });
  }

  /**
   * Invalidates the cached index for a project, forcing a rebuild on next access.
   */
  protected invalidateIndex(projectId: string): void {
    this.cachedIndex.delete(projectId);
  }

  /**
   * Writes the index file with automatic cache invalidation on failure.
   *
   * If the write fails, the in-memory cache is invalidated so the index
   * rebuilds from disk on next access. The error is logged but not re-thrown,
   * since the entity data was already successfully committed to git.
   */
  protected async safeWriteIndex(
    projectId: string,
    index: Record<string, string>
  ): Promise<void> {
    const result = await this.writeIndex(projectId, index);
    if (result.isErr()) {
      this.invalidateIndex(projectId);
      this.logService.warn({
        source: 'core',
        message: `Failed to write ${this.type} index for project "${projectId}", cache invalidated: ${result.error.message}`,
      });
    }
  }

  /**
   * Resolves a UUID-or-slug string to a UUID.
   * If the input matches UUID format, verifies the folder exists on disk first.
   * Otherwise, looks up via the index. Rebuilds cache once on miss.
   */
  protected resolveId(
    projectId: string,
    idOrSlug: string
  ): CoreResult<string> {
    if (uuidSchema.safeParse(idOrSlug).success) {
      const entityPath = this.entityPath(projectId, idOrSlug);
      return ResultAsync.fromPromise(
        Fs.pathExists(entityPath),
        CoreErrors.fromUnknown
      ).andThen((exists) => {
        if (exists) {
          return okAsync(idOrSlug);
        }
        return this.lookupBySlug(projectId, idOrSlug);
      });
    }
    return this.lookupBySlug(projectId, idOrSlug);
  }

  private lookupBySlug(
    projectId: string,
    slug: string
  ): CoreResult<string> {
    return this.getIndex(projectId).andThen((index) => {
      for (const [uuid, slugValue] of Object.entries(index)) {
        if (slugValue === slug) {
          return okAsync(uuid);
        }
      }

      // Rebuild and retry once (handles stale cache)
      this.cachedIndex.delete(projectId);
      return this.getIndex(projectId).andThen((freshIndex) => {
        for (const [uuid, slugValue] of Object.entries(freshIndex)) {
          if (slugValue === slug) {
            return okAsync(uuid);
          }
        }

        return errAsync(
          CoreErrors.notFound(
            `${this.type} not found: "${slug}" does not match any ${this.type} UUID or slug`
          )
        );
      });
    });
  }

  /**
   * Rebuilds the index by scanning all entity folders on disk.
   */
  private async rebuildIndexInternal(
    projectId: string
  ): Promise<Record<string, string>> {
    this.logService.info({
      source: 'core',
      message: `Rebuilding ${this.type} index for Project "${projectId}"`,
    });

    const index: Record<string, string> = {};
    const entityFolders = await folders(this.entitiesPath(projectId));

    for (const folder of entityFolders) {
      if (!uuidSchema.safeParse(folder.name).success) continue;

      const fileResult = await this.jsonFileService.read(
        this.entityFilePath(projectId, folder.name),
        this.entityFileSchema
      );
      if (fileResult.isOk()) {
        index[folder.name] = this.extractSlug(fileResult.value);
      } else {
        this.logService.warn({
          source: 'core',
          message: `Skipping ${this.type} folder "${folder.name}" during index rebuild: ${fileResult.error.message}`,
        });
      }
    }

    const writeResult = await this.writeIndex(projectId, index);
    if (writeResult.isErr()) {
      this.logService.warn({
        source: 'core',
        message: `Failed to write index during rebuild: ${writeResult.error.message}`,
      });
    }
    return index;
  }
}
