import Fs from 'fs-extra';
import { z } from '@hono/zod-openapi';
import { isDeepStrictEqual } from 'node:util';
import { CoreError } from '../util/shared.js';
import {
  collectionFileSchema,
  countCollectionsSchema,
  migrateCollectionSchema,
  deleteCollectionSchema,
  entryFileSchema,
  getCreateCollectionSchemaFromLanguages,
  getUpdateCollectionSchemaFromLanguages,
  listCollectionsSchema,
  objectTypeSchema,
  type ReadBySlugCollectionProps,
  readCollectionSchema,
  serviceTypeSchema,
  uuidSchema,
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
  componentFileSchema,
  type ComponentResolver,
  type FieldDefinition,
  type ProjectLanguages,
  type Uuid,
  type Value,
} from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import { detectUniqueValueCollisions } from '../util/uniqueFieldValues.js';
import {
  diffFieldDefinitions,
  type FieldChange,
} from '../util/fieldDefinitionDiff.js';
import {
  transformEntryValues,
  type EntryIssue,
} from '../util/entryTransform.js';
import { getValueSchemaFromFieldDefinition } from '../schema/schemaFromFieldDefinition.js';
import {
  componentIdsOf,
  preloadComponentResolver,
} from '../util/componentResolver.js';
import {
  applyMigrations,
  collectionMigrations,
  migrating,
} from './migrations/index.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractSlugIndexedEntityService } from './AbstractSlugIndexedEntityService.js';
import type { ReferenceService } from './ReferenceService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * A Collection is the folder `collections/<uuid>/`, holding `collection.json`
 * next to the Entries that belong to it. Every create, update and delete
 * commits.
 *
 * Slug lookups and slug uniqueness go through `slug.index.json`, a cache git
 * does not track and that rebuilds by scanning the folders when it misses.
 *
 * @see ../../docs/storage-layout.md
 */
