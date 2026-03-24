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
  type Collection,
  type CollectionFile,
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
import { pathTo } from '../util/node.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractIndexedEntityService } from './AbstractIndexedEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Collection files on disk
 */
export class CollectionService
  extends AbstractIndexedEntityService
  implements CrudServiceWithListCount<Collection>
{
  private coreVersion: string;
  private gitService: GitService;

  protected entityFileSchema = collectionFileSchema;

  protected entitiesPath(projectId: string): string {
    return pathTo.collections(projectId);
  }
  protected entityPath(projectId: string, id: string): string {
    return pathTo.collection(projectId, id);
  }
  protected entityFilePath(projectId: string, id: string): string {
    return pathTo.collectionFile(projectId, id);
  }
  protected extractSlug(file: unknown): string {
    return (file as CollectionFile).slug.plural;
  }

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.enum.Collection, options, logService, jsonFileService);

    this.coreVersion = coreVersion;
    this.gitService = gitService;
  }

  /**
   * Resolves a UUID-or-slug string to a collection UUID.
   */
  public async resolveCollectionId(
    props: ResolveCollectionIdProps
  ): Promise<string> {
    return this.resolveId(props.projectId, props.idOrSlug);
  }

  /**
   * Creates a new Collection
   */
  public async create(props: CreateCollectionProps): Promise<Collection> {
    const validatedProps = createCollectionSchema.parse(props);

    const id = uuid();
    const projectPath = pathTo.project(validatedProps.projectId);
    const collectionPath = pathTo.collection(validatedProps.projectId, id);
    const collectionFilePath = pathTo.collectionFile(
      validatedProps.projectId,
      id
    );

    const slugPlural = slug(validatedProps.slug.plural);

    // Enforce collection slug uniqueness via index
    const index = await this.getIndex(validatedProps.projectId);
    if (Object.values(index).includes(slugPlural)) {
      throw new Error(
        `Collection slug "${slugPlural}" is already in use by another collection`
      );
    }

    const { projectId: _, ...validatedCollectionProps } = validatedProps;
    const collectionFile: CollectionFile = {
      ...validatedCollectionProps,
      objectType: 'collection',
      id,
      coreVersion: this.coreVersion,
      slug: {
        singular: slug(validatedProps.slug.singular),
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
    await this.writeIndex(validatedProps.projectId, index);

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
    const validatedProps = updateCollectionSchema.parse(props);

    const projectPath = pathTo.project(validatedProps.projectId);
    const collectionFilePath = pathTo.collectionFile(
      validatedProps.projectId,
      validatedProps.id
    );
    const prevCollectionFile = await this.read(validatedProps);

    const { projectId: _, ...validatedUpdateProps } = validatedProps;
    const collectionFile: CollectionFile = {
      ...prevCollectionFile,
      ...validatedUpdateProps,
      updated: datetime(),
    };

    // FieldDefinition slug rename cascade:
    // Match old and new fieldDefinitions by UUID to detect slug renames
    const oldFieldDefs = flattenFieldDefinitions(
      prevCollectionFile.fieldDefinitions
    );
    const newFieldDefs = flattenFieldDefinitions(
      validatedProps.fieldDefinitions
    );
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
      const entriesPath = pathTo.entries(validatedProps.projectId, validatedProps.id);
      if (await Fs.pathExists(entriesPath)) {
        const entryFiles = (await Fs.readdir(entriesPath)).filter(
          (f) => f.endsWith('.json') && f !== 'collection.json'
        );

        for (const entryFileName of entryFiles) {
          const entryFilePath = pathTo.entryFile(
            validatedProps.projectId,
            validatedProps.id,
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
    const newSlugPlural = slug(validatedProps.slug.plural);
    if (prevCollectionFile.slug.plural !== newSlugPlural) {
      const index = await this.getIndex(validatedProps.projectId);
      const existingUuid = Object.entries(index).find(
        ([, s]) => s === newSlugPlural
      );
      if (existingUuid && existingUuid[0] !== validatedProps.id) {
        throw new Error(
          `Collection slug "${newSlugPlural}" is already in use by another collection`
        );
      }
      index[validatedProps.id] = newSlugPlural;
      await this.writeIndex(validatedProps.projectId, index);
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

    const collections = await this.settleAndWarn(
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
}
