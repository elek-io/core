import Fs from 'fs-extra';
import Path from 'node:path';
import type { z } from '@hono/zod-openapi';
import { CoreError } from '../util/shared.js';
import {
  slugIndexFileSchema,
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
export abstract class AbstractSlugIndexedEntityService<
  TFile = unknown,
> extends AbstractEntityService {
  private cachedSlugIndex: Map<string, Record<string, string>> = new Map();
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
  protected abstract extractSlug(file: TFile): string;
  /** Zod schema for validating entity files */
  protected abstract entityFileSchema: z.ZodTypeAny;

  /**
   * Returns the cached slug index or rebuilds it from disk.
   * Deduplicates concurrent rebuild calls for the same project.
   */
  protected async getSlugIndex(
    projectId: string
  ): Promise<Record<string, string>> {
    const cached = this.cachedSlugIndex.get(projectId);
    if (cached) return cached;

    const pending = this.rebuildPromise.get(projectId);
    if (pending) return pending;

    const promise = this.rebuildSlugIndexInternal(projectId);
    this.rebuildPromise.set(projectId, promise);

    try {
      const result = await promise;
      this.cachedSlugIndex.set(projectId, result);
      return result;
    } finally {
      this.rebuildPromise.delete(projectId);
    }
  }

  /**
   * Writes the index file to disk and updates the in-memory cache.
   */
  protected async writeSlugIndex(
    projectId: string,
    index: Record<string, string>
  ): Promise<void> {
    const indexPath = Path.join(
      this.entitiesPath(projectId),
      'slug.index.json'
    );
    await this.jsonFileService.update(index, indexPath, slugIndexFileSchema);
    this.cachedSlugIndex.set(projectId, index);
  }

  /**
   * Invalidates the cached index for a project, forcing a rebuild on next access.
   */
  protected invalidateSlugIndex(projectId: string): void {
    this.cachedSlugIndex.delete(projectId);
  }

  /**
   * Writes the slug index file with automatic cache invalidation on failure.
   *
   * If the write fails, the in-memory cache is invalidated so the index
   * rebuilds from disk on next access. The error is logged but not re-thrown,
   * since the entity data was already successfully committed to git.
   */
  protected async safeWriteSlugIndex(
    projectId: string,
    index: Record<string, string>
  ): Promise<void> {
    try {
      await this.writeSlugIndex(projectId, index);
    } catch (error) {
      this.invalidateSlugIndex(projectId);
      this.logService.warn({
        source: 'core',
        message: `Failed to write ${this.type} slug index for project "${projectId}", cache invalidated: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * Resolves a UUID-or-slug string to a UUID.
   * If the input matches UUID format, verifies the folder exists on disk first.
   * Otherwise, looks up via the index. Rebuilds cache once on miss.
   */
  protected async resolveId(
    projectId: string,
    idOrSlug: string
  ): Promise<string> {
    if (uuidSchema.safeParse(idOrSlug).success) {
      const entityPath = this.entityPath(projectId, idOrSlug);
      const exists = await Fs.pathExists(entityPath);
      if (exists) {
        return idOrSlug;
      }
    }
    return this.lookupBySlug(projectId, idOrSlug);
  }

  private async lookupBySlug(projectId: string, slug: string): Promise<string> {
    const index = await this.getSlugIndex(projectId);
    for (const [uuid, slugValue] of Object.entries(index)) {
      if (slugValue === slug) {
        return uuid;
      }
    }

    // Rebuild and retry once (handles stale cache)
    this.cachedSlugIndex.delete(projectId);
    const freshIndex = await this.getSlugIndex(projectId);
    for (const [uuid, slugValue] of Object.entries(freshIndex)) {
      if (slugValue === slug) {
        return uuid;
      }
    }

    throw CoreError.notFound(
      `${this.type} not found: "${slug}" does not match any ${this.type} UUID or slug`
    );
  }

  /**
   * Rebuilds the slug index by scanning all entity folders on disk.
   */
  private async rebuildSlugIndexInternal(
    projectId: string
  ): Promise<Record<string, string>> {
    this.logService.info({
      source: 'core',
      message: `Rebuilding ${this.type} slug index for Project "${projectId}"`,
    });

    const index: Record<string, string> = {};
    const entityFolders = await folders(this.entitiesPath(projectId));

    for (const folder of entityFolders) {
      if (!uuidSchema.safeParse(folder.name).success) continue;

      try {
        const file = await this.jsonFileService.read(
          this.entityFilePath(projectId, folder.name),
          this.entityFileSchema
        );
        index[folder.name] = this.extractSlug(file as TFile);
      } catch (error) {
        this.logService.warn({
          source: 'core',
          message: `Skipping ${this.type} folder "${folder.name}" during slug index rebuild: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    try {
      await this.writeSlugIndex(projectId, index);
    } catch (error) {
      this.logService.warn({
        source: 'core',
        message: `Failed to write slug index during rebuild: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return index;
  }
}
