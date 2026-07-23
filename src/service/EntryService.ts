import Fs from 'fs-extra';
import { z } from '@hono/zod-openapi';
import {
  countEntriesSchema,
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
  uuidSchema,
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
  type Value,
  type UniqueValueConflict,
} from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import { migrateEntryFile } from './migrations/index.js';
import {
  detectUniqueValueCollisions,
  getUniqueFieldDefinitions,
} from '../util/uniqueFieldValues.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { CollectionService } from './CollectionService.js';
import type { ComponentService } from './ComponentService.js';
import type { ReferenceService } from './ReferenceService.js';
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
  private referenceService: ReferenceService;

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    collectionService: CollectionService,
    componentService: ComponentService,
    referenceService: ReferenceService
  ) {
    super(
      serviceTypeSchema.enum.Entry,
      options,
      pathTo,
      logService,
      gitService,
      jsonFileService
    );

    this.coreVersion = coreVersion;
    this.collectionService = collectionService;
    this.componentService = componentService;
    this.referenceService = referenceService;
  }

  /**
   * Creates a new Entry for given Collection
   */
  public async create<T extends Entry = Entry>(
    props: CreateEntryProps
  ): Promise<T> {
    this.assertNotReadOnly('create');
    const { projectId, collectionId } = this.parseOrThrow(
      'create',
      z.object({ projectId: uuidSchema, collectionId: uuidSchema }),
      props
    );
    const languages = await this.readProjectLanguages(projectId);
    const collection = await this.collectionService.read({
      projectId,
      id: collectionId,
    });
    const { resolver: componentResolver, fieldDefinitions } =
      await this.buildComponentResolver(
        flattenFieldDefinitions(collection.fieldDefinitions),
        projectId
      );

    return this.mutating(
      'create',
      getCreateEntrySchemaFromFieldDefinitions(
        fieldDefinitions,
        languages,
        componentResolver
      ),
      props,
      async (validatedProps) => {
        const refIssues = await this.referenceService.validateValueReferences(
          validatedProps.values,
          fieldDefinitions,
          validatedProps.projectId,
          componentResolver
        );
        if (refIssues.length > 0) {
          throw CoreError.badRequest('Entry contains invalid references', {
            issues: refIssues,
          });
        }

        const id = uuid();
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const entryFilePath = this.pathTo.entryFile(
          validatedProps.projectId,
          validatedProps.collectionId,
          id
        );

        const entryFile: EntryFile = {
          objectType: 'entry',
          id,
          coreVersion: this.coreVersion,
          values: validatedProps.values,
          created: datetime(),
          updated: null,
        };

        // Enforce unique field values before writing anything
        const conflicts = await this.findUniqueValueConflicts(
          validatedProps.projectId,
          validatedProps.collectionId,
          fieldDefinitions,
          id,
          validatedProps.values
        );
        if (conflicts.length > 0) {
          throw CoreError.conflict(
            'Entry contains values that must be unique',
            conflicts
          );
        }

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
              collectionId: validatedProps.collectionId,
            },
          });
          return this.toEntry(entryFile) as T;
        }, [entryFilePath]);
      }
    );
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
          this.pathTo.entryFile(props.projectId, props.collectionId, props.id),
          entryFileSchema
        );
        return this.toEntry(entryFile) as T;
      } else {
        const content = await this.gitService.getFileContentAtCommit(
          this.pathTo.project(props.projectId),
          this.pathTo.entryFile(props.projectId, props.collectionId, props.id),
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
      return this.gitService.log(this.pathTo.project(props.projectId), {
        filePath: this.pathTo.entryFile(
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
  public async update<T extends Entry = Entry>(
    props: UpdateEntryProps
  ): Promise<T> {
    this.assertNotReadOnly('update');
    const { projectId, collectionId } = this.parseOrThrow(
      'update',
      z.object({ projectId: uuidSchema, collectionId: uuidSchema }),
      props
    );
    const languages = await this.readProjectLanguages(projectId);
    const collection = await this.collectionService.read({
      projectId,
      id: collectionId,
    });
    const { resolver: componentResolver, fieldDefinitions } =
      await this.buildComponentResolver(
        flattenFieldDefinitions(collection.fieldDefinitions),
        projectId
      );

    return this.mutating(
      'update',
      getUpdateEntrySchemaFromFieldDefinitions(
        fieldDefinitions,
        languages,
        componentResolver
      ),
      props,
      async (validatedProps) => {
        const refIssues = await this.referenceService.validateValueReferences(
          validatedProps.values,
          fieldDefinitions,
          validatedProps.projectId,
          componentResolver
        );
        if (refIssues.length > 0) {
          throw CoreError.badRequest('Entry contains invalid references', {
            issues: refIssues,
          });
        }

        const projectPath = this.pathTo.project(validatedProps.projectId);
        const entryFilePath = this.pathTo.entryFile(
          validatedProps.projectId,
          validatedProps.collectionId,
          validatedProps.id
        );

        const prevEntryFile = await this.read<T>({
          projectId: validatedProps.projectId,
          collectionId: validatedProps.collectionId,
          id: validatedProps.id,
        });

        const entryFile: EntryFile = {
          ...prevEntryFile,
          values: validatedProps.values,
          updated: datetime(),
        };

        // Enforce unique field values, ignoring this Entry's own values
        const conflicts = await this.findUniqueValueConflicts(
          validatedProps.projectId,
          validatedProps.collectionId,
          fieldDefinitions,
          validatedProps.id,
          validatedProps.values
        );
        if (conflicts.length > 0) {
          throw CoreError.conflict(
            'Entry contains values that must be unique',
            conflicts
          );
        }

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
              collectionId: validatedProps.collectionId,
            },
          });
          return this.toEntry(entryFile) as T;
        });
      }
    );
  }

  /**
   * Deletes given Entry from it's Collection
   *
   * Blocks deletion if the Entry is still referenced by another Entry's values
   * (a flat reference field, an mdast node, or a reference nested in a
   * `dynamic`/component block). A self-reference does not block.
   */
  public delete(props: DeleteEntryProps): Promise<void> {
    return this.mutating('delete', deleteEntrySchema, props, async () => {
      const referencingEntries =
        await this.referenceService.findEntriesReferencing({
          projectId: props.projectId,
          collectionId: props.collectionId,
          entryId: props.id,
        });
      if (referencingEntries.length > 0) {
        const list = referencingEntries
          .map((r) => `Entry "${r.entryId}" (Collection "${r.collectionId}")`)
          .join(', ');
        throw CoreError.conflict(
          `Cannot delete Entry "${props.id}": it is still referenced by ${list}`,
          referencingEntries
        );
      }

      const projectPath = this.pathTo.project(props.projectId);
      const entryFilePath = this.pathTo.entryFile(
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
  public migrate(potentiallyOutdatedEntryFile: unknown): EntryFile {
    return migrateEntryFile(this.coreVersion, potentiallyOutdatedEntryFile);
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
   * Finds the unique-value conflicts a write of `values` (for `entryId`) would
   * cause within its Collection. Uniqueness is enforced by scanning the
   * Collection's Entries on each write rather than via a persisted index, so the
   * check is always correct for whatever is currently on disk (including Entries
   * brought in by a pull or merge, which never passed through this service).
   *
   * Returns one conflict per (field, language, value) the candidate shares with
   * another Entry. Empty when the write is allowed.
   */
  private async findUniqueValueConflicts(
    projectId: string,
    collectionId: string,
    fieldDefinitions: FieldDefinition[],
    entryId: string,
    values: Record<string, Value>
  ): Promise<UniqueValueConflict[]> {
    // Nothing to enforce if the Collection has no unique fields
    if (getUniqueFieldDefinitions(fieldDefinitions).length === 0) {
      return [];
    }

    const entries: Array<{ entryId: string; values: Record<string, Value> }> = [
      { entryId, values },
    ];

    for (const entryReference of await this.listReferences(
      'entry',
      projectId,
      collectionId
    )) {
      const otherId = entryReference.id;
      if (otherId === entryId) {
        continue;
      }
      const otherEntryPath = this.pathTo.entryFile(
        projectId,
        collectionId,
        otherId
      );
      const otherEntry =
        await this.referenceService.readEntryFileMigrating(otherEntryPath);
      entries.push({ entryId: otherId, values: otherEntry.values });
    }

    const conflicts: UniqueValueConflict[] = [];
    for (const collision of detectUniqueValueCollisions(
      fieldDefinitions,
      entries
    )) {
      if (!collision.entryIds.includes(entryId)) {
        continue;
      }
      const conflictingEntryId = collision.entryIds.find(
        (id) => id !== entryId
      );
      if (conflictingEntryId !== undefined) {
        conflicts.push({
          collectionId,
          fieldDefinitionId: collision.fieldDefinitionId,
          fieldSlug: collision.fieldSlug,
          language: collision.language,
          value: collision.value,
          conflictingEntryId,
        });
      }
    }
    return conflicts;
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
