import Fs from 'fs-extra';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { CoreErrors, parseSchema, type CoreResult } from '../util/shared.js';
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
    super(
      serviceTypeSchema.enum.Collection,
      options,
      logService,
      jsonFileService,
      gitService
    );

    this.coreVersion = coreVersion;
  }

  /**
   * Resolves a UUID-or-slug string to a collection UUID.
   */
  public resolveCollectionId(
    props: ResolveCollectionIdProps
  ): CoreResult<string> {
    return this.logged(
      'resolveCollectionId',
      this.resolveId(props.projectId, props.idOrSlug)
    );
  }

  /**
   * Creates a new Collection
   */
  public create<T extends Collection = Collection>(
    props: CreateCollectionProps
  ): CoreResult<T> {
    return this.logged(
      'create',
      (() => {
        const validated = parseSchema(createCollectionSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const validatedProps = validated.value;
        const id = uuid();
        const projectPath = pathTo.project(validatedProps.projectId);
        const collectionPath = pathTo.collection(validatedProps.projectId, id);
        const collectionFilePath = pathTo.collectionFile(
          validatedProps.projectId,
          id
        );

        const slugPlural = slug(validatedProps.slug.plural);

        return this.getIndex(validatedProps.projectId).andThen((index) => {
          // Enforce collection slug uniqueness via index
          if (Object.values(index).includes(slugPlural)) {
            return errAsync(
              CoreErrors.conflict(
                `Collection slug "${slugPlural}" is already in use by another collection`
              )
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

          return this.withGitRollback(
            projectPath,
            () =>
              ResultAsync.fromPromise(
                Fs.ensureDir(collectionPath),
                CoreErrors.fromUnknown
              )
                .andThen(() =>
                  this.jsonFileService.create(
                    collectionFile,
                    collectionFilePath,
                    collectionFileSchema
                  )
                )
                .andThen(() =>
                  this.gitService.add(projectPath, [collectionFilePath])
                )
                .andThen(() =>
                  this.gitService.commit(projectPath, {
                    method: 'create',
                    reference: { objectType: 'collection', id },
                  })
                ),
            [collectionPath]
          ).andThen(() => {
            // Update the index (not git-tracked, self-heals on failure)
            index[id] = slugPlural;
            return ResultAsync.fromSafePromise(
              this.safeWriteIndex(validatedProps.projectId, index)
            ).map(() => this.toCollection(collectionFile) as T);
          });
        });
      })()
    );
  }

  /**
   * Returns a Collection by ID
   *
   * If a commit hash is provided, the Collection is read from history
   */
  public read<T extends Collection = Collection>(
    props: ReadCollectionProps
  ): CoreResult<T> {
    return this.logged(
      'read',
      (() => {
        const validated = parseSchema(readCollectionSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        if (!props.commitHash) {
          return this.jsonFileService
            .read(
              pathTo.collectionFile(props.projectId, props.id),
              collectionFileSchema
            )
            .map((collectionFile) => this.toCollection(collectionFile) as T);
        } else {
          return this.gitService
            .getFileContentAtCommit(
              pathTo.project(props.projectId),
              pathTo.collectionFile(props.projectId, props.id),
              props.commitHash
            )
            .map((content) => {
              const collectionFile = this.migrate(JSON.parse(content));
              return this.toCollection(collectionFile) as T;
            });
        }
      })()
    );
  }

  /**
   * Reads a Collection by its slug
   */
  public readBySlug<T extends Collection = Collection>(
    props: ReadBySlugCollectionProps
  ): CoreResult<T> {
    return this.logged(
      'readBySlug',
      this.resolveCollectionId({
        projectId: props.projectId,
        idOrSlug: props.slug,
      }).andThen((id) =>
        this.read<T>({
          projectId: props.projectId,
          id,
          commitHash: props.commitHash,
        })
      )
    );
  }

  /**
   * Returns the commit history of a Collection
   */
  public history(props: CollectionHistoryProps): CoreResult<GitCommit[]> {
    return this.logged(
      'history',
      (() => {
        const validated = parseSchema(collectionHistorySchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        return this.gitService.log(pathTo.project(props.projectId), {
          filePath: pathTo.collectionFile(props.projectId, props.id),
        });
      })()
    );
  }

  /**
   * Updates given Collection
   *
   * Handles fieldDefinition slug rename cascade and collection slug uniqueness.
   */
  public update<T extends Collection = Collection>(
    props: UpdateCollectionProps
  ): CoreResult<T> {
    return this.logged(
      'update',
      (() => {
        const validated = parseSchema(updateCollectionSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const validatedProps = validated.value;
        const projectPath = pathTo.project(validatedProps.projectId);
        const collectionFilePath = pathTo.collectionFile(
          validatedProps.projectId,
          validatedProps.id
        );

        return this.read(validatedProps).andThen((prevCollectionFile) => {
          const { projectId: _, ...validatedUpdateProps } = validatedProps;
          const collectionFile: CollectionFile = {
            ...prevCollectionFile,
            ...validatedUpdateProps,
            updated: datetime(),
          };

          // FieldDefinition slug rename cascade:
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

          const newSlugPlural = slug(validatedProps.slug.plural);

          // If collection slug.plural changed, enforce uniqueness before mutating
          const slugUniquenessCheck: CoreResult<void> =
            prevCollectionFile.slug.plural !== newSlugPlural
              ? this.getIndex(validatedProps.projectId).andThen((index) => {
                  const existingUuid = Object.entries(index).find(
                    ([, s]) => s === newSlugPlural
                  );
                  if (existingUuid && existingUuid[0] !== validatedProps.id) {
                    return errAsync(
                      CoreErrors.conflict(
                        `Collection slug "${newSlugPlural}" is already in use by another collection`
                      )
                    );
                  }
                  return okAsync(undefined);
                })
              : okAsync(undefined);

          return slugUniquenessCheck.andThen(() =>
            this.withGitRollback(projectPath, () => {
              const filesToGitAdd: string[] = [collectionFilePath];

              const renameOp: CoreResult<void> =
                slugRenames.length > 0
                  ? (() => {
                      const entriesPath = pathTo.entries(
                        validatedProps.projectId,
                        validatedProps.id
                      );
                      return ResultAsync.fromPromise(
                        Fs.pathExists(entriesPath),
                        CoreErrors.fromUnknown
                      ).andThen((exists) => {
                        if (!exists) return okAsync(undefined);

                        return ResultAsync.fromPromise(
                          Fs.readdir(entriesPath),
                          CoreErrors.fromUnknown
                        ).andThen((dirEntries) => {
                          const entryFiles = dirEntries.filter(
                            (f) =>
                              f.endsWith('.json') && f !== 'collection.json'
                          );

                          // Process each entry file sequentially
                          let chain: CoreResult<void> = okAsync(undefined);
                          for (const entryFileName of entryFiles) {
                            chain = chain.andThen(() => {
                              const entryFilePath = pathTo.entryFile(
                                validatedProps.projectId,
                                validatedProps.id,
                                entryFileName.replace('.json', '')
                              );

                              return this.jsonFileService
                                .read(entryFilePath, entryFileSchema)
                                .andThen((entryFile) => {
                                  let changed = false;
                                  const newValues: Record<string, unknown> = {
                                    ...entryFile.values,
                                  };

                                  for (const {
                                    oldSlug,
                                    newSlug,
                                  } of slugRenames) {
                                    if (oldSlug in newValues) {
                                      newValues[newSlug] = newValues[oldSlug];
                                      delete newValues[oldSlug];
                                      changed = true;
                                    }
                                  }

                                  if (changed) {
                                    const updatedEntryFile = {
                                      ...entryFile,
                                      values: newValues,
                                    };
                                    return this.jsonFileService
                                      .update(
                                        updatedEntryFile,
                                        entryFilePath,
                                        entryFileSchema
                                      )
                                      .map(() => {
                                        filesToGitAdd.push(entryFilePath);
                                      });
                                  }
                                  return okAsync(undefined);
                                });
                            });
                          }
                          return chain;
                        });
                      });
                    })()
                  : okAsync(undefined);

              return renameOp
                .andThen(() =>
                  this.jsonFileService.update(
                    collectionFile,
                    collectionFilePath,
                    collectionFileSchema
                  )
                )
                .andThen(() =>
                  this.gitService.add(projectPath, filesToGitAdd)
                )
                .andThen(() =>
                  this.gitService.commit(projectPath, {
                    method: 'update',
                    reference: {
                      objectType: 'collection',
                      id: collectionFile.id,
                    },
                  })
                );
            }).andThen(() => {
              // Update index after successful commit
              if (prevCollectionFile.slug.plural !== newSlugPlural) {
                return this.getIndex(validatedProps.projectId).andThen(
                  (index) => {
                    index[validatedProps.id] = newSlugPlural;
                    return ResultAsync.fromSafePromise(
                      this.safeWriteIndex(validatedProps.projectId, index)
                    ).map(() => this.toCollection(collectionFile) as T);
                  }
                );
              }
              return okAsync(this.toCollection(collectionFile) as T);
            })
          );
        });
      })()
    );
  }

  /**
   * Deletes given Collection (folder), including it's Entries
   *
   * The Fields that Collection used are not deleted.
   */
  public delete(props: DeleteCollectionProps): CoreResult<void> {
    return this.logged(
      'delete',
      (() => {
        const validated = parseSchema(deleteCollectionSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const projectPath = pathTo.project(props.projectId);
        const collectionPath = pathTo.collection(props.projectId, props.id);

        return this.withGitRollback(projectPath, () =>
          ResultAsync.fromPromise(
            Fs.remove(collectionPath),
            CoreErrors.fromUnknown
          )
            .andThen(() =>
              this.gitService.add(projectPath, [collectionPath])
            )
            .andThen(() =>
              this.gitService.commit(projectPath, {
                method: 'delete',
                reference: { objectType: 'collection', id: props.id },
              })
            )
        ).andThen(() =>
          // Remove from index (not git-tracked, self-heals on failure)
          this.getIndex(props.projectId).andThen((index) => {
            delete index[props.id];
            return ResultAsync.fromSafePromise(
              this.safeWriteIndex(props.projectId, index)
            );
          })
        );
      })()
    );
  }

  public list<T extends Collection = Collection>(
    props: ListCollectionsProps
  ): CoreResult<PaginatedList<T>> {
    return this.logged(
      'list',
      (() => {
        const validated = parseSchema(listCollectionsSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const offset = props.offset || 0;
        const limit = props.limit ?? 15;

        return this.listReferences(
          objectTypeSchema.enum.collection,
          props.projectId
        ).andThen((collectionReferences) => {
          const partialCollectionReferences =
            limit === 0
              ? collectionReferences.slice(offset)
              : collectionReferences.slice(offset, offset + limit);

          return ResultAsync.fromSafePromise(
            this.collectResults(
              partialCollectionReferences.map((reference) =>
                this.read<T>({
                  projectId: props.projectId,
                  id: reference.id,
                })
              )
            )
          ).map((collections) => ({
            total: collectionReferences.length,
            limit,
            offset,
            list: collections,
          }));
        });
      })()
    );
  }

  public count(props: CountCollectionsProps): CoreResult<number> {
    return this.logged(
      'count',
      (() => {
        const validated = parseSchema(countCollectionsSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        return this.listReferences(
          objectTypeSchema.enum.collection,
          props.projectId
        ).map((refs) => refs.length);
      })()
    );
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
   * @param collectionFile   The CollectionFile to convert
   */
  private toCollection(collectionFile: CollectionFile): Collection {
    return {
      ...collectionFile,
    };
  }
}
