import Fs from 'fs-extra';
import type { z } from '@hono/zod-openapi';
import { CoreError } from '../util/shared.js';
import {
  uuidSchema,
  type ElekIoCoreOptions,
  type ServiceType,
} from '../schema/index.js';
import { folders, type PathTo } from '../util/node.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * The base for entities addressable by slug as well as by UUID.
 *
 * It holds a per-Project UUID to slug map, so an entity can be resolved and
 * slug uniqueness checked without scanning every folder. The map is derived
 * rather than authoritative: git ignores the file, the cache lives per Core
 * instance, and a miss rebuilds it from the entity folders.
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
    pathTo: PathTo,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(type, options, pathTo, logService, gitService, jsonFileService);
  }

  /** Path to the folder containing all entities of this type. */
  protected abstract entitiesPath(projectId: string): string;
  /** Path to a specific entity folder */
  protected abstract entityPath(projectId: string, id: string): string;
  /** Path to the JSON file for a specific entity */
  protected abstract entityFilePath(projectId: string, id: string): string;
  /**
   * Extract the slug value from a parsed entity file. It has to be unique
   * across the Project: `lookupBySlug` scans the map and returns the first
   * match, so a duplicate leaves one entity unreachable by slug while both
   * stay in the index.
   */
  protected abstract extractSlug(file: TFile): string;
  /**
   * Zod schema for validating entity files. It has to parse into the same
   * shape as the class's `TFile`, because `rebuildSlugIndexInternal` hands
   * the parsed result to `extractSlug` through an unchecked assertion. The
   * two agree by the subclass's construction, not by the type system.
   */
  protected abstract entityFileSchema: z.ZodTypeAny;

  /**
   * Returns the cached slug index, rebuilding it from the entity folders on a
   * miss. Concurrent rebuilds of the same Project share one promise.
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
   * Replaces the cached index for a Project.
   *
   * Nothing is written to disk. The index was mirrored into
   * `slug.index.json` and never read back, so the file cost a write per
   * mutation and bought nothing.
   *
   * @see ../../docs/storage-layout.md
   */
  protected setSlugIndex(
    projectId: string,
    index: Record<string, string>
  ): void {
    this.cachedSlugIndex.set(projectId, index);
  }

  /**
   * Drops the cached index for a Project, forcing a rebuild on next access.
   *
   * Nothing else drops this cache. `GitService` clears only the JSON file
   * cache after a pull, checkout or hard reset, so any git operation that
   * can change entity files under a live Core leaves this map stale, and a
   * stale hit does not self-heal the way a miss does.
   */
  protected invalidateSlugIndex(projectId: string): void {
    this.cachedSlugIndex.delete(projectId);
  }

  /**
   * Resolves a UUID-or-slug string to a UUID.
   *
   * Not an either/or: a UUID-shaped input is accepted only when its folder
   * exists on disk, and otherwise falls through to the slug lookup and is
   * reported as a slug. The lookup rebuilds the index once on a miss, then
   * throws `NotFound` when neither the folder nor the index matches.
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
   *
   * An entity folder whose file will not read or parse is warned about and
   * left out, so it cannot be resolved by slug until it parses.
   */
  private async rebuildSlugIndexInternal(
    projectId: string
  ): Promise<Record<string, string>> {
    this.logService.info({
      source: 'core',
      message: `Rebuilding ${this.type} slug index for Project "${projectId}"`,
      meta: { 'elek.project.id': projectId, 'elek.object.type': this.type },
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
        // read() infers from the schema field, which the subclass supplies
        // alongside TFile, so the two agree by construction but not by type
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        index[folder.name] = this.extractSlug(file as TFile);
      } catch (error) {
        this.logService.warn({
          source: 'core',
          message: `Skipping ${this.type} folder "${folder.name}" during slug index rebuild: ${error instanceof Error ? error.message : String(error)}`,
          meta: {
            'elek.project.id': projectId,
            'elek.object.type': this.type,
            'file.name': folder.name,
            'exception.message':
              error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return index;
  }
}
