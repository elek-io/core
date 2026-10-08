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
import {
  componentIdsOf,
  preloadComponentResolver,
} from '../util/componentResolver.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { CollectionService } from './CollectionService.js';
import type { ComponentService } from './ComponentService.js';
import type { ReferenceService } from './ReferenceService.js';
import type { GitService } from './GitService.js';
import type { CacheService } from './CacheService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * An Entry is one JSON file inside its Collection's folder, and every mutation
 * commits it.
 *
 * The optional `T extends Entry` on `read`, `create`, `update` and `list` is
 * the caller's own narrowing claim and is never checked. Core validates
 * against `entryFileSchema`, and on a write against the Collection's field
 * definitions, nothing further.
 *
 * @see ../../docs/storage-layout.md
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
    cacheService: CacheService,
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
      jsonFileService,
      cacheService
    );

    this.coreVersion = coreVersion;
    this.collectionService = collectionService;
    this.componentService = componentService;
    this.referenceService = referenceService;
  }

  /**
   * Creates an Entry in the given Collection, then commits it.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * `BadRequest` when a Value fails the Collection's field definitions or
   * points at something that is not there, and `Conflict` when a unique field
   * repeats a value another Entry already holds. Nothing is written unless
   * all three pass, and a failure mid-write rolls the working tree back.
   *
   * @see ../../contributing/error-handling-internals.md
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
    await this.assertNotProvisioned('create', projectId);
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
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
          return this.toEntry(entryFile) as T;
        }, [entryFilePath]);
      }
    );
  }

  /**
   * Returns an Entry from given Collection by ID, and with `commitHash` the
   * version at that commit.
   *
   * A historical read parses the blob at that commit and runs it through
   * `migrate()`, so an Entry written by an older Core is upgraded in memory.
   * A normal read parses the file as stored and fails when it predates the
   * current schema.
   *
   * A missing Entry surfaces as `NotFound`.
   */
  public read<T extends Entry = Entry>(props: ReadEntryProps): Promise<T> {
    return this.validated('read', readEntrySchema, props, async () => {
      if (!props.commitHash) {
        const entryFile = await this.jsonFileService.read(
          this.pathTo.entryFile(props.projectId, props.collectionId, props.id),
          entryFileSchema
        );
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
        return this.toEntry(entryFile) as T;
      } else {
        const content = await this.gitService.getFileContentAtCommit(
          this.pathTo.project(props.projectId),
          this.pathTo.entryFile(props.projectId, props.collectionId, props.id),
          props.commitHash
        );
        const entryFile = this.migrate(JSON.parse(content));
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
        return this.toEntry(entryFile) as T;
      }
    });
  }

  /**
   * The git log scoped to that Entry's file, newest commit first, including
   * the commit that deleted the Entry.
   *
   * An id that never existed returns an empty array rather than throwing.
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
   * Replaces the Entry's Values wholesale and commits. Every field the
   * Collection defines has to be present, or the call is a `BadRequest`, and
   * `updated` is stamped on write.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * `BadRequest` when a Value fails the field definitions or points at
   * something that is not there, and `Conflict` when a unique field repeats
   * another Entry's value. A failure mid-write rolls the working tree back.
   *
   * @see ../../contributing/error-handling-internals.md
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
    await this.assertNotProvisioned('update', projectId);
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
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
          return this.toEntry(entryFile) as T;
        });
      }
    );
  }

  /**
   * Deletes the Entry from its Collection and commits the removal.
   *
   * Blocked when another Entry's values still reference it, through a flat
   * reference field, an mdast node, or a reference nested in a
   * `dynamic`/component block. That raises `Conflict` with the referring
   * Entries as its cause. A self-reference does not block.
   *
   * @see ../../contributing/error-handling-internals.md
   */
  public delete(props: DeleteEntryProps): Promise<void> {
    return this.mutating('delete', deleteEntrySchema, props, async () => {
      await this.assertNotProvisioned('delete', props.projectId);

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
        await this.jsonFileService.delete(entryFilePath);
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

  /**
   * One page of a Collection's Entries, in directory read order rather than
   * any sort.
   *
   * `limit` defaults to 15 and `limit: 0` returns every Entry from `offset`.
   * `total` counts the Entry files in the Collection rather than the page,
   * and an Entry that fails to read is dropped with a logged warning instead
   * of failing the call, so `list` can be shorter than both.
   */
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

  /**
   * Counts the Entry files in the Collection folder, skipping
   * `collection.json`, without parsing any of them. One directory read, so it
   * can exceed the number of Entries `list` manages to return.
   *
   * Throws `NotFound` for a Collection that is not there, rather than
   * answering 0.
   */
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
   * A full, deep `entrySchema` parse that never throws and returns false
   * instead.
   *
   * It checks no Values against any Collection's field definitions, so an
   * object can pass here and still be rejected by `create` or `update`.
   */
  public isEntry(obj: unknown): obj is Entry {
    return entrySchema.safeParse(obj).success;
  }

  /**
   * Migrates a potentially outdated Entry file to the current schema.
   *
   * Throws `BadRequest` when the file does not match what Core expects, with
   * the underlying `ZodError` as its cause, and `VersionSkew` when it was
   * written by a newer Core than the one installed. Reads no disk.
   */
  public migrate(potentiallyOutdatedEntryFile: unknown): EntryFile {
    return migrateEntryFile(this.coreVersion, potentiallyOutdatedEntryFile);
  }

  /**
   * The one seam between the on-disk `EntryFile` and the returned `Entry`,
   * kept so the two can diverge. Today it is a plain spread, and Values come
   * back exactly as stored.
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
   * Pre-loads every Component the given field definitions reach, transitively,
   * and returns a synchronous `ComponentResolver` for schema generation.
   *
   * A top-level dynamic field with an empty `ofComponents` is expanded: the
   * Project's Components are loaded and the returned definition carries the
   * full id list. The walk does not rewrite a dynamic field nested inside a
   * Component, so an empty nested `ofComponents` stays empty and the schema
   * falls back to its permissive record item schema.
   */
  private async buildComponentResolver(
    fieldDefinitions: FieldDefinition[],
    projectId: string
  ): Promise<{
    resolver: ComponentResolver;
    fieldDefinitions: FieldDefinition[];
  }> {
    const resolvedFieldDefinitions = [...fieldDefinitions];

    for (let index = 0; index < resolvedFieldDefinitions.length; index++) {
      const fieldDefinition = resolvedFieldDefinitions[index]!;
      if (
        fieldDefinition.valueType === 'component' &&
        fieldDefinition.ofComponents.length === 0
      ) {
        resolvedFieldDefinitions[index] = {
          ...fieldDefinition,
          ofComponents: await this.componentService.listAllIds(projectId),
        };
      }
    }

    const resolver = await preloadComponentResolver(
      componentIdsOf(resolvedFieldDefinitions),
      async (componentId) => {
        const component = await this.componentService.read({
          projectId,
          id: componentId,
        });
        return component.fieldDefinitions;
      }
    );

    return { resolver, fieldDefinitions: resolvedFieldDefinitions };
  }
}
