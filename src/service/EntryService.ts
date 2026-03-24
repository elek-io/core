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
  entryHistorySchema,
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
  private jsonFileService: JsonFileService;
  private gitService: GitService;
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
    super(serviceTypeSchema.enum.Entry, options, logService);

    this.coreVersion = coreVersion;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
    this.collectionService = collectionService;
    this.componentService = componentService;
  }

  /**
   * Creates a new Entry for given Collection
   */
  public async create<T extends Entry = Entry>(props: CreateEntryProps): Promise<T> {
    createEntrySchema.parse(props);

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

    // Validate all Values against their Field Definitions
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
    const validatedProps = createEntrySchemaFromFieldDefinitions.parse(props);

    const entryFile: EntryFile = {
      objectType: 'entry',
      id,
      coreVersion: this.coreVersion,
      values: validatedProps.values,
      created: datetime(),
      updated: null,
    };

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
  }

  /**
   * Returns an Entry from given Collection by ID
   *
   * If a commit hash is provided, the Entry is read from history
   */
  public async read<T extends Entry = Entry>(props: ReadEntryProps): Promise<T> {
    readEntrySchema.parse(props);

    if (!props.commitHash) {
      const entryFile: EntryFile = await this.jsonFileService.read(
        pathTo.entryFile(props.projectId, props.collectionId, props.id),
        entryFileSchema
      );

      return this.toEntry(entryFile) as T;
    } else {
      const entryFile = this.migrate(
        JSON.parse(
          await this.gitService.getFileContentAtCommit(
            pathTo.project(props.projectId),
            pathTo.entryFile(props.projectId, props.collectionId, props.id),
            props.commitHash
          )
        )
      );

      return this.toEntry(entryFile) as T;
    }
  }

  /**
   * Returns the commit history of an Entry
   */
  public async history(props: EntryHistoryProps): Promise<GitCommit[]> {
    entryHistorySchema.parse(props);

    return this.gitService.log(pathTo.project(props.projectId), {
      filePath: pathTo.entryFile(props.projectId, props.collectionId, props.id),
    });
  }

  /**
   * Updates an Entry of given Collection with new Values
   */
  public async update<T extends Entry = Entry>(props: UpdateEntryProps): Promise<T> {
    updateEntrySchema.parse(props);

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

    const prevEntryFile = await this.read({
      projectId: props.projectId,
      collectionId: props.collectionId,
      id: props.id,
    });

    // Validate all Values against their Field Definitions
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
    const validatedProps = updateEntrySchemaFromFieldDefinitions.parse(props);

    const entryFile: EntryFile = {
      ...prevEntryFile,
      values: validatedProps.values,
      updated: datetime(),
    };

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
  }

  /**
   * Deletes given Entry from it's Collection
   */
  public async delete(props: DeleteEntryProps): Promise<void> {
    deleteEntrySchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id
    );

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
  }

  public async list<T extends Entry = Entry>(props: ListEntriesProps): Promise<PaginatedList<T>> {
    listEntriesSchema.parse(props);

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

    const entries = await this.settleAndWarn(
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
  }

  public async count(props: CountEntriesProps): Promise<number> {
    countEntriesSchema.parse(props);

    return (
      await this.listReferences(
        objectTypeSchema.enum.entry,
        props.projectId,
        props.collectionId
      )
    ).length;
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
    const componentMap = new Map<string, FieldDefinition[]>();
    const resolvedFieldDefinitions = [...fieldDefinitions];

    // Collect all component IDs referenced by top-level dynamic fields
    const queue: string[] = [];

    for (const [index, fieldDefinition] of resolvedFieldDefinitions.entries()) {
      if (fieldDefinition.valueType === 'component') {
        const componentIds =
          fieldDefinition.ofComponents.length > 0
            ? fieldDefinition.ofComponents
            : await this.componentService.listAllIds(projectId);

        // Replace empty ofComponents with the resolved full list
        if (fieldDefinition.ofComponents.length === 0) {
          resolvedFieldDefinitions[index] = {
            ...fieldDefinition,
            ofComponents: componentIds,
          };
        }

        queue.push(...componentIds);
      }
    }

    // BFS: load all referenced components (and their nested references) into componentMap
    while (queue.length > 0) {
      const componentId = queue.shift()!;
      if (componentMap.has(componentId)) continue;

      const component = await this.componentService.read({
        projectId,
        id: componentId,
      });
      componentMap.set(componentId, component.fieldDefinitions);

      // Enqueue any nested component references
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
      resolver: (id: string) => {
        const fieldDefinitions = componentMap.get(id);
        if (!fieldDefinitions) {
          throw new Error(
            `Component "${id}" was not pre-loaded. This is an internal error.`
          );
        }
        return fieldDefinitions;
      },
      fieldDefinitions: resolvedFieldDefinitions,
    };
  }
}
