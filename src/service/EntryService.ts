import Fs from 'fs-extra';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { CoreErrors, parseSchema, type CoreResult } from '../util/shared.js';
import {
  countEntriesSchema,
  createEntrySchema,
  migrateEntrySchema,
  deleteEntrySchema,
  entryFileSchema,
  entrySchema,
  flattenFieldDefinitions,
  getCreateEntrySchemaFromFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
  listEntriesSchema,
  objectTypeSchema,
  readEntrySchema,
  serviceTypeSchema,
  updateEntrySchema,
  entryHistorySchema,
  type CountEntriesProps,
  type CreateEntryProps,
  type CrudServiceWithListCount,
  type DeleteEntryProps,
  type ElekIoCoreOptions,
  type Entry,
  type EntryFile,
  type ListEntriesProps,
  type PaginatedList,
  type ReadEntryProps,
  type UpdateEntryProps,
  type EntryHistoryProps,
  type GitCommit,
  type FieldDefinition,
  type ComponentResolver,
} from '../schema/index.js';
import { applyMigrations, entryMigrations } from './migrations/index.js';
import { pathTo } from '../util/node.js';
import { datetime, uuid } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { CollectionService } from './CollectionService.js';
import type { ComponentService } from './ComponentService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Entry files on disk
 */
