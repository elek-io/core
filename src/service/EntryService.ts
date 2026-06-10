import Fs from 'fs-extra';
import { z } from '@hono/zod-openapi';
import {
  assetFileSchema,
  countEntriesSchema,
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
  uuidSchema,
  entryHistorySchema,
  type AssetFieldDefinition,
  type EntryFieldDefinition,
  type CountEntriesProps,
  type CreateEntryProps,
  type CrudServiceWithListCount,
  type DeleteEntryProps,
  type ElekIoCoreOptions,
  type Entry,
  type EntryFile,
  type EntryReferenceIssue,
  type EntryReferenceIssueLocation,
  type ReferenceComponentPathSegment,
  type ReferencingEntry,
  type ListEntriesProps,
  type MdAstAssetReference,
  type MdAstEntryReference,
  type MdAstRoot,
  type PaginatedList,
  type ReadEntryProps,
  type SupportedLanguage,
  type UpdateEntryProps,
  type EntryHistoryProps,
  type GitCommit,
  type FieldDefinition,
  type ComponentResolver,
  type Value,
  type Uuid,
  type UniqueValueConflict,
} from '../schema/index.js';
import { applyMigrations, entryMigrations } from './migrations/index.js';
import { pathTo } from '../util/node.js';
import {
  detectUniqueValueCollisions,
  getUniqueFieldDefinitions,
} from '../util/uniqueFieldValues.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
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
  public async create<T extends Entry = Entry>(
    props: CreateEntryProps
  ): Promise<T> {
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

    return this.validated(
      'create',
      getCreateEntrySchemaFromFieldDefinitions(
        fieldDefinitions,
        languages,
        componentResolver
      ),
      props,
      async (validatedProps) => {
        const refIssues = await this.validateValueReferences(
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
        const projectPath = pathTo.project(validatedProps.projectId);
        const entryFilePath = pathTo.entryFile(
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
  public async update<T extends Entry = Entry>(
    props: UpdateEntryProps
  ): Promise<T> {
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

    return this.validated(
      'update',
      getUpdateEntrySchemaFromFieldDefinitions(
        fieldDefinitions,
        languages,
        componentResolver
      ),
      props,
      async (validatedProps) => {
        const refIssues = await this.validateValueReferences(
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

        const projectPath = pathTo.project(validatedProps.projectId);
        const entryFilePath = pathTo.entryFile(
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
    return this.validated('delete', deleteEntrySchema, props, async () => {
      const referencingEntries = await this.findEntriesReferencing({
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

  /**
   * Finds every Entry in the Project whose values still reference the given
   * target (an Asset, another Entry, or a whole Collection). Used by Asset,
   * Entry and Collection delete to block deletions that would otherwise leave
   * dangling references behind.
   *
   * Scans every Entry in every Collection on demand (mirroring
   * `findUniqueValueConflicts`) rather than maintaining a persisted reverse
   * index, which would go stale on a git pull/merge. Outdated Entry files
   * brought in by a pull/merge are upgraded through the migration chain so
   * their values are read instead of throwing.
   *
   * Self-references never block. For an Entry target, that Entry is skipped.
   * For a Collection target, every Entry inside it is skipped, since the whole
   * doomed set is being deleted and references between its Entries vanish
   * cleanly. A Collection target matches any reference pointing into it,
   * identified by the `collectionId` every Entry reference carries, plus a
   * direct reference to the Collection as a whole. Returns one record per
   * referring Entry (first match within that Entry).
   */
  public async findEntriesReferencing(
    target: ReferenceTarget
  ): Promise<ReferencingEntry[]> {
    const results: ReferencingEntry[] = [];

    for (const collectionReference of await this.listReferences(
      objectTypeSchema.enum.collection,
      target.projectId
    )) {
      const collectionId = collectionReference.id;

      // For a Collection-delete target, every Entry inside the doomed Collection
      // is being removed too, so any reference it holds vanishes cleanly and
      // must not block. Skip the whole Collection as a source.
      if (
        'collectionId' in target &&
        !('entryId' in target) &&
        collectionId === target.collectionId
      ) {
        continue;
      }

      for (const entryReference of await this.listReferences(
        objectTypeSchema.enum.entry,
        target.projectId,
        collectionId
      )) {
        const entryId = entryReference.id;

        // A self-reference must not block the Entry's own deletion.
        if (
          'entryId' in target &&
          entryId === target.entryId &&
          collectionId === target.collectionId
        ) {
          continue;
        }

        const entryFilePath = pathTo.entryFile(
          target.projectId,
          collectionId,
          entryId
        );
        let entryFile: EntryFile;
        try {
          entryFile = await this.jsonFileService.read(
            entryFilePath,
            entryFileSchema
          );
        } catch (error) {
          // Only a schema-shape mismatch means an outdated file. A corrupt
          // file, a permission error or an ENOENT race is a real failure.
          if (!(error instanceof z.ZodError)) {
            throw error;
          }
          entryFile = this.migrate(
            await this.jsonFileService.unsafeRead(entryFilePath)
          );
        }

        const match = this.findMatchingReference(entryFile.values, target);
        if (match) {
          results.push({
            collectionId,
            entryId,
            fieldSlug: match.fieldSlug,
            via: match.via,
            componentPath: match.componentPath,
          });
        }
      }
    }

    return results;
  }

  /**
   * Returns the first reference within `values` that points at `target`, or
   * `undefined` if none do. Walks flat reference fields, mdast nodes and
   * references nested inside `dynamic`/component items alike.
   *
   * Discriminates the three target shapes in order: an Asset (`assetId`), a
   * single Entry (`entryId`), or a whole Collection (neither). The Collection
   * case matches any Entry reference whose `collectionId` is the target, plus a
   * direct reference to the Collection as a whole.
   */
  private findMatchingReference(
    values: Record<string, Value>,
    target: ReferenceTarget
  ): FoundReference | undefined {
    for (const [fieldSlug, value] of Object.entries(values)) {
      for (const ref of collectReferencesInValue(value, fieldSlug, [])) {
        if ('assetId' in target) {
          if (ref.refKind === 'asset' && ref.id === target.assetId) {
            return ref;
          }
        } else if ('entryId' in target) {
          if (
            ref.refKind === 'entry' &&
            ref.id === target.entryId &&
            ref.collectionId === target.collectionId
          ) {
            return ref;
          }
        } else {
          if (
            ref.refKind === 'entry' &&
            ref.collectionId === target.collectionId
          ) {
            return ref;
          }
          if (ref.refKind === 'collection' && ref.id === target.collectionId) {
            return ref;
          }
        }
      }
    }
    return undefined;
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
      const otherEntryPath = pathTo.entryFile(projectId, collectionId, otherId);
      let otherEntry: EntryFile;
      try {
        // Fast path: a current-version file parses directly (and is cached)
        otherEntry = await this.jsonFileService.read(
          otherEntryPath,
          entryFileSchema
        );
      } catch (error) {
        // Only a schema-shape mismatch means an outdated file. A corrupt file,
        // a permission error or an ENOENT race is a real failure, so surface it
        // instead of masking it behind a migrate of unsafely-read content.
        if (!(error instanceof z.ZodError)) {
          throw error;
        }
        // Older Entries (for example brought in by a pull or merge) may predate
        // the current schema. Upgrade them through the migration chain so the
        // scan reads their values instead of throwing on an outdated file.
        otherEntry = this.migrate(
          await this.jsonFileService.unsafeRead(otherEntryPath)
        );
      }
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
   * Validates cross-entity reference targets on an Entry's values. Runs
   * AFTER the per-field Zod schema has accepted the structural shape, as
   * the first step inside the `create` / `update` callback bodies.
   *
   * What this checks (and the schema does not):
   *   - Each referenced Asset's file exists on disk.
   *   - Each referenced Asset's `mimeType` is in the field's
   *     `ofAssetMimeTypes` allowlist (when non-empty).
   *   - Each referenced Entry's file exists at the claimed
   *     `<projectId>/<collectionId>/<entryId>` path.
   *
   * What the schema layer already enforces (not re-checked here):
   *   - Tree shape, allowed node types, allowed heading depths.
   *   - `ofCollections` on `entryReference` claims (cheap structural check
   *     using the `collectionId` already carried in the ref).
   *
   * Why `jsonFileService.read` directly instead of
   * `assetService.read` / `this.read`:
   *   - `AbstractService.validated` logs every `CoreError` before
   *     re-throwing. For 10 references with 1 missing, the public read
   *     path would emit a misleading `[NotFound] (Entry.read) …` log
   *     line at the service boundary for an expected validator outcome.
   *   - No need to re-run Zod on the input UUIDs (already validated by
   *     the outer `create`/`update` schema).
   *   - No recursive `validated()` nesting.
   *
   * The path-keyed cache on `JsonFileService` absorbs the duplicate-read
   * case (one Asset referenced N times = 1 disk hit + cache reuse).
   *
   * This is the FORWARD reference gate (per Entry, on write). It walks the
   * value tree driven by `fieldDefinitions` because it also enforces rules
   * the reverse gate has no use for (`ofAssetMimeTypes`, descent through the
   * `ComponentResolver`). The REVERSE gate (`findEntriesReferencing` then
   * `collectReferencesInValue`) walks the same tree value-only, to extract
   * reference ids for delete protection. The two stay separate on purpose.
   * They already share the mdast carrier `collectMdAstRefs`.
   */
  private async validateValueReferences(
    values: Record<string, Value>,
    fieldDefinitions: FieldDefinition[],
    projectId: string,
    resolver: ComponentResolver,
    componentPath: ReferenceComponentPathSegment[] = []
  ): Promise<EntryReferenceIssue[]> {
    const issues: EntryReferenceIssue[] = [];

    for (const fieldDef of fieldDefinitions) {
      const value = values[fieldDef.slug];
      if (value === undefined) continue;

      if (
        fieldDef.valueType === 'reference' &&
        value.valueType === 'reference'
      ) {
        await this.collectFlatReferenceIssues(
          value,
          fieldDef,
          projectId,
          issues,
          componentPath
        );
      } else if (
        fieldDef.valueType === 'mdast' &&
        value.valueType === 'mdast'
      ) {
        await this.collectMdAstReferenceIssues(
          value,
          fieldDef,
          projectId,
          issues,
          componentPath
        );
      } else if (
        fieldDef.valueType === 'component' &&
        value.valueType === 'component'
      ) {
        // Descend into each dynamic block item, validating its nested values
        // against the item's Component field definitions.
        for (const item of value.content) {
          issues.push(
            ...(await this.validateValueReferences(
              item.values,
              resolver(item.componentId),
              projectId,
              resolver,
              [
                ...componentPath,
                {
                  fieldSlug: fieldDef.slug,
                  itemId: item.id,
                  componentId: item.componentId,
                },
              ]
            ))
          );
        }
      }
    }

    return issues;
  }

  /**
   * Walks each language slot of a flat reference field's value, checking
   * each Entry / Asset reference against the filesystem.
   */
  private async collectFlatReferenceIssues(
    value: Extract<Value, { valueType: 'reference' }>,
    fieldDef: AssetFieldDefinition | EntryFieldDefinition,
    projectId: string,
    issues: EntryReferenceIssue[],
    componentPath: ReferenceComponentPathSegment[]
  ): Promise<void> {
    const allowedMimeTypes =
      fieldDef.fieldType === 'asset' ? fieldDef.ofAssetMimeTypes : null;

    for (const [language, refs] of Object.entries(value.content)) {
      if (!refs) continue;
      const lang = language as SupportedLanguage;

      for (let index = 0; index < refs.length; index++) {
        const ref = refs[index];
        if (ref === undefined) continue;

        if (ref.objectType === 'asset') {
          await this.checkAsset({
            projectId,
            assetId: ref.id,
            allowedMimeTypes,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath: [],
              index,
              componentPath,
            },
            issues,
          });
        } else if (ref.objectType === 'entry') {
          await this.checkEntry({
            projectId,
            collectionId: ref.collectionId,
            entryId: ref.id,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath: [],
              index,
              componentPath,
            },
            issues,
          });
        }
      }
    }
  }

  /**
   * Walks each language's mdast tree, checking every
   * `entryReference` / `assetReference` node against the filesystem.
   */
  private async collectMdAstReferenceIssues(
    value: Extract<Value, { valueType: 'mdast' }>,
    fieldDef: { slug: string; ofAssetMimeTypes: string[] },
    projectId: string,
    issues: EntryReferenceIssue[],
    componentPath: ReferenceComponentPathSegment[]
  ): Promise<void> {
    for (const [language, root] of Object.entries(value.content)) {
      if (!root) continue;
      const lang = language as SupportedLanguage;

      for (const { node, treePath } of collectMdAstRefs(root)) {
        if (node.type === 'assetReference') {
          await this.checkAsset({
            projectId,
            assetId: node.assetId,
            allowedMimeTypes: fieldDef.ofAssetMimeTypes,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath,
              index: null,
              componentPath,
            },
            issues,
          });
        } else {
          // node.type === 'entryReference'
          await this.checkEntry({
            projectId,
            collectionId: node.collectionId,
            entryId: node.entryId,
            location: {
              fieldSlug: fieldDef.slug,
              language: lang,
              treePath,
              index: null,
              componentPath,
            },
            issues,
          });
        }
      }
    }
  }

  /**
   * Reads an Asset's file directly via JsonFileService (bypassing
   * `AssetService.read`'s `validated()` wrapper to avoid log noise on
   * expected NotFound outcomes) and classifies the result.
   */
  private async checkAsset(params: {
    projectId: string;
    assetId: string;
    allowedMimeTypes: string[] | null;
    location: EntryReferenceIssueLocation;
    issues: EntryReferenceIssue[];
  }): Promise<void> {
    const { projectId, assetId, allowedMimeTypes, location, issues } = params;
    try {
      const assetFile = await this.jsonFileService.read(
        pathTo.assetFile(projectId, assetId),
        assetFileSchema
      );
      if (
        allowedMimeTypes !== null &&
        allowedMimeTypes.length > 0 &&
        !allowedMimeTypes.includes(assetFile.mimeType)
      ) {
        issues.push({
          kind: 'asset_mime_mismatch',
          ...location,
          assetId,
          expectedMimeTypes: allowedMimeTypes,
          actualMimeType: assetFile.mimeType,
        });
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        issues.push({
          kind: 'reference_not_found',
          ...location,
          refKind: 'asset',
          refId: assetId,
          collectionId: null,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Reads an Entry's file directly via JsonFileService (bypassing
   * `EntryService.read`'s `validated()` wrapper to avoid log noise on
   * expected NotFound outcomes) and classifies the result.
   */
  private async checkEntry(params: {
    projectId: string;
    collectionId: string;
    entryId: string;
    location: EntryReferenceIssueLocation;
    issues: EntryReferenceIssue[];
  }): Promise<void> {
    const { projectId, collectionId, entryId, location, issues } = params;
    try {
      await this.jsonFileService.read(
        pathTo.entryFile(projectId, collectionId, entryId),
        entryFileSchema
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        issues.push({
          kind: 'reference_not_found',
          ...location,
          refKind: 'entry',
          refId: entryId,
          collectionId,
        });
        return;
      }
      throw error;
    }
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

//
// Helpers for cross-entity reference validation
//

/**
 * `CoreError.notFound` predicate. `JsonFileService.read` wraps the
 * underlying ENOENT in `CoreError.notFound` (via `CoreError.fromUnknown`
 * — but actually the read path throws directly when the file is absent;
 * see `JsonFileService.read`'s `Fs.readFile` call). We catch both shapes
 * defensively.
 */
function isNotFoundError(error: unknown): boolean {
  if (error instanceof CoreError && error.type === 'NotFound') {
    return true;
  }
  // Node's fs errors carry a `code` property.
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT'
  ) {
    return true;
  }
  return false;
}

/**
 * Returns every `entryReference` and `assetReference` node in an mdast
 * tree, along with the path of `children` indices from the root to the
 * node. Used by `EntryService.validateValueReferences` to report the
 * location of problematic references.
 *
 * Hand-rolled because we need each node's index-path (the sequence of
 * `children` indices from the root), which the unist visitor APIs do not
 * provide directly.
 */
function collectMdAstRefs(root: MdAstRoot): Array<{
  node: MdAstEntryReference | MdAstAssetReference;
  treePath: number[];
}> {
  const result: Array<{
    node: MdAstEntryReference | MdAstAssetReference;
    treePath: number[];
  }> = [];

  function isMdAstNode(value: unknown): value is { type: string } {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  function isEntryReference(node: {
    type: string;
  }): node is MdAstEntryReference {
    return node.type === 'entryReference';
  }

  function isAssetReference(node: {
    type: string;
  }): node is MdAstAssetReference {
    return node.type === 'assetReference';
  }

  function hasChildren(node: {
    type: string;
  }): node is { type: string; children: unknown[] } {
    if (!('children' in node)) return false;
    const { children } = node as { children: unknown };
    return Array.isArray(children);
  }

  function walk(node: unknown, path: number[]): void {
    if (!isMdAstNode(node)) return;
    if (isEntryReference(node) || isAssetReference(node)) {
      result.push({ node, treePath: path });
    }
    if (hasChildren(node)) {
      for (let i = 0; i < node.children.length; i += 1) {
        walk(node.children[i], [...path, i]);
      }
    }
  }

  walk(root, []);
  return result;
}

/**
 * What a reference search targets: a single Asset, a single Entry, or a whole
 * Collection. The Collection variant (used by Collection delete) matches any
 * reference pointing into it, plus a direct reference to the Collection itself.
 */
type ReferenceTarget =
  | { projectId: string; assetId: Uuid }
  | { projectId: string; collectionId: Uuid; entryId: Uuid }
  | { projectId: string; collectionId: Uuid };

/**
 * A single Asset, Entry or Collection reference found somewhere inside an
 * Entry's values, together with where it lives. The leaf carrier (`via`) is
 * always a flat `reference` field or an `mdast` node. Nesting inside
 * `dynamic`/component blocks is captured by a non-empty `componentPath`, not
 * by `via`.
 */
type FoundReference = {
  refKind: 'asset' | 'entry' | 'collection';
  id: Uuid;
  /** Present for entry references (carried for path resolution). */
  collectionId?: Uuid;
  fieldSlug: string;
  via: 'reference' | 'mdast';
  componentPath: ReferenceComponentPathSegment[];
  language: SupportedLanguage;
  treePath: number[];
  index: number | null;
};

/**
 * Recursively collects every Asset/Entry reference held by a single `Value`,
 * descending through `dynamic`/component items so nested references are not
 * missed. Mirrors `collectMdAstRefs` in style: builds and returns an array.
 *
 * `fieldSlug` is the slug of the field holding `value`; `componentPath` is the
 * chain of `dynamic` field + item hops already traversed (empty at top level).
 *
 * This is the shared value-only walker behind the REVERSE reference gates. It
 * backs `findEntriesReferencing` (delete protection) today and is the intended
 * primitive for the planned `findDanglingReferences` (sync integrity, see
 * docs/design/sync-dangling-reference-prevention.md). Reuse it for any new
 * reference scan rather than adding a third walk. The FORWARD write gate
 * (`validateValueReferences`) keeps its own field-definition driven walk
 * because it also does MIME and resolver work.
 */
function collectReferencesInValue(
  value: Value,
  fieldSlug: string,
  componentPath: ReferenceComponentPathSegment[]
): FoundReference[] {
  const result: FoundReference[] = [];

  if (value.valueType === 'reference') {
    for (const [language, refs] of Object.entries(value.content)) {
      if (!refs) continue;
      const lang = language as SupportedLanguage;
      for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index];
        if (!ref) continue;
        if (ref.objectType === 'asset') {
          result.push({
            refKind: 'asset',
            id: ref.id,
            fieldSlug,
            via: 'reference',
            componentPath,
            language: lang,
            treePath: [],
            index,
          });
        } else if (ref.objectType === 'entry') {
          result.push({
            refKind: 'entry',
            id: ref.id,
            collectionId: ref.collectionId,
            fieldSlug,
            via: 'reference',
            componentPath,
            language: lang,
            treePath: [],
            index,
          });
        } else if (ref.objectType === 'collection') {
          // A reference to a Collection as a whole. No field type produces one
          // today, so this is a defensive branch that keeps Collection delete
          // from stranding such a reference. Its `id` is the Collection's id.
          result.push({
            refKind: 'collection',
            id: ref.id,
            fieldSlug,
            via: 'reference',
            componentPath,
            language: lang,
            treePath: [],
            index,
          });
        }
      }
    }
  } else if (value.valueType === 'mdast') {
    for (const [language, root] of Object.entries(value.content)) {
      if (!root) continue;
      const lang = language as SupportedLanguage;
      for (const { node, treePath } of collectMdAstRefs(root)) {
        if (node.type === 'assetReference') {
          result.push({
            refKind: 'asset',
            id: node.assetId,
            fieldSlug,
            via: 'mdast',
            componentPath,
            language: lang,
            treePath,
            index: null,
          });
        } else {
          result.push({
            refKind: 'entry',
            id: node.entryId,
            collectionId: node.collectionId,
            fieldSlug,
            via: 'mdast',
            componentPath,
            language: lang,
            treePath,
            index: null,
          });
        }
      }
    }
  } else if (value.valueType === 'component') {
    for (const item of value.content) {
      const segment: ReferenceComponentPathSegment = {
        fieldSlug,
        itemId: item.id,
        componentId: item.componentId,
      };
      for (const [innerSlug, innerValue] of Object.entries(item.values)) {
        result.push(
          ...collectReferencesInValue(innerValue, innerSlug, [
            ...componentPath,
            segment,
          ])
        );
      }
    }
  }

  return result;
}
