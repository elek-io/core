import Fs from 'fs-extra';
import {
  collectionFileSchema,
  countCollectionsSchema,
  migrateCollectionSchema,
  createCollectionSchema,
  deleteCollectionSchema,
  entryFileSchema,
  listCollectionsSchema,
  objectTypeSchema,
  type ReadBySlugCollectionProps,
  readCollectionSchema,
  serviceTypeSchema,
  updateCollectionSchema,
  uuidSchema,
  type Collection,
  type CollectionFile,
  type CollectionIndex,
  type CountCollectionsProps,
  type CreateCollectionProps,
  type CrudServiceWithListCount,
  type DeleteCollectionProps,
  type ElekIoCoreOptions,
  type ListCollectionsProps,
  type PaginatedList,
  type ReadCollectionProps,
  type UpdateCollectionProps,
  type ResolveCollectionIdProps,
  type CollectionHistoryProps,
  type GitCommit,
  collectionHistorySchema,
  flattenFieldDefinitions,
} from '../schema/index.js';
import { applyMigrations, collectionMigrations } from './migrations/index.js';
import { folders, pathTo } from '../util/node.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Collection files on disk
 */
export class CollectionService
  extends AbstractCrudService
  implements CrudServiceWithListCount<Collection>
{
  private coreVersion: string;
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  /** In-memory cache for collection indices, keyed by projectId */
  private cachedIndex: Map<string, CollectionIndex> = new Map();
  /** Promise deduplication for concurrent rebuilds, keyed by projectId */
  private rebuildPromise: Map<string, Promise<CollectionIndex>> = new Map();

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.enum.Collection, options, logService);

    this.coreVersion = coreVersion;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Resolves a UUID-or-slug string to a collection UUID.
   *
   * If the input matches UUID format, verifies the folder exists on disk first.
   * If the folder doesn't exist, falls back to slug lookup.
   * Otherwise, looks up via the index.
   */
  public async resolveCollectionId(
    props: ResolveCollectionIdProps
  ): Promise<string> {
    // Check if it looks like a UUID
    if (uuidSchema.safeParse(props.idOrSlug).success) {
      // Verify the UUID folder exists on disk
      const collectionPath = pathTo.collection(props.projectId, props.idOrSlug);
      if (await Fs.pathExists(collectionPath)) {
        return props.idOrSlug;
      }
      // Fall through to slug lookup
    }

    // Look up by slug
    const index = await this.getIndex(props.projectId);
    for (const [uuid, slugValue] of Object.entries(index)) {
      if (slugValue === props.idOrSlug) {
        return uuid;
      }
    }

    // Rebuild and retry once (handles stale cache)
    this.cachedIndex.delete(props.projectId);
    const freshIndex = await this.getIndex(props.projectId);
    for (const [uuid, slugValue] of Object.entries(freshIndex)) {
      if (slugValue === props.idOrSlug) {
        return uuid;
      }
    }

    throw new Error(
      `Collection not found: "${props.idOrSlug}" does not match any collection UUID or slug`
    );
  }

  /**
   * Creates a new Collection
   */
  public async create(props: CreateCollectionProps): Promise<Collection> {
    createCollectionSchema.parse(props);

    this.validateFieldDefinitionSlugUniqueness(
      flattenFieldDefinitions(props.fieldDefinitions)
    );

    const id = uuid();
    const projectPath = pathTo.project(props.projectId);
    const collectionPath = pathTo.collection(props.projectId, id);
    const collectionFilePath = pathTo.collectionFile(props.projectId, id);

    const slugPlural = slug(props.slug.plural);

    // Enforce collection slug uniqueness via index
    const index = await this.getIndex(props.projectId);
    if (Object.values(index).includes(slugPlural)) {
      throw new Error(
        `Collection slug "${slugPlural}" is already in use by another collection`
      );
    }

    const collectionFile: CollectionFile = {
      ...props,
      objectType: 'collection',
      id,
      coreVersion: this.coreVersion,
      slug: {
        singular: slug(props.slug.singular),
        plural: slugPlural,
      },
      created: datetime(),
      updated: null,
    };

    await Fs.ensureDir(collectionPath);
    await this.jsonFileService.create(
      collectionFile,
      collectionFilePath,
      collectionFileSchema
    );
    await this.gitService.add(projectPath, [collectionFilePath]);
    await this.gitService.commit(projectPath, {
      method: 'create',
      reference: { objectType: 'collection', id },
    });

    // Update the index (not git-tracked)
    index[id] = slugPlural;
    await this.writeIndex(props.projectId, index);

    return this.toCollection(collectionFile);
  }

  /**
   * Returns a Collection by ID
   *
   * If a commit hash is provided, the Collection is read from history
   */
  public async read(props: ReadCollectionProps): Promise<Collection> {
    readCollectionSchema.parse(props);

    if (!props.commitHash) {
      const collectionFile = await this.jsonFileService.read(
        pathTo.collectionFile(props.projectId, props.id),
        collectionFileSchema
      );

      return this.toCollection(collectionFile);
    } else {
      const collectionFile = this.migrate(
        JSON.parse(
          await this.gitService.getFileContentAtCommit(
            pathTo.project(props.projectId),
            pathTo.collectionFile(props.projectId, props.id),
            props.commitHash
          )
        )
      );

      return this.toCollection(collectionFile);
    }
  }

  /**
   * Reads a Collection by its slug
   */
  public async readBySlug(
    props: ReadBySlugCollectionProps
  ): Promise<Collection> {
    const id = await this.resolveCollectionId({
      projectId: props.projectId,
      idOrSlug: props.slug,
    });
    return this.read({
      projectId: props.projectId,
      id,
      commitHash: props.commitHash,
    });
  }

  /**
   * Returns the commit history of a Collection
   */
  public async history(props: CollectionHistoryProps): Promise<GitCommit[]> {
    collectionHistorySchema.parse(props);

    return this.gitService.log(pathTo.project(props.projectId), {
      filePath: pathTo.collectionFile(props.projectId, props.id),
    });
  }

  /**
   * Updates given Collection
   *
   * Handles fieldDefinition slug rename cascade and collection slug uniqueness.
   */
  public async update(props: UpdateCollectionProps): Promise<Collection> {
    updateCollectionSchema.parse(props);

    this.validateFieldDefinitionSlugUniqueness(
      flattenFieldDefinitions(props.fieldDefinitions)
    );

    const projectPath = pathTo.project(props.projectId);
    const collectionFilePath = pathTo.collectionFile(props.projectId, props.id);
    const prevCollectionFile = await this.read(props);

    const collectionFile: CollectionFile = {
      ...prevCollectionFile,
      ...props,
      updated: datetime(),
    };

    // FieldDefinition slug rename cascade:
    // Match old and new fieldDefinitions by UUID to detect slug renames
    const oldFieldDefs = flattenFieldDefinitions(
      prevCollectionFile.fieldDefinitions
    );
    const newFieldDefs = flattenFieldDefinitions(props.fieldDefinitions);
    const slugRenames: Array<{ oldSlug: string; newSlug: string }> = [];

    const oldByUuid = new Map(oldFieldDefs.map((fd) => [fd.id, fd]));
    for (const newFd of newFieldDefs) {
      const oldFd = oldByUuid.get(newFd.id);
      if (oldFd && oldFd.slug !== newFd.slug) {
        slugRenames.push({ oldSlug: oldFd.slug, newSlug: newFd.slug });
      }
    }

    const filesToGitAdd: string[] = [collectionFilePath];

    if (slugRenames.length > 0) {
      // Read all entries and rewrite their values record keys
      const entriesPath = pathTo.entries(props.projectId, props.id);
      if (await Fs.pathExists(entriesPath)) {
        const entryFiles = (await Fs.readdir(entriesPath)).filter(
          (f) => f.endsWith('.json') && f !== 'collection.json'
        );

        for (const entryFileName of entryFiles) {
          const entryFilePath = pathTo.entryFile(
            props.projectId,
            props.id,
            entryFileName.replace('.json', '')
          );

          try {
            const entryFile = await this.jsonFileService.read(
              entryFilePath,
              entryFileSchema
            );

            let changed = false;
            const newValues: Record<string, unknown> = { ...entryFile.values };

            for (const { oldSlug, newSlug } of slugRenames) {
              if (oldSlug in newValues) {
                newValues[newSlug] = newValues[oldSlug];
                delete newValues[oldSlug];
                changed = true;
              }
            }

            if (changed) {
              const updatedEntryFile = { ...entryFile, values: newValues };
              await this.jsonFileService.update(
                updatedEntryFile,
                entryFilePath,
                entryFileSchema
              );
              filesToGitAdd.push(entryFilePath);
            }
          } catch (error) {
            this.logService.warn({
              source: 'core',
              message: `Failed to update entry "${entryFileName}" during slug rename cascade: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }
    }

    // If collection slug.plural changed, enforce uniqueness
    const newSlugPlural = slug(props.slug.plural);
    if (prevCollectionFile.slug.plural !== newSlugPlural) {
      const index = await this.getIndex(props.projectId);
      const existingUuid = Object.entries(index).find(
        ([, s]) => s === newSlugPlural
      );
      if (existingUuid && existingUuid[0] !== props.id) {
        throw new Error(
          `Collection slug "${newSlugPlural}" is already in use by another collection`
        );
      }
      index[props.id] = newSlugPlural;
      await this.writeIndex(props.projectId, index);
    }

    await this.jsonFileService.update(
      collectionFile,
      collectionFilePath,
      collectionFileSchema
    );
    await this.gitService.add(projectPath, filesToGitAdd);
    await this.gitService.commit(projectPath, {
      method: 'update',
      reference: { objectType: 'collection', id: collectionFile.id },
    });

    return this.toCollection(collectionFile);
  }

  /**
   * Deletes given Collection (folder), including it's Entries
   *
   * The Fields that Collection used are not deleted.
   */
  public async delete(props: DeleteCollectionProps): Promise<void> {
    deleteCollectionSchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const collectionPath = pathTo.collection(props.projectId, props.id);

    await Fs.remove(collectionPath);
    await this.gitService.add(projectPath, [collectionPath]);
    await this.gitService.commit(projectPath, {
      method: 'delete',
      reference: { objectType: 'collection', id: props.id },
    });

    // Remove from index
    const index = await this.getIndex(props.projectId);
    delete index[props.id];
    await this.writeIndex(props.projectId, index);
  }

  public async list(
    props: ListCollectionsProps
  ): Promise<PaginatedList<Collection>> {
    listCollectionsSchema.parse(props);

    const offset = props.offset || 0;
    const limit = props.limit ?? 15;

    const collectionReferences = await this.listReferences(
      objectTypeSchema.enum.collection,
      props.projectId
    );

    const partialCollectionReferences =
      limit === 0
        ? collectionReferences.slice(offset)
        : collectionReferences.slice(offset, offset + limit);

    const collections = await this.returnResolved(
      partialCollectionReferences.map((reference) => {
        return this.read({
          projectId: props.projectId,
          id: reference.id,
        });
      })
    );

    return {
      total: collectionReferences.length,
      limit,
      offset,
      list: collections,
    };
  }

  public async count(props: CountCollectionsProps): Promise<number> {
    countCollectionsSchema.parse(props);

    const count = (
      await this.listReferences(
        objectTypeSchema.enum.collection,
        props.projectId
      )
    ).length;

    return count;
  }

  /**
   * Checks if given object is of type Collection
   */
  public isCollection(obj: unknown): obj is Collection {
    return collectionFileSchema.safeParse(obj).success;
  }

  /**
   * Migrates an potentially outdated Collection file to the current schema
   */
  public migrate(potentiallyOutdatedCollectionFile: unknown) {
    const loose = migrateCollectionSchema.parse(
      potentiallyOutdatedCollectionFile
    );
    const migrated = applyMigrations(
      loose,
      collectionMigrations,
      this.coreVersion
    );
    return collectionFileSchema.parse(migrated);
  }

  /**
   * Creates an Collection from given CollectionFile
   *
   * @param projectId   The project's ID
   * @param collectionFile   The CollectionFile to convert
   */
  private toCollection(collectionFile: CollectionFile): Collection {
    return {
      ...collectionFile,
    };
  }

  /**
   * Gets the collection index, rebuilding from disk if not cached
   */
  private async getIndex(projectId: string): Promise<CollectionIndex> {
    const cached = this.cachedIndex.get(projectId);
    if (cached) return cached;
    const pending = this.rebuildPromise.get(projectId);
    if (pending) return pending;
    const promise = this.rebuildIndex(projectId);
    this.rebuildPromise.set(projectId, promise);
    const result = await promise;
    this.cachedIndex.set(projectId, result);
    this.rebuildPromise.delete(projectId);
    return result;
  }

  /**
   * Writes the index file atomically and updates cache
   */
  private async writeIndex(
    projectId: string,
    index: CollectionIndex
  ): Promise<void> {
    const indexPath = pathTo.collectionIndex(projectId);
    await Fs.writeFile(indexPath, JSON.stringify(index, null, 2), {
      encoding: 'utf8',
    });
    this.cachedIndex.set(projectId, index);
  }

  /**
   * Rebuilds the index by scanning all collection folders
   */
  private async rebuildIndex(projectId: string): Promise<CollectionIndex> {
    this.logService.info({
      source: 'core',
      message: `Rebuilding Collection index for Project "${projectId}"`,
    });

    const index: CollectionIndex = {};
    const collectionsPath = pathTo.collections(projectId);
    const collectionFolders = await folders(collectionsPath);

    for (const folder of collectionFolders) {
      // Skip the index.json file entry if it shows up
      if (!uuidSchema.safeParse(folder.name).success) continue;

      try {
        const collectionFilePath = pathTo.collectionFile(
          projectId,
          folder.name
        );
        const collectionFile = await this.jsonFileService.read(
          collectionFilePath,
          collectionFileSchema
        );
        index[collectionFile.id] = collectionFile.slug.plural;
      } catch (error) {
        this.logService.warn({
          source: 'core',
          message: `Skipping collection folder "${folder.name}" during index rebuild: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    await this.writeIndex(projectId, index);
    return index;
  }

  /**
   * Validates that no two fieldDefinitions share the same slug
   */
  private validateFieldDefinitionSlugUniqueness(
    fieldDefinitions: { slug: string }[]
  ): void {
    const seen = new Set<string>();
    for (const fd of fieldDefinitions) {
      if (seen.has(fd.slug)) {
        throw new Error(
          `Duplicate fieldDefinition slug "${fd.slug}": each fieldDefinition within a collection must have a unique slug`
        );
      }
      seen.add(fd.slug);
    }
  }
}
