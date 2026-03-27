import Fs from 'fs-extra';
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
import { datetime, uuid, CoreError } from '../util/shared.js';
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
    super(
      serviceTypeSchema.enum.Entry,
      options,
      logService,
      gitService,
      jsonFileService
    );

    this.coreVersion = coreVersion;
    this.collectionService = collectionService;
    this.componentService = componentService;
  }

  /**
   * Creates a new Entry for given Collection
   */
  public create<T extends Entry = Entry>(props: CreateEntryProps): Promise<T> {
    return this.validated('create', createEntrySchema, props, async () => {
      const id = uuid();
      const projectPath = pathTo.project(props.projectId);
      const entryFilePath = pathTo.entryFile(
        props.projectId,
        props.collectionId,
        id
      );

      const collection = await this.collectionService.read({
        projectId: props.projectId,
        id: props.collectionId,
      });

      const { resolver: componentResolver, fieldDefinitions } =
        await this.buildComponentResolver(
          flattenFieldDefinitions(collection.fieldDefinitions),
          props.projectId
        );

      const createEntrySchemaFromFieldDefinitions =
        getCreateEntrySchemaFromFieldDefinitions(
          fieldDefinitions,
          componentResolver
        );
      const validatedResult =
        createEntrySchemaFromFieldDefinitions.safeParse(props);
      if (!validatedResult.success) {
        throw CoreError.badRequest('Validation failed', validatedResult.error);
      }
      const validatedProps = validatedResult.data;

      const entryFile: EntryFile = {
        objectType: 'entry',
        id,
        coreVersion: this.coreVersion,
        values: validatedProps.values,
        created: datetime(),
        updated: null,
      };

      return this.withGitRollback(projectPath, async () => {
        await this.jsonFileService.create(
          entryFile,
          entryFilePath,
          entryFileSchema
        );
        await this.gitService.add(projectPath, [entryFilePath]);
        await this.gitService.commit(projectPath, {
          method: 'create',
          reference: {
            objectType: 'entry',
            id: entryFile.id,
            collectionId: props.collectionId,
          },
        });
        return this.toEntry(entryFile) as T;
      }, [entryFilePath]);
    });
  }

  /**
   * Returns an Entry from given Collection by ID
   *
   * If a commit hash is provided, the Entry is read from history
   */
  public read<T extends Entry = Entry>(props: ReadEntryProps): Promise<T> {
    return this.validated('read', readEntrySchema, props, async () => {
      if (!props.commitHash) {
        const entryFile = await this.jsonFileService.read(
          pathTo.entryFile(props.projectId, props.collectionId, props.id),
          entryFileSchema
        );
        return this.toEntry(entryFile) as T;
      } else {
        const content = await this.gitService.getFileContentAtCommit(
          pathTo.project(props.projectId),
          pathTo.entryFile(props.projectId, props.collectionId, props.id),
          props.commitHash
        );
        const entryFile = this.migrate(JSON.parse(content));
        return this.toEntry(entryFile) as T;
      }
    });
  }

  /**
   * Returns the commit history of an Entry
   */
  public history(props: EntryHistoryProps): Promise<GitCommit[]> {
    return this.validated('history', entryHistorySchema, props, async () => {
      return this.gitService.log(pathTo.project(props.projectId), {
        filePath: pathTo.entryFile(
          props.projectId,
          props.collectionId,
          props.id
        ),
      });
    });
  }

  /**
   * Updates an Entry of given Collection with new Values
   */
  public update<T extends Entry = Entry>(props: UpdateEntryProps): Promise<T> {
    return this.validated('update', updateEntrySchema, props, async () => {
      const projectPath = pathTo.project(props.projectId);
      const entryFilePath = pathTo.entryFile(
        props.projectId,
        props.collectionId,
        props.id
      );

      const collection = await this.collectionService.read({
        projectId: props.projectId,
        id: props.collectionId,
      });

      const prevEntryFile = await this.read<T>({
        projectId: props.projectId,
        collectionId: props.collectionId,
        id: props.id,
      });

      const { resolver: componentResolver, fieldDefinitions } =
        await this.buildComponentResolver(
          flattenFieldDefinitions(collection.fieldDefinitions),
          props.projectId
        );

      const updateEntrySchemaFromFieldDefinitions =
        getUpdateEntrySchemaFromFieldDefinitions(
          fieldDefinitions,
          componentResolver
        );
      const validatedResult =
        updateEntrySchemaFromFieldDefinitions.safeParse(props);
      if (!validatedResult.success) {
        throw CoreError.badRequest('Validation failed', validatedResult.error);
      }
      const validatedProps = validatedResult.data;

      const entryFile: EntryFile = {
        ...prevEntryFile,
        values: validatedProps.values,
        updated: datetime(),
      };

      return this.withGitRollback(projectPath, async () => {
        await this.jsonFileService.update(
          entryFile,
          entryFilePath,
          entryFileSchema
        );
        await this.gitService.add(projectPath, [entryFilePath]);
        await this.gitService.commit(projectPath, {
          method: 'update',
          reference: {
            objectType: 'entry',
            id: entryFile.id,
            collectionId: props.collectionId,
          },
        });
        return this.toEntry(entryFile) as T;
      });
    });
  }

  /**
   * Deletes given Entry from it's Collection
   */
  public delete(props: DeleteEntryProps): Promise<void> {
    return this.validated('delete', deleteEntrySchema, props, async () => {
      const projectPath = pathTo.project(props.projectId);
      const entryFilePath = pathTo.entryFile(
        props.projectId,
        props.collectionId,
        props.id
      );

      return this.withGitRollback(projectPath, async () => {
        await Fs.remove(entryFilePath);
        await this.gitService.add(projectPath, [entryFilePath]);
        await this.gitService.commit(projectPath, {
          method: 'delete',
          reference: {
            objectType: 'entry',
            id: props.id,
            collectionId: props.collectionId,
          },
        });
      });
    });
  }

  public list<T extends Entry = Entry>(
    props: ListEntriesProps
  ): Promise<PaginatedList<T>> {
    return this.validated('list', listEntriesSchema, props, async () => {
      const offset = props.offset || 0;
      const limit = props.limit ?? 15;

      const entryReferences = await this.listReferences(
        objectTypeSchema.enum.entry,
        props.projectId,
        props.collectionId
      );
      const partialEntryReferences =
        limit === 0
          ? entryReferences.slice(offset)
          : entryReferences.slice(offset, offset + limit);

      const entries = await this.collectResults(
        partialEntryReferences.map((reference) => {
          return this.read<T>({
            projectId: props.projectId,
            collectionId: props.collectionId,
            id: reference.id,
          });
        })
      );
      return {
        total: entryReferences.length,
        limit,
        offset,
        list: entries,
      };
    });
  }

  public count(props: CountEntriesProps): Promise<number> {
    return this.validated('count', countEntriesSchema, props, async () => {
      const entryReferences = await this.listReferences(
        objectTypeSchema.enum.entry,
        props.projectId,
        props.collectionId
      );
      return entryReferences.length;
    });
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
  private async buildComponentResolver(
    fieldDefinitions: FieldDefinition[],
    projectId: string
  ): Promise<{
    resolver: ComponentResolver;
    fieldDefinitions: FieldDefinition[];
  }> {
    const resolvedFieldDefinitions = [...fieldDefinitions];

    // First pass: resolve empty ofComponents arrays by loading all component IDs
    const initialQueue: string[] = [];
    for (let index = 0; index < resolvedFieldDefinitions.length; index++) {
      const fieldDefinition = resolvedFieldDefinitions[index]!;
      if (fieldDefinition.valueType === 'component') {
        if (fieldDefinition.ofComponents.length > 0) {
          initialQueue.push(...fieldDefinition.ofComponents);
        } else {
          const componentIds =
            await this.componentService.listAllIds(projectId);
          resolvedFieldDefinitions[index] = {
            ...fieldDefinition,
            ofComponents: componentIds,
          };
          initialQueue.push(...componentIds);
        }
      }
    }

    // BFS: load all referenced components into componentMap
    const componentMap = new Map<string, FieldDefinition[]>();
    const queue = [...initialQueue];

    while (queue.length > 0) {
      const componentId = queue.shift()!;
      if (componentMap.has(componentId)) {
        continue;
      }

      const component = await this.componentService.read({
        projectId,
        id: componentId,
      });
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
    }

    return {
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
    };
  }
}
