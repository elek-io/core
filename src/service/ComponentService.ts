import Fs from 'fs-extra';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { CoreErrors, parseSchema, type CoreResult } from '../util/shared.js';
import {
  componentFileSchema,
  countComponentsSchema,
  migrateComponentSchema,
  createComponentSchema,
  deleteComponentSchema,
  listComponentsSchema,
  objectTypeSchema,
  type ReadBySlugComponentProps,
  readComponentSchema,
  serviceTypeSchema,
  updateComponentSchema,
  uuidSchema,
  type Component,
  type ComponentFile,
  type CountComponentsProps,
  type CreateComponentProps,
  type CrudServiceWithListCount,
  type DeleteComponentProps,
  type ElekIoCoreOptions,
  type ListComponentsProps,
  type PaginatedList,
  type ReadComponentProps,
  type UpdateComponentProps,
  type ResolveComponentIdProps,
  type ComponentHistoryProps,
  type GitCommit,
  componentHistorySchema,
  collectionFileSchema,
  entryFileSchema,
  flattenFieldDefinitions,
  type FieldDefinition,
  type Value,
} from '../schema/index.js';
import { applyMigrations, componentMigrations } from './migrations/index.js';
import { folders, pathTo } from '../util/node.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractIndexedEntityService } from './AbstractIndexedEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Component files on disk
 */