export class CollectionService
  extends AbstractSlugIndexedEntityService<CollectionFile>
  implements CrudServiceWithListCount<Collection>
{
  private coreVersion: string;
  private referenceService: ReferenceService;

  protected entityFileSchema = collectionFileSchema;

  protected entitiesPath(projectId: string): string {
    return this.pathTo.collections(projectId);
  }
  protected entityPath(projectId: string, id: string): string {
    return this.pathTo.collection(projectId, id);
  }
  protected entityFilePath(projectId: string, id: string): string {
    return this.pathTo.collectionFile(projectId, id);
  }
  protected extractSlug(file: CollectionFile): string {
    return file.slug.plural;
  }

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    referenceService: ReferenceService
  ) {
    super(
      serviceTypeSchema.enum.Collection,
      options,
      pathTo,
      logService,
      jsonFileService,
      gitService
    );

    this.coreVersion = coreVersion;
    this.referenceService = referenceService;
  }

  /**
   * Resolves a UUID-or-slug string to a Collection UUID.
   *
   * Throws `NotFound` when the string matches neither a Collection folder nor
   * an indexed slug. A UUID whose folder does not exist is not returned as
   * is, it falls through to the slug lookup and throws.
   */
  public async resolveCollectionId(
    props: ResolveCollectionIdProps
  ): Promise<string> {
    return this.resolveId(props.projectId, props.idOrSlug);
  }

  /**
   * Creates a new Collection
   *
   * Core generates the Collection's `id`, but field-definition `id`s are
   * caller-supplied (pass a UUID per field definition, for example via
   * `uuid()`). They become the stable identity used to match field definitions
   * on later updates, see `update`.
   */
  public async create<T extends Collection = Collection>(
    props: CreateCollectionProps
  ): Promise<T> {
    this.assertNotReadOnly('create');
    const { projectId } = this.parseOrThrow(
      'create',
      z.object({ projectId: uuidSchema }),
      props
    );
    await this.assertNotProvisioned('create', projectId);
    const languages = await this.readProjectLanguages(projectId);

    return this.mutating(
      'create',
      getCreateCollectionSchemaFromLanguages(languages),
      props,
      async (validatedProps) => {
        const id = uuid();
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const collectionPath = this.pathTo.collection(
          validatedProps.projectId,
          id
        );
        const collectionFilePath = this.pathTo.collectionFile(
          validatedProps.projectId,
          id
        );

        const slugPlural = slug(validatedProps.slug.plural);

        const index = await this.getSlugIndex(validatedProps.projectId);

        // Enforce collection slug uniqueness via index. The clashing
        // Collection is named by id, never by the slug the caller sent,
        // which the service boundary would log. See contributing/logging.md
        const clashing = Object.entries(index).find(
          ([, existing]) => existing === slugPlural
        );
        if (clashing) {
          throw CoreError.conflict(
            `Collection slug is already in use by Collection "${clashing[0]}"`
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

        await this.withGitRollback(projectPath, async () => {
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
        }, [collectionPath]);

        // Update the index (not git-tracked, self-heals on failure)
        index[id] = slugPlural;
        await this.safeWriteSlugIndex(validatedProps.projectId, index);
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
        return this.toCollection(collectionFile) as T;
      }
    );
  }

  /**
   * Returns a Collection by ID
   *
   * If a commit hash is provided, the Collection is read from history
   */
  public async read<T extends Collection = Collection>(
    props: ReadCollectionProps
  ): Promise<T> {
    return this.validated(
      'read',
      readCollectionSchema,
      props,
      async (validatedProps) => {
        if (!validatedProps.commitHash) {
          const collectionFile = await this.jsonFileService.read(
            this.pathTo.collectionFile(
              validatedProps.projectId,
              validatedProps.id
            ),
            collectionFileSchema
          );
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
          return this.toCollection(collectionFile) as T;
        } else {
          const content = await this.gitService.getFileContentAtCommit(
            this.pathTo.project(validatedProps.projectId),
            this.pathTo.collectionFile(
              validatedProps.projectId,
              validatedProps.id
            ),
            validatedProps.commitHash
          );
          const collectionFile = this.migrate(JSON.parse(content));
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
          return this.toCollection(collectionFile) as T;
        }
      }
    );
  }

  /**
   * Reads a Collection by its slug, resolved through the slug index, which
   * rebuilds from disk once on a miss. An unknown slug throws `NotFound`
   * rather than returning null.
   *
   * `commitHash` is forwarded, so a slug can be read as it was at that
   * commit.
   */
  public async readBySlug<T extends Collection = Collection>(
    props: ReadBySlugCollectionProps
  ): Promise<T> {
    const id = await this.resolveCollectionId({
      projectId: props.projectId,
      idOrSlug: props.slug,
    });
    return this.read<T>({
      projectId: props.projectId,
      id,
      commitHash: props.commitHash,
    });
  }

  /**
   * The git log scoped to the Collection's own `collection.json`, newest
   * first and unpaginated. An Entry-only commit never appears, while an
   * update that cascades into Entries does.
   *
   * Reads git without touching the working tree.
   */
  public async history(props: CollectionHistoryProps): Promise<GitCommit[]> {
    return this.validated(
      'history',
      collectionHistorySchema,
      props,
      async (validatedProps) => {
        return this.gitService.log(
          this.pathTo.project(validatedProps.projectId),
          {
            filePath: this.pathTo.collectionFile(
              validatedProps.projectId,
              validatedProps.id
            ),
          }
        );
      }
    );
  }

  /**
   * Updates given Collection, enforcing Collection slug uniqueness.
   *
   * Field definitions are matched by `id`. Send back the `id` of every field
   * definition you want to keep, a missing or changed `id` counts as a new
   * field and removes the Entry data keyed to the old one. Deterministic
   * changes cascade automatically, a change that needs a decision throws
   * `Conflict` with structured `EntryIssue[]` the caller can retry with
   * `resolutions`.
   *
   * @see ../../docs/schema-changes.md
   */
  public async update<T extends Collection = Collection>(
    props: UpdateCollectionProps
  ): Promise<T> {
    this.assertNotReadOnly('update');
    const { projectId } = this.parseOrThrow(
      'update',
      z.object({ projectId: uuidSchema }),
      props
    );
    await this.assertNotProvisioned('update', projectId);
    const languages = await this.readProjectLanguages(projectId);

    return this.mutating(
      'update',
      getUpdateCollectionSchemaFromLanguages(languages),
      props,
      async (validatedProps) => {
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const collectionFilePath = this.pathTo.collectionFile(
          validatedProps.projectId,
          validatedProps.id
        );

        const prevCollectionFile = await this.read(validatedProps);

        const {
          projectId: _,
          resolutions,
          ...validatedUpdateProps
        } = validatedProps;
        const collectionFile: CollectionFile = {
          ...prevCollectionFile,
          ...validatedUpdateProps,
          updated: datetime(),
        };

        // Diff field definitions
        const oldFieldDefs = flattenFieldDefinitions(
          prevCollectionFile.fieldDefinitions
        );
        const newFieldDefs = flattenFieldDefinitions(
          validatedProps.fieldDefinitions
        );
        const changes = diffFieldDefinitions(oldFieldDefs, newFieldDefs);

        const newSlugPlural = slug(validatedProps.slug.plural);

        // If collection slug.plural changed, enforce uniqueness before mutating
        if (prevCollectionFile.slug.plural !== newSlugPlural) {
          await this.assertCollectionSlugIsAvailable(
            validatedProps.projectId,
            newSlugPlural,
            validatedProps.id
          );
        }

        await this.withGitRollback(projectPath, async () => {
          const filesToGitAdd: string[] = [collectionFilePath];

          if (changes.length > 0) {
            const entriesPath = this.pathTo.entries(
              validatedProps.projectId,
              validatedProps.id
            );
            const exists = await Fs.pathExists(entriesPath);

            if (exists) {
              const entryReferences = await this.listReferences(
                'entry',
                validatedProps.projectId,
                validatedProps.id
              );

              if (entryReferences.length > 0) {
                const allIssues: EntryIssue[] = [];
                const entriesFinalValues: Array<{
                  entryId: Uuid;
                  values: Record<string, Value>;
                }> = [];
                const componentResolver = await this.buildComponentResolver(
                  validatedProps.projectId,
                  newFieldDefs
                );

                for (const entryReference of entryReferences) {
                  const entryResult = await this.transformAndWriteEntry({
                    projectId: validatedProps.projectId,
                    collectionId: validatedProps.id,
                    entryId: entryReference.id,
                    oldFieldDefs,
                    newFieldDefs,
                    changes,
                    languages,
                    resolutions,
                    componentResolver,
                  });

                  allIssues.push(...entryResult.issues);
                  entriesFinalValues.push({
                    entryId: entryResult.entryId,
                    values: entryResult.finalValues,
                  });
                  if (entryResult.wrote) {
                    filesToGitAdd.push(entryResult.entryFilePath);
                  }
                }

                const blockingIssues = this.computeBlockingIssues({
                  allIssues,
                  resolutions,
                  newFieldDefs,
                  entriesFinalValues,
                  collectionId: validatedProps.id,
                });
                if (blockingIssues.length > 0) {
                  throw CoreError.conflict(
                    'Field definition changes or uniqueness collisions require entry resolutions',
                    blockingIssues
                  );
                }
              }
            }
          }

          await this.jsonFileService.update(
            collectionFile,
            collectionFilePath,
            collectionFileSchema
          );
          await this.gitService.add(projectPath, filesToGitAdd);
          await this.gitService.commit(projectPath, {
            method: 'update',
            reference: {
              objectType: 'collection',
              id: collectionFile.id,
            },
          });
        });

        // Update index after successful commit
        if (prevCollectionFile.slug.plural !== newSlugPlural) {
          const index = await this.getSlugIndex(validatedProps.projectId);
          index[validatedProps.id] = newSlugPlural;
          await this.safeWriteSlugIndex(validatedProps.projectId, index);
        }

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
        return this.toCollection(collectionFile) as T;
      }
    );
  }

  /**
   * Pre-loads every Component the given field definitions reach, so the
   * cascade can build a schema for a dynamic field.
   *
   * Reads the Component files directly rather than through `ComponentService`,
   * which a Collection does not hold. A working-tree read parses strictly and
   * does not migrate, which is what that service would do here too.
   */
  private async buildComponentResolver(
    projectId: Uuid,
    fieldDefinitions: FieldDefinition[]
  ): Promise<ComponentResolver> {
    return preloadComponentResolver(
      componentIdsOf(fieldDefinitions),
      async (componentId) => {
        const componentFile = await this.jsonFileService.read(
          this.pathTo.componentFile(projectId, componentId),
          componentFileSchema
        );
        return componentFile.fieldDefinitions;
      }
    );
  }

  /**
   * Throws when another Collection already uses the given plural slug.
   *
   * The current Collection is excluded so re-saving with an unchanged slug is
   * allowed.
   */
  private async assertCollectionSlugIsAvailable(
    projectId: Uuid,
    newSlugPlural: string,
    currentId: Uuid
  ): Promise<void> {
    const index = await this.getSlugIndex(projectId);
    const existingUuid = Object.entries(index).find(
      ([, slugPlural]) => slugPlural === newSlugPlural
    );
    if (existingUuid && existingUuid[0] !== currentId) {
      throw CoreError.conflict(
        `Collection slug is already in use by Collection "${existingUuid[0]}"`
      );
    }
  }

  /**
   * Transforms a single Entry's values to the new field definitions, applies any
   * caller-provided resolutions and writes the Entry file if its values changed.
   *
   * Returns the transform issues, the final values (for cross-entry collision
   * detection) and whether the file was written (so the caller can stage it).
   */
  private async transformAndWriteEntry(params: {
    projectId: Uuid;
    collectionId: Uuid;
    entryId: Uuid;
    oldFieldDefs: FieldDefinition[];
    newFieldDefs: FieldDefinition[];
    changes: FieldChange[];
    languages: ProjectLanguages;
    resolutions: UpdateCollectionProps['resolutions'];
    componentResolver: ComponentResolver;
  }): Promise<{
    issues: EntryIssue[];
    entryId: Uuid;
    finalValues: Record<string, Value>;
    entryFilePath: string;
    wrote: boolean;
  }> {
    const {
      projectId,
      collectionId,
      entryId,
      oldFieldDefs,
      newFieldDefs,
      changes,
      languages,
      resolutions,
      componentResolver,
    } = params;

    const entryFilePath = this.pathTo.entryFile(
      projectId,
      collectionId,
      entryId
    );

    const entryFile = await this.jsonFileService.read(
      entryFilePath,
      entryFileSchema
    );

    const result = transformEntryValues(
      entryFile.id,
      collectionId,
      entryFile.values,
      oldFieldDefs,
      newFieldDefs,
      changes,
      languages,
      componentResolver
    );

    // Apply any provided resolutions. Not gated on transform
    // issues, since a unique_collision has no transform issue.
    const finalValues = result.values;
    const entryResolutions = resolutions?.[entryFile.id];
    if (entryResolutions) {
      for (const [fieldSlug, resolvedValue] of Object.entries(
        entryResolutions
      )) {
        const fieldDef = newFieldDefs.find(
          (candidate) => candidate.slug === fieldSlug
        );
        if (fieldDef) {
          const schema = getValueSchemaFromFieldDefinition(
            fieldDef,
            languages,
            componentResolver
          );
          const parseResult = schema.safeParse(resolvedValue);
          if (!parseResult.success) {
            throw CoreError.badRequest(
              'Resolution validation failed',
              parseResult.error
            );
          }
        }
        finalValues[fieldSlug] = resolvedValue;
      }
    }

    const wrote = isDeepStrictEqual(entryFile.values, finalValues) === false;
    if (wrote) {
      const updatedEntryFile = {
        ...entryFile,
        values: finalValues,
      };
      await this.jsonFileService.update(
        updatedEntryFile,
        entryFilePath,
        entryFileSchema
      );
    }

    return {
      issues: result.issues,
      entryId: entryFile.id,
      finalValues,
      entryFilePath,
      wrote,
    };
  }

  /**
   * Builds the list of issues that must block the update.
   *
   * Combines transform issues the caller did not resolve with cross-entry
   * uniqueness collisions on the post-resolution values.
   */
  private computeBlockingIssues(params: {
    allIssues: EntryIssue[];
    resolutions: UpdateCollectionProps['resolutions'];
    newFieldDefs: FieldDefinition[];
    entriesFinalValues: Array<{ entryId: Uuid; values: Record<string, Value> }>;
    collectionId: Uuid;
  }): EntryIssue[] {
    const {
      allIssues,
      resolutions,
      newFieldDefs,
      entriesFinalValues,
      collectionId,
    } = params;

    // Transform issues the caller did not resolve
    const unresolvedIssues = resolutions
      ? allIssues.filter((issue) => {
          const entryResolutions = resolutions[issue.entryId];
          return !(entryResolutions && issue.fieldSlug in entryResolutions);
        })
      : allIssues;

    // Cross-entry uniqueness collisions, on the post-resolution
    // values. Keep the first holder, flag the rest as resolvable.
    const collisionIssues: EntryIssue[] = detectUniqueValueCollisions(
      newFieldDefs,
      entriesFinalValues
    ).flatMap((collision) => {
      // The first holder is kept, the rest are flagged as resolvable.
      // A collision always has at least two holders, so this guard is defensive.
      const [conflictingEntryId, ...flaggedEntryIds] = collision.entryIds;
      if (conflictingEntryId === undefined) {
        return [];
      }
      return flaggedEntryIds.map((entryId) => ({
        entryId,
        collectionId,
        fieldDefinitionId: collision.fieldDefinitionId,
        fieldSlug: collision.fieldSlug,
        issue: 'unique_collision' as const,
        transformedValues: {},
        value: collision.value,
        language: collision.language,
        conflictingEntryId,
      }));
    });

    return [...unresolvedIssues, ...collisionIssues];
  }

  /**
   * Deletes the Collection folder, its Entries and its field definitions,
   * which live inside `collection.json`. The Components a `dynamic` field
   * definition referenced survive, they belong to the Project.
   *
   * A surviving Entry outside this Collection that still references into it
   * blocks the delete with `Conflict`, carrying the referring Entries, the
   * same protection Asset and Entry delete carry. References between Entries
   * that are all going together do not block.
   *
   * @see ../../contributing/reference-integrity.md
   */
  public async delete(props: DeleteCollectionProps): Promise<void> {
    return this.mutating(
      'delete',
      deleteCollectionSchema,
      props,
      async (validatedProps) => {
        await this.assertNotProvisioned('delete', validatedProps.projectId);

        const referencingEntries =
          await this.referenceService.findEntriesReferencing({
            projectId: validatedProps.projectId,
            collectionId: validatedProps.id,
          });
        if (referencingEntries.length > 0) {
          const list = referencingEntries
            .map((r) => `Entry "${r.entryId}" (Collection "${r.collectionId}")`)
            .join(', ');
          throw CoreError.conflict(
            `Cannot delete Collection "${validatedProps.id}": it is still referenced by ${list}`,
            referencingEntries
          );
        }

        const projectPath = this.pathTo.project(validatedProps.projectId);
        const collectionPath = this.pathTo.collection(
          validatedProps.projectId,
          validatedProps.id
        );

        await this.withGitRollback(projectPath, async () => {
          await this.jsonFileService.delete(collectionPath);
          await this.gitService.add(projectPath, [collectionPath]);
          await this.gitService.commit(projectPath, {
            method: 'delete',
            reference: { objectType: 'collection', id: validatedProps.id },
          });
        });

        // Remove from index (not git-tracked, self-heals on failure)
        const index = await this.getSlugIndex(validatedProps.projectId);
        delete index[validatedProps.id];
        await this.safeWriteSlugIndex(validatedProps.projectId, index);
      }
    );
  }

  /**
   * One page of Collections, in whatever order the filesystem returns the
   * folders rather than any sort.
   *
   * `limit` defaults to 15 and `limit: 0` returns everything from `offset`.
   * `total` counts the Collection folders on disk while `list` holds only
   * those that read and validate, so a `collection.json` failing its schema
   * is dropped with a warning and the two numbers disagree.
   */
  public async list<T extends Collection = Collection>(
    props: ListCollectionsProps
  ): Promise<PaginatedList<T>> {
    return this.validated(
      'list',
      listCollectionsSchema,
      props,
      async (validatedProps) => {
        const offset = validatedProps.offset || 0;
        const limit = validatedProps.limit ?? 15;

        const collectionReferences = await this.listReferences(
          objectTypeSchema.enum.collection,
          validatedProps.projectId
        );

        const partialCollectionReferences =
          limit === 0
            ? collectionReferences.slice(offset)
            : collectionReferences.slice(offset, offset + limit);

        const collections = await this.collectResults(
          partialCollectionReferences.map((reference) =>
            this.read<T>({
              projectId: validatedProps.projectId,
              id: reference.id,
            })
          )
        );

        return {
          total: collectionReferences.length,
          limit,
          offset,
          list: collections,
        };
      }
    );
  }

  /**
   * Counts the UUID-named folders under `collections/` without reading or
   * validating a single `collection.json`. Cheap, and higher than the length
   * of what `list` returns whenever a file fails to parse.
   */
  public async count(props: CountCollectionsProps): Promise<number> {
    return this.validated(
      'count',
      countCollectionsSchema,
      props,
      async (validatedProps) => {
        const refs = await this.listReferences(
          objectTypeSchema.enum.collection,
          validatedProps.projectId
        );
        return refs.length;
      }
    );
  }

  /**
   * Parses against the full Collection file schema, so `id`, `objectType`,
   * `created`, `updated` and the field definition slug and slug-source
   * refinements all have to be present and valid.
   *
   * A half-built object about to be passed to `create` therefore returns
   * false. It never throws.
   */
  public isCollection(obj: unknown): obj is Collection {
    return collectionFileSchema.safeParse(obj).success;
  }

  /**
   * Migrates a potentially outdated Collection file to the current schema.
   *
   * Throws `BadRequest` when the file does not match what Core expects, with
   * the underlying `ZodError` as its cause, and `VersionSkew` when it was
   * written by a newer Core than the one installed. Reads no disk.
   */
  public migrate(potentiallyOutdatedCollectionFile: unknown) {
    return migrating('Collection', () => {
      const loose = migrateCollectionSchema.parse(
        potentiallyOutdatedCollectionFile
      );
      const migrated = applyMigrations(
        loose,
        collectionMigrations,
        this.coreVersion
      );
      return collectionFileSchema.parse(migrated);
    });
  }

  /**
   * The one seam between the on-disk `CollectionFile` and the returned
   * `Collection`. Today it is a plain spread, because `Collection` is
   * `collectionFileSchema.openapi('Collection')` and the two shapes are
   * identical. It is kept for the point where they diverge.
   */
  private toCollection(collectionFile: CollectionFile): Collection {
    return {
      ...collectionFile,
    };
  }
}