export class EntryService
  extends AbstractEntityService
  implements CrudServiceWithListCount<Entry>
{
  private coreVersion: string;
  private collectionService: CollectionService;
  private componentService: ComponentService;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    collectionService: CollectionService,
    componentService: ComponentService
  ) {
    super(serviceTypeSchema.enum.Entry, options, logService, gitService, jsonFileService);

    this.coreVersion = coreVersion;
    this.collectionService = collectionService;
    this.componentService = componentService;
  }

  /**
   * Creates a new Entry for given Collection
   */
  public create<T extends Entry = Entry>(
    props: CreateEntryProps
  ): CoreResult<T> {
    const validated = parseSchema(createEntrySchema, props);
    if (validated.isErr()) return this.logged('create', errAsync(validated.error));

    const id = uuid();
    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      id
    );

    const result = this.collectionService.read({
      projectId: props.projectId,
      id: props.collectionId,
    }).andThen((collection) => {
      return this.buildComponentResolver(
        flattenFieldDefinitions(collection.fieldDefinitions),
        props.projectId
      ).andThen(({ resolver: componentResolver, fieldDefinitions }) => {
        const createEntrySchemaFromFieldDefinitions =
          getCreateEntrySchemaFromFieldDefinitions(
            fieldDefinitions,
            componentResolver
          );
        const validatedResult = parseSchema(createEntrySchemaFromFieldDefinitions, props);
        if (validatedResult.isErr()) return errAsync(validatedResult.error);
        const validatedProps = validatedResult.value;

        const entryFile: EntryFile = {
          objectType: 'entry',
          id,
          coreVersion: this.coreVersion,
          values: validatedProps.values,
          created: datetime(),
          updated: null,
        };

        return this.withGitRollback(
          projectPath,
          () =>
            this.jsonFileService.create(
              entryFile,
              entryFilePath,
              entryFileSchema
            ).andThen(() =>
              this.gitService.add(projectPath, [entryFilePath])
            ).andThen(() =>
              this.gitService.commit(projectPath, {
                method: 'create',
                reference: {
                  objectType: 'entry',
                  id: entryFile.id,
                  collectionId: props.collectionId,
                },
              })
            ).map(() => this.toEntry(entryFile) as T),
          [entryFilePath]
        );
      });
    });

    return this.logged('create', result);
  }

  /**
   * Returns an Entry from given Collection by ID
   *
   * If a commit hash is provided, the Entry is read from history
   */
  public read<T extends Entry = Entry>(
    props: ReadEntryProps
  ): CoreResult<T> {
    const validated = parseSchema(readEntrySchema, props);
    if (validated.isErr()) return this.logged('read', errAsync(validated.error));

    if (!props.commitHash) {
      const result = this.jsonFileService.read(
        pathTo.entryFile(props.projectId, props.collectionId, props.id),
        entryFileSchema
      ).map((entryFile) => this.toEntry(entryFile) as T);

      return this.logged('read', result);
    } else {
      const result = this.gitService.getFileContentAtCommit(
        pathTo.project(props.projectId),
        pathTo.entryFile(props.projectId, props.collectionId, props.id),
        props.commitHash
      ).map((content) => {
        const entryFile = this.migrate(JSON.parse(content));
        return this.toEntry(entryFile) as T;
      });

      return this.logged('read', result);
    }
  }

  /**
   * Returns the commit history of an Entry
   */
  public history(props: EntryHistoryProps): CoreResult<GitCommit[]> {
    const validated = parseSchema(entryHistorySchema, props);
    if (validated.isErr()) return this.logged('history', errAsync(validated.error));

    const result = this.gitService.log(pathTo.project(props.projectId), {
      filePath: pathTo.entryFile(props.projectId, props.collectionId, props.id),
    });

    return this.logged('history', result);
  }

  /**
   * Updates an Entry of given Collection with new Values
   */
  public update<T extends Entry = Entry>(
    props: UpdateEntryProps
  ): CoreResult<T> {
    const validated = parseSchema(updateEntrySchema, props);
    if (validated.isErr()) return this.logged('update', errAsync(validated.error));

    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id
    );

    const result = this.collectionService.read({
      projectId: props.projectId,
      id: props.collectionId,
    }).andThen((collection) =>
      this.read<T>({
        projectId: props.projectId,
        collectionId: props.collectionId,
        id: props.id,
      }).andThen((prevEntryFile) =>
        this.buildComponentResolver(
          flattenFieldDefinitions(collection.fieldDefinitions),
          props.projectId
        ).andThen(({ resolver: componentResolver, fieldDefinitions }) => {
          const updateEntrySchemaFromFieldDefinitions =
            getUpdateEntrySchemaFromFieldDefinitions(
              fieldDefinitions,
              componentResolver
            );
          const validatedResult = parseSchema(updateEntrySchemaFromFieldDefinitions, props);
          if (validatedResult.isErr()) return errAsync(validatedResult.error);
          const validatedProps = validatedResult.value;

          const entryFile: EntryFile = {
            ...prevEntryFile,
            values: validatedProps.values,
            updated: datetime(),
          };

          return this.withGitRollback(projectPath, () =>
            this.jsonFileService.update(
              entryFile,
              entryFilePath,
              entryFileSchema
            ).andThen(() =>
              this.gitService.add(projectPath, [entryFilePath])
            ).andThen(() =>
              this.gitService.commit(projectPath, {
                method: 'update',
                reference: {
                  objectType: 'entry',
                  id: entryFile.id,
                  collectionId: props.collectionId,
                },
              })
            ).map(() => this.toEntry(entryFile) as T)
          );
        })
      )
    );

    return this.logged('update', result);
  }

  /**
   * Deletes given Entry from it's Collection
   */
  public delete(props: DeleteEntryProps): CoreResult<void> {
    const validated = parseSchema(deleteEntrySchema, props);
    if (validated.isErr()) return this.logged('delete', errAsync(validated.error));

    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id
    );

    const result = this.withGitRollback(projectPath, () =>
      ResultAsync.fromPromise(
        Fs.remove(entryFilePath),
        CoreErrors.fromUnknown
      ).andThen(() =>
        this.gitService.add(projectPath, [entryFilePath])
      ).andThen(() =>
        this.gitService.commit(projectPath, {
          method: 'delete',
          reference: {
            objectType: 'entry',
            id: props.id,
            collectionId: props.collectionId,
          },
        })
      ).map(() => undefined)
    );

    return this.logged('delete', result);
  }

  public list<T extends Entry = Entry>(
    props: ListEntriesProps
  ): CoreResult<PaginatedList<T>> {
    const validated = parseSchema(listEntriesSchema, props);
    if (validated.isErr()) return this.logged('list', errAsync(validated.error));

    const offset = props.offset || 0;
    const limit = props.limit ?? 15;

    const result = this.listReferences(
      objectTypeSchema.enum.entry,
      props.projectId,
      props.collectionId
    ).andThen((entryReferences) => {
      const partialEntryReferences =
        limit === 0
          ? entryReferences.slice(offset)
          : entryReferences.slice(offset, offset + limit);

      return ResultAsync.fromSafePromise(
        this.collectResults(
          partialEntryReferences.map((reference) => {
            return this.read<T>({
              projectId: props.projectId,
              collectionId: props.collectionId,
              id: reference.id,
            });
          })
        )
      ).map((entries) => ({
        total: entryReferences.length,
        limit,
        offset,
        list: entries,
      }));
    });

    return this.logged('list', result);
  }

  public count(props: CountEntriesProps): CoreResult<number> {
    const validated = parseSchema(countEntriesSchema, props);
    if (validated.isErr()) return this.logged('count', errAsync(validated.error));

    const result = this.listReferences(
      objectTypeSchema.enum.entry,
      props.projectId,
      props.collectionId
    ).map((entryReferences) => entryReferences.length);

    return this.logged('count', result);
  }

  /**
   * Checks if given object is of type Entry
   */
  public isEntry(obj: unknown): obj is Entry {
    return entrySchema.safeParse(obj).success;
  }

  /**
   * Migrates an potentially outdated Entry file to the current schema
   */
  public migrate(potentiallyOutdatedEntryFile: unknown) {
    const loose = migrateEntrySchema.parse(potentiallyOutdatedEntryFile);
    const migrated = applyMigrations(loose, entryMigrations, this.coreVersion);
    return entryFileSchema.parse(migrated);
  }

  /**
   * Creates an Entry from given EntryFile by resolving it's Values
   */
  private toEntry(entryFile: EntryFile): Entry {
    return {
      ...entryFile,
    };
  }

  /**
   * Pre-loads all Components referenced (transitively) by the given field definitions
   * and returns a synchronous ComponentResolver for use during schema generation.
   *
   * When a dynamic field has an empty ofComponents array (meaning "all allowed"),
   * all project components are loaded and the returned field definitions have
   * ofComponents populated with the full list of component IDs.
   */
  private buildComponentResolver(
    fieldDefinitions: FieldDefinition[],
    projectId: string
  ): CoreResult<{
    resolver: ComponentResolver;
    fieldDefinitions: FieldDefinition[];
  }> {
    const resolvedFieldDefinitions = [...fieldDefinitions];

    // First pass: resolve empty ofComponents arrays by loading all component IDs
    const resolveStep = resolvedFieldDefinitions.reduce<CoreResult<string[]>>(
      (acc, fieldDefinition, index) => {
        if (fieldDefinition.valueType === 'component') {
          return acc.andThen((queue) => {
            if (fieldDefinition.ofComponents.length > 0) {
              return okAsync([...queue, ...fieldDefinition.ofComponents]);
            }
            return this.componentService.listAllIds(projectId).map((componentIds) => {
              resolvedFieldDefinitions[index] = {
                ...fieldDefinition,
                ofComponents: componentIds,
              };
              return [...queue, ...componentIds];
            });
          });
        }
        return acc;
      },
      okAsync([])
    );

    // BFS: load all referenced components into componentMap
    return resolveStep.andThen((initialQueue) => {
      const componentMap = new Map<string, FieldDefinition[]>();
      const queue = [...initialQueue];

      const processQueue = (): CoreResult<Map<string, FieldDefinition[]>> => {
        if (queue.length === 0) {
          return okAsync(componentMap);
        }

        const componentId = queue.shift()!;
        if (componentMap.has(componentId)) {
          return processQueue();
        }

        return this.componentService.read({
          projectId,
          id: componentId,
        }).andThen((component) => {
          componentMap.set(componentId, component.fieldDefinitions);

          for (const nestedFieldDef of component.fieldDefinitions) {
            if (nestedFieldDef.valueType === 'component') {
              for (const nestedComponentId of nestedFieldDef.ofComponents) {
                if (!componentMap.has(nestedComponentId)) {
                  queue.push(nestedComponentId);
                }
              }
            }
          }

          return processQueue();
        });
      };

      return processQueue().map(() => ({
        resolver: ((id: string) => {
          const fds = componentMap.get(id);
          if (!fds) {
            throw new Error(
              `Component "${id}" was not pre-loaded. This is an internal error.`
            );
          }
          return fds;
        }) as ComponentResolver,
        fieldDefinitions: resolvedFieldDefinitions,
      }));
    });
  }
}