export class ComponentService
  extends AbstractIndexedEntityService
  implements CrudServiceWithListCount<Component>
{
  private coreVersion: string;

  protected entityFileSchema = componentFileSchema;

  protected entitiesPath(projectId: string): string {
    return pathTo.components(projectId);
  }
  protected entityPath(projectId: string, id: string): string {
    return pathTo.component(projectId, id);
  }
  protected entityFilePath(projectId: string, id: string): string {
    return pathTo.componentFile(projectId, id);
  }
  protected extractSlug(file: unknown): string {
    return (file as ComponentFile).slug;
  }

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(
      serviceTypeSchema.enum.Component,
      options,
      logService,
      jsonFileService,
      gitService
    );

    this.coreVersion = coreVersion;
  }

  /**
   * Resolves a UUID-or-slug string to a component UUID.
   */
  public resolveComponentId(
    props: ResolveComponentIdProps
  ): CoreResult<string> {
    return this.logged(
      'resolveComponentId',
      this.resolveId(props.projectId, props.idOrSlug)
    );
  }

  /**
   * Creates a new Component
   */
  public create<T extends Component = Component>(
    props: CreateComponentProps
  ): CoreResult<T> {
    return this.logged(
      'create',
      (() => {
        const validated = parseSchema(createComponentSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const validatedProps = validated.value;

        return this.validateNoCircularReferences(
          null,
          validatedProps.fieldDefinitions,
          validatedProps.projectId
        ).andThen(() => {
          const id = uuid();
          const projectPath = pathTo.project(validatedProps.projectId);
          const componentPath = pathTo.component(validatedProps.projectId, id);
          const componentFilePath = pathTo.componentFile(
            validatedProps.projectId,
            id
          );
          const componentSlug = slug(validatedProps.slug);

          return this.getIndex(validatedProps.projectId).andThen((index) => {
            if (Object.values(index).includes(componentSlug)) {
              return errAsync(
                CoreErrors.conflict(
                  `Component slug "${componentSlug}" is already in use by another component`
                )
              );
            }

            const { projectId: _, ...validatedComponentProps } = validatedProps;
            const componentFile: ComponentFile = {
              ...validatedComponentProps,
              objectType: 'component',
              id,
              coreVersion: this.coreVersion,
              slug: componentSlug,
              created: datetime(),
              updated: null,
            };

            return this.withGitRollback(
              projectPath,
              () =>
                ResultAsync.fromPromise(
                  Fs.ensureDir(componentPath),
                  CoreErrors.fromUnknown
                )
                  .andThen(() =>
                    this.jsonFileService.create(
                      componentFile,
                      componentFilePath,
                      componentFileSchema
                    )
                  )
                  .andThen(() =>
                    this.gitService.add(projectPath, [componentFilePath])
                  )
                  .andThen(() =>
                    this.gitService.commit(projectPath, {
                      method: 'create',
                      reference: { objectType: 'component', id },
                    })
                  ),
              [componentPath]
            ).andThen(() => {
              index[id] = componentSlug;
              return ResultAsync.fromPromise(
                this.safeWriteIndex(validatedProps.projectId, index),
                CoreErrors.fromUnknown
              ).map(() => this.toComponent(componentFile) as T);
            });
          });
        });
      })()
    );
  }

  /**
   * Returns a Component by ID
   */
  public read<T extends Component = Component>(
    props: ReadComponentProps
  ): CoreResult<T> {
    return this.logged(
      'read',
      (() => {
        const validated = parseSchema(readComponentSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        if (!props.commitHash) {
          return this.jsonFileService
            .read(
              pathTo.componentFile(props.projectId, props.id),
              componentFileSchema
            )
            .map((componentFile) => this.toComponent(componentFile) as T);
        } else {
          return this.gitService
            .getFileContentAtCommit(
              pathTo.project(props.projectId),
              pathTo.componentFile(props.projectId, props.id),
              props.commitHash
            )
            .map((content) => {
              const componentFile = this.migrate(JSON.parse(content));
              return this.toComponent(componentFile) as T;
            });
        }
      })()
    );
  }

  /**
   * Reads a Component by its slug
   */
  public readBySlug<T extends Component = Component>(
    props: ReadBySlugComponentProps
  ): CoreResult<T> {
    return this.logged(
      'readBySlug',
      this.resolveComponentId({
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
   * Returns the commit history of a Component
   */
  public history(props: ComponentHistoryProps): CoreResult<GitCommit[]> {
    return this.logged(
      'history',
      (() => {
        const validated = parseSchema(componentHistorySchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        return this.gitService.log(pathTo.project(props.projectId), {
          filePath: pathTo.componentFile(props.projectId, props.id),
        });
      })()
    );
  }

  /**
   * Updates given Component
   *
   * Handles fieldDefinition slug rename cascade: when a sub-field slug changes
   * (matched by UUID), all Entry data referencing this Component is updated.
   */
  public update<T extends Component = Component>(
    props: UpdateComponentProps
  ): CoreResult<T> {
    return this.logged(
      'update',
      (() => {
        const validated = parseSchema(updateComponentSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const validatedProps = validated.value;

        return this.validateNoCircularReferences(
          validatedProps.id,
          validatedProps.fieldDefinitions,
          validatedProps.projectId
        ).andThen(() => {
          const projectPath = pathTo.project(validatedProps.projectId);
          const componentFilePath = pathTo.componentFile(
            validatedProps.projectId,
            validatedProps.id
          );

          return this.read(validatedProps).andThen((prevComponentFile) => {
            const { projectId: _, ...validatedUpdateProps } = validatedProps;
            const componentFile: ComponentFile = {
              ...prevComponentFile,
              ...validatedUpdateProps,
              updated: datetime(),
            };

            const newSlug = slug(validatedProps.slug);

            const slugCheckResult: CoreResult<void> =
              prevComponentFile.slug !== newSlug
                ? this.getIndex(validatedProps.projectId).andThen((index) => {
                    const existingUuid = Object.entries(index).find(
                      ([, s]) => s === newSlug
                    );
                    if (existingUuid && existingUuid[0] !== validatedProps.id) {
                      return errAsync(
                        CoreErrors.conflict(
                          `Component slug "${newSlug}" is already in use by another component`
                        )
                      );
                    }
                    return okAsync(undefined);
                  })
                : okAsync(undefined);

            return slugCheckResult.andThen(() => {
              const oldFieldDefs = prevComponentFile.fieldDefinitions;
              const newFieldDefs = validatedProps.fieldDefinitions;
              const slugRenames: Array<{ oldSlug: string; newSlug: string }> =
                [];

              const oldByUuid = new Map(
                oldFieldDefs.map((fd) => [fd.id, fd])
              );
              for (const newFd of newFieldDefs) {
                const oldFd = oldByUuid.get(newFd.id);
                if (oldFd && oldFd.slug !== newFd.slug) {
                  slugRenames.push({
                    oldSlug: oldFd.slug,
                    newSlug: newFd.slug,
                  });
                }
              }

              return this.withGitRollback(projectPath, () => {
                const filesToGitAdd: string[] = [componentFilePath];

                const cascadeResult: CoreResult<void> =
                  slugRenames.length > 0
                    ? this.cascadeComponentSlugRenames(
                        validatedProps.projectId,
                        validatedProps.id,
                        slugRenames
                      ).map((cascadedFiles) => {
                        filesToGitAdd.push(...cascadedFiles);
                      })
                    : okAsync(undefined);

                return cascadeResult
                  .andThen(() =>
                    this.jsonFileService.update(
                      componentFile,
                      componentFilePath,
                      componentFileSchema
                    )
                  )
                  .andThen(() =>
                    this.gitService.add(projectPath, filesToGitAdd)
                  )
                  .andThen(() =>
                    this.gitService.commit(projectPath, {
                      method: 'update',
                      reference: {
                        objectType: 'component',
                        id: componentFile.id,
                      },
                    })
                  );
              }).andThen(() => {
                if (prevComponentFile.slug !== newSlug) {
                  return this.getIndex(validatedProps.projectId).andThen(
                    (index) => {
                      index[validatedProps.id] = newSlug;
                      return ResultAsync.fromPromise(
                        this.safeWriteIndex(validatedProps.projectId, index),
                        CoreErrors.fromUnknown
                      ).map(() => this.toComponent(componentFile) as T);
                    }
                  );
                }
                return okAsync(this.toComponent(componentFile) as T);
              });
            });
          });
        });
      })()
    );
  }

  /**
   * Deletes given Component
   *
   * Blocks deletion if the Component is still referenced by a Collection or another Component.
   */
  public delete(props: DeleteComponentProps): CoreResult<void> {
    return this.logged(
      'delete',
      (() => {
        const validated = parseSchema(deleteComponentSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        return this.findReferences(props.projectId, props.id).andThen(
          (referencingEntities) => {
            if (referencingEntities.length > 0) {
              const refs = referencingEntities
                .map((r) => `${r.type} "${r.id}"`)
                .join(', ');
              return errAsync(
                CoreErrors.conflict(
                  `Cannot delete Component "${props.id}": it is still referenced by ${refs}`
                )
              );
            }

            const projectPath = pathTo.project(props.projectId);
            const componentPath = pathTo.component(
              props.projectId,
              props.id
            );

            return this.withGitRollback(projectPath, () =>
              ResultAsync.fromPromise(
                Fs.remove(componentPath),
                CoreErrors.fromUnknown
              )
                .andThen(() =>
                  this.gitService.add(projectPath, [componentPath])
                )
                .andThen(() =>
                  this.gitService.commit(projectPath, {
                    method: 'delete',
                    reference: { objectType: 'component', id: props.id },
                  })
                )
            ).andThen(() =>
              this.getIndex(props.projectId).andThen((index) => {
                delete index[props.id];
                return ResultAsync.fromPromise(
                  this.safeWriteIndex(props.projectId, index),
                  CoreErrors.fromUnknown
                );
              })
            );
          }
        );
      })()
    );
  }

  public list<T extends Component = Component>(
    props: ListComponentsProps
  ): CoreResult<PaginatedList<T>> {
    return this.logged(
      'list',
      (() => {
        const validated = parseSchema(listComponentsSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        const offset = props.offset || 0;
        const limit = props.limit ?? 15;

        return this.listReferences(
          objectTypeSchema.enum.component,
          props.projectId
        ).andThen((componentReferences) => {
          const partialComponentReferences =
            limit === 0
              ? componentReferences.slice(offset)
              : componentReferences.slice(offset, offset + limit);

          return ResultAsync.fromPromise(
            this.collectResults(
              partialComponentReferences.map((reference) => {
                return this.read<T>({
                  projectId: props.projectId,
                  id: reference.id,
                });
              })
            ),
            CoreErrors.fromUnknown
          ).map((components) => ({
            total: componentReferences.length,
            limit,
            offset,
            list: components,
          }));
        });
      })()
    );
  }

  public count(props: CountComponentsProps): CoreResult<number> {
    return this.logged(
      'count',
      (() => {
        const validated = parseSchema(countComponentsSchema, props);
        if (validated.isErr()) return errAsync(validated.error);

        return this.listReferences(
          objectTypeSchema.enum.component,
          props.projectId
        ).map((refs) => refs.length);
      })()
    );
  }

  /**
   * Checks if given object is of type Component
   */
  public isComponent(obj: unknown): obj is Component {
    return componentFileSchema.safeParse(obj).success;
  }

  /**
   * Returns all Component UUIDs for a given project
   */
  public listAllIds(projectId: string): CoreResult<string[]> {
    return this.logged(
      'listAllIds',
      this.getIndex(projectId).map((index) => Object.keys(index))
    );
  }

  /**
   * Migrates a potentially outdated Component file to the current schema
   */
  public migrate(potentiallyOutdatedComponentFile: unknown) {
    const loose = migrateComponentSchema.parse(
      potentiallyOutdatedComponentFile
    );
    const migrated = applyMigrations(
      loose,
      componentMigrations,
      this.coreVersion
    );
    return componentFileSchema.parse(migrated);
  }

  private toComponent(componentFile: ComponentFile): Component {
    return {
      ...componentFile,
    };
  }

  /**
   * Validates that no circular references exist in dynamic field definitions.
   * Walks the tree of ofComponents references to detect cycles.
   */
  private validateNoCircularReferences(
    componentId: string | null,
    fieldDefinitions: FieldDefinition[],
    projectId: string,
    visited: Set<string> = new Set()
  ): CoreResult<void> {
    if (componentId !== null) {
      if (visited.has(componentId)) {
        return errAsync(
          CoreErrors.badRequest(
            `Circular component reference detected: Component "${componentId}" creates a cycle`
          )
        );
      }
      visited.add(componentId);
    }

    const componentFieldDefs = fieldDefinitions.filter(
      (fd) => fd.valueType === 'component'
    );

    if (componentFieldDefs.length === 0) {
      return okAsync(undefined);
    }

    // Process each component field definition sequentially
    let chain: CoreResult<void> = okAsync(undefined);

    for (const fieldDefinition of componentFieldDefs) {
      chain = chain.andThen(() => {
        const getComponentIds: CoreResult<string[]> =
          fieldDefinition.valueType === 'component' &&
          fieldDefinition.ofComponents.length > 0
            ? okAsync(fieldDefinition.ofComponents)
            : this.getIndex(projectId).map((index) => Object.keys(index));

        return getComponentIds.andThen((componentIds) => {
          let innerChain: CoreResult<void> = okAsync(undefined);
          for (const cId of componentIds) {
            innerChain = innerChain.andThen(() =>
              this.read({ projectId, id: cId }).andThen((component) =>
                this.validateNoCircularReferences(
                  cId,
                  component.fieldDefinitions,
                  projectId,
                  new Set(visited)
                )
              )
            );
          }
          return innerChain;
        });
      });
    }

    return chain;
  }

  /**
   * Cascades field definition slug renames through all Entries that reference
   * this Component (directly or nested inside other Components).
   * Returns the list of modified Entry file paths for git staging.
   */
  private cascadeComponentSlugRenames(
    projectId: string,
    componentId: string,
    slugRenames: Array<{ oldSlug: string; newSlug: string }>
  ): CoreResult<string[]> {
    const modifiedFiles: string[] = [];
    const collectionsPath = pathTo.collections(projectId);

    return ResultAsync.fromPromise(
      Fs.pathExists(collectionsPath),
      CoreErrors.fromUnknown
    ).andThen((exists) => {
      if (!exists) return okAsync(modifiedFiles);

      return ResultAsync.fromPromise(
        folders(collectionsPath),
        CoreErrors.fromUnknown
      ).andThen((collectionFolders) => {
        let chain: CoreResult<void> = okAsync(undefined);

        for (const collectionFolder of collectionFolders) {
          if (!uuidSchema.safeParse(collectionFolder.name).success) continue;

          chain = chain.andThen(() =>
            this.jsonFileService
              .read(
                pathTo.collectionFile(projectId, collectionFolder.name),
                collectionFileSchema
              )
              .andThen((collectionFile) => {
                const fieldDefs = flattenFieldDefinitions(
                  collectionFile.fieldDefinitions
                );

                return this.findDynamicFieldsReferencingComponent(
                  fieldDefs,
                  componentId,
                  projectId
                ).andThen((referencingDynamicFields) => {
                  if (referencingDynamicFields.length === 0)
                    return okAsync(undefined);

                  const entriesPath = pathTo.entries(
                    projectId,
                    collectionFolder.name
                  );

                  return ResultAsync.fromPromise(
                    Fs.pathExists(entriesPath),
                    CoreErrors.fromUnknown
                  ).andThen((entriesExist) => {
                    if (!entriesExist) return okAsync(undefined);

                    return ResultAsync.fromPromise(
                      Fs.readdir(entriesPath),
                      CoreErrors.fromUnknown
                    ).andThen((allEntryFiles) => {
                      const entryFiles = allEntryFiles.filter(
                        (entryFile) =>
                          entryFile.endsWith('.json') &&
                          entryFile !== 'collection.json'
                      );

                      let entryChain: CoreResult<void> = okAsync(undefined);

                      for (const entryFileName of entryFiles) {
                        const entryId = entryFileName.replace('.json', '');
                        const entryFilePath = pathTo.entryFile(
                          projectId,
                          collectionFolder.name,
                          entryId
                        );

                        entryChain = entryChain.andThen(() =>
                          this.jsonFileService
                            .read(entryFilePath, entryFileSchema)
                            .andThen((entryFile) => {
                              let changed = false;
                              const newValues = { ...entryFile.values };

                              for (const s of referencingDynamicFields) {
                                const dynamicValue = newValues[s];
                                if (
                                  dynamicValue &&
                                  Array.isArray(dynamicValue.content)
                                ) {
                                  for (const contentObject of dynamicValue.content) {
                                    if (
                                      contentObject.componentId === componentId
                                    ) {
                                      for (const {
                                        oldSlug,
                                        newSlug: renamedSlug,
                                      } of slugRenames) {
                                        if (
                                          oldSlug in contentObject.values
                                        ) {
                                          contentObject.values[renamedSlug] =
                                            contentObject.values[oldSlug]!;
                                          delete contentObject.values[oldSlug];
                                          changed = true;
                                        }
                                      }
                                    }

                                    changed =
                                      this.renameInNestedComponentItems(
                                        contentObject.values,
                                        componentId,
                                        slugRenames
                                      ) || changed;
                                  }
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
                                    modifiedFiles.push(entryFilePath);
                                  });
                              }
                              return okAsync(undefined);
                            })
                        );
                      }

                      return entryChain;
                    });
                  });
                });
              })
          );
        }

        return chain.map(() => modifiedFiles);
      });
    });
  }

  /**
   * Recursively renames slugs inside nested component items.
   * Returns true if any values were modified.
   */
  private renameInNestedComponentItems(
    values: Record<string, Value>,
    componentId: string,
    slugRenames: Array<{ oldSlug: string; newSlug: string }>
  ): boolean {
    let changed = false;
    for (const value of Object.values(values)) {
      if (value && value.valueType === 'component') {
        for (const contentObject of value.content) {
          if (contentObject.componentId === componentId) {
            for (const { oldSlug, newSlug: renamedSlug } of slugRenames) {
              if (oldSlug in contentObject.values) {
                contentObject.values[renamedSlug] =
                  contentObject.values[oldSlug]!;
                delete contentObject.values[oldSlug];
                changed = true;
              }
            }
          }
          // Continue recursing into nested items
          changed =
            this.renameInNestedComponentItems(
              contentObject.values,
              componentId,
              slugRenames
            ) || changed;
        }
      }
    }
    return changed;
  }

  /**
   * Finds dynamic field slugs that (transitively) reference the given componentId.
   * A dynamic field references a component if its ofComponents contains the componentId,
   * or if any of its ofComponents' own fieldDefinitions transitively reference it.
   */
  private findDynamicFieldsReferencingComponent(
    fieldDefinitions: FieldDefinition[],
    componentId: string,
    projectId: string,
    visited: Set<string> = new Set()
  ): CoreResult<string[]> {
    const result: string[] = [];
    let chain: CoreResult<void> = okAsync(undefined);

    for (const fieldDefinition of fieldDefinitions) {
      if (fieldDefinition.valueType === 'component') {
        if (
          fieldDefinition.ofComponents.length === 0 ||
          fieldDefinition.ofComponents.includes(componentId)
        ) {
          result.push(fieldDefinition.slug);
        } else {
          const fdSlug = fieldDefinition.slug;
          const referencedIds = fieldDefinition.ofComponents;

          chain = chain.andThen(() => {
            let innerChain: CoreResult<boolean> = okAsync(false);

            for (const referencedComponentId of referencedIds) {
              if (visited.has(referencedComponentId)) continue;

              innerChain = innerChain.andThen((alreadyFound) => {
                if (alreadyFound) return okAsync(true);
                visited.add(referencedComponentId);
                return this.read({
                  projectId,
                  id: referencedComponentId,
                }).andThen((component) =>
                  this.findDynamicFieldsReferencingComponent(
                    component.fieldDefinitions,
                    componentId,
                    projectId,
                    visited
                  ).map((nested) => {
                    if (nested.length > 0) {
                      result.push(fdSlug);
                      return true;
                    }
                    return false;
                  })
                );
              });
            }

            return innerChain.map(() => undefined);
          });
        }
      }
    }

    return chain.map(() => result);
  }

  /**
   * Finds all Collections and Components that reference the given componentId
   * via dynamic (ofComponents) fields.
   */
  private findReferences(
    projectId: string,
    componentId: string
  ): CoreResult<Array<{ type: 'collection' | 'component'; id: string }>> {
    const results: Array<{ type: 'collection' | 'component'; id: string }> =
      [];

    return this.getIndex(projectId).andThen((componentIndex) => {
      let chain: CoreResult<void> = okAsync(undefined);

      for (const otherId of Object.keys(componentIndex)) {
        if (otherId === componentId) continue;
        chain = chain.andThen(() =>
          this.read({ projectId, id: otherId }).map((other) => {
            if (
              this.areFieldDefinitionsReferencingComponent(
                other.fieldDefinitions,
                componentId
              )
            ) {
              results.push({ type: 'component', id: otherId });
            }
          })
        );
      }

      return chain.andThen(() => {
        const collectionsPath = pathTo.collections(projectId);
        return ResultAsync.fromPromise(
          Fs.pathExists(collectionsPath),
          CoreErrors.fromUnknown
        ).andThen((exists) => {
          if (!exists) return okAsync(results);

          return ResultAsync.fromPromise(
            folders(collectionsPath),
            CoreErrors.fromUnknown
          ).andThen((collectionFolders) => {
            let colChain: CoreResult<void> = okAsync(undefined);

            for (const folder of collectionFolders) {
              if (!uuidSchema.safeParse(folder.name).success) continue;
              colChain = colChain.andThen(() =>
                this.jsonFileService
                  .read(
                    pathTo.collectionFile(projectId, folder.name),
                    collectionFileSchema
                  )
                  .map((collectionFile) => {
                    const fieldDefinitions = flattenFieldDefinitions(
                      collectionFile.fieldDefinitions
                    );
                    if (
                      this.areFieldDefinitionsReferencingComponent(
                        fieldDefinitions,
                        componentId
                      )
                    ) {
                      results.push({ type: 'collection', id: folder.name });
                    }
                  })
              );
            }

            return colChain.map(() => results);
          });
        });
      });
    });
  }

  /**
   * Checks if any field definition in the array references the given componentId
   */
  private areFieldDefinitionsReferencingComponent(
    fieldDefinitions: FieldDefinition[],
    componentId: string
  ): boolean {
    for (const fieldDefinition of fieldDefinitions) {
      if (
        fieldDefinition.valueType === 'component' &&
        (fieldDefinition.ofComponents.length === 0 ||
          fieldDefinition.ofComponents.includes(componentId))
      ) {
        return true;
      }
    }
    return false;
  }
}
