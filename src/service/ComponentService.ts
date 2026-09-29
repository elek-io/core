import Fs from 'fs-extra';
import { z } from '@hono/zod-openapi';
import { CoreError } from '../util/shared.js';
import { isDeepStrictEqual } from 'node:util';
import {
  componentFileSchema,
  countComponentsSchema,
  migrateComponentSchema,
  deleteComponentSchema,
  getCreateComponentSchemaFromLanguages,
  getUpdateComponentSchemaFromLanguages,
  listComponentsSchema,
  objectTypeSchema,
  type ReadBySlugComponentProps,
  readComponentSchema,
  serviceTypeSchema,
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
  type ComponentResolver,
  type FieldDefinition,
  type ProjectLanguages,
  type Uuid,
  type Value,
} from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import {
  diffFieldDefinitions,
  type FieldChange,
} from '../util/fieldDefinitionDiff.js';
import { transformComponentValues } from '../util/componentTransform.js';
import { getValueSchemaFromFieldDefinition } from '../schema/schemaFromFieldDefinition.js';
import {
  componentIdsOf,
  preloadComponentResolver,
} from '../util/componentResolver.js';
import {
  assertResolutionSlugsAreKnown,
  type EntryIssue,
} from '../util/entryTransform.js';
import {
  applyMigrations,
  componentMigrations,
  migrating,
} from './migrations/index.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractSlugIndexedEntityService } from './AbstractSlugIndexedEntityService.js';
import type { GitService } from './GitService.js';
import type { CacheService } from './CacheService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * A Component is the folder `components/<uuid>/`, holding `component.json`. It
 * is a reusable bundle of field definitions that a Collection's dynamic fields
 * embed by reference rather than by copy.
 *
 * An update cascades into every Entry holding the Component, and the file plus
 * every rewritten Entry land in one commit.
 *
 * @see ../../docs/schema-changes.md
 */
export class ComponentService
  extends AbstractSlugIndexedEntityService<ComponentFile>
  implements CrudServiceWithListCount<Component>
{
  private coreVersion: string;

  protected entityFileSchema = componentFileSchema;

  protected entitiesPath(projectId: string): string {
    return this.pathTo.components(projectId);
  }
  protected entityPath(projectId: string, id: string): string {
    return this.pathTo.component(projectId, id);
  }
  protected entityFilePath(projectId: string, id: string): string {
    return this.pathTo.componentFile(projectId, id);
  }
  protected extractSlug(file: ComponentFile): string {
    return file.slug;
  }

  constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    jsonFileService: JsonFileService,
    cacheService: CacheService,
    gitService: GitService
  ) {
    super(
      serviceTypeSchema.enum.Component,
      options,
      pathTo,
      logService,
      jsonFileService,
      cacheService,
      gitService
    );

    this.coreVersion = coreVersion;
  }

  /**
   * Resolves a UUID-or-slug string to a Component UUID.
   *
   * A UUID is accepted only when that Component folder exists on disk,
   * otherwise it falls back to the slug index, rebuilt once on a miss.
   * Throws `NotFound` when neither matches.
   */
  public async resolveComponentId(
    props: ResolveComponentIdProps
  ): Promise<string> {
    return this.resolveId(props.projectId, props.idOrSlug);
  }

  /**
   * Writes the Component folder and its `component.json`, then commits, and
   * puts the new slug into the in-memory index. Core generates the
   * Component's `id`, but field-definition `id`s are caller-supplied and
   * become the identity later updates match on.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * `Conflict` on a slug already in use, and `BadRequest` on a circular
   * `ofComponents` reference.
   *
   * @see ../../contributing/error-handling-internals.md
   */
  public async create<T extends Component = Component>(
    props: CreateComponentProps
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
      getCreateComponentSchemaFromLanguages(languages),
      props,
      async (validatedProps) => {
        await this.validateNoCircularReferences(
          null,
          validatedProps.fieldDefinitions,
          validatedProps.projectId
        );

        const id = uuid();
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const componentPath = this.pathTo.component(
          validatedProps.projectId,
          id
        );
        const componentFilePath = this.pathTo.componentFile(
          validatedProps.projectId,
          id
        );
        const componentSlug = slug(validatedProps.slug);

        const index = await this.getSlugIndex(validatedProps.projectId);

        // Named by id, never by the slug the caller sent, which the
        // service boundary would log. See contributing/logging.md
        const clashing = Object.entries(index).find(
          ([, existing]) => existing === componentSlug
        );
        if (clashing) {
          throw CoreError.conflict(
            `Component slug is already in use by Component "${clashing[0]}"`
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

        await this.withGitRollback(projectPath, async () => {
          await Fs.ensureDir(componentPath);
          await this.jsonFileService.create(
            componentFile,
            componentFilePath,
            componentFileSchema
          );
          await this.gitService.add(projectPath, [componentFilePath]);
          await this.gitService.commit(projectPath, {
            method: 'create',
            reference: { objectType: 'component', id },
          });
        }, [componentPath]);

        index[id] = componentSlug;
        this.setSlugIndex(validatedProps.projectId, index);
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
        return this.toComponent(componentFile) as T;
      }
    );
  }

  /**
   * Returns a Component by ID.
   *
   * With `commitHash` the file is read out of git history and run through the
   * migration chain, so a historical read can additionally throw
   * `VersionSkew` or `BadRequest`. A working-tree read parses strictly and
   * does not migrate.
   */
  public async read<T extends Component = Component>(
    props: ReadComponentProps
  ): Promise<T> {
    return this.validated(
      'read',
      readComponentSchema,
      props,
      async (validatedProps) => {
        if (!validatedProps.commitHash) {
          const componentFile = await this.jsonFileService.read(
            this.pathTo.componentFile(
              validatedProps.projectId,
              validatedProps.id
            ),
            componentFileSchema
          );
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
          return this.toComponent(componentFile) as T;
        } else {
          const content = await this.gitService.getFileContentAtCommit(
            this.pathTo.project(validatedProps.projectId),
            this.pathTo.componentFile(
              validatedProps.projectId,
              validatedProps.id
            ),
            validatedProps.commitHash
          );
          const componentFile = this.migrate(JSON.parse(content));
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
          return this.toComponent(componentFile) as T;
        }
      }
    );
  }

  /**
   * Reads a Component by its slug, resolved through the slug index, throwing
   * `NotFound` when no Component carries it. A UUID is accepted too, because
   * this goes through `resolveComponentId`.
   *
   * `commitHash` is forwarded to `read`.
   */
  public async readBySlug<T extends Component = Component>(
    props: ReadBySlugComponentProps
  ): Promise<T> {
    const id = await this.resolveComponentId({
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
   * The git log filtered to the Component's own `component.json` on the
   * current branch, newest first and unpaginated. Each returned `hash` is
   * what `read({ commitHash })` takes.
   *
   * An unknown or never-committed Component yields an empty array rather
   * than an error.
   */
  public async history(props: ComponentHistoryProps): Promise<GitCommit[]> {
    return this.validated(
      'history',
      componentHistorySchema,
      props,
      async (validatedProps) => {
        return this.gitService.log(
          this.pathTo.project(validatedProps.projectId),
          {
            filePath: this.pathTo.componentFile(
              validatedProps.projectId,
              validatedProps.id
            ),
          }
        );
      }
    );
  }

  /**
   * Field definitions are matched by `id`. Send back the `id` of every one
   * you want to keep, a missing or changed `id` counts as a new field and
   * removes the Entry data keyed to the old one. The Component file and every
   * Entry the cascade rewrites land in one commit that rolls back as a unit.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * `Conflict` on a taken slug or an ambiguous change, carrying structured
   * issues, and `BadRequest` on a circular reference.
   *
   * @see ../../docs/schema-changes.md
   */
  public async update<T extends Component = Component>(
    props: UpdateComponentProps
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
      getUpdateComponentSchemaFromLanguages(languages),
      props,
      async (validatedProps) => {
        await this.validateNoCircularReferences(
          validatedProps.id,
          validatedProps.fieldDefinitions,
          validatedProps.projectId
        );

        const projectPath = this.pathTo.project(validatedProps.projectId);
        const componentFilePath = this.pathTo.componentFile(
          validatedProps.projectId,
          validatedProps.id
        );

        const prevComponentFile = await this.read(validatedProps);

        const {
          projectId: _,
          resolutions,
          ...validatedUpdateProps
        } = validatedProps;
        const componentFile: ComponentFile = {
          ...prevComponentFile,
          ...validatedUpdateProps,
          updated: datetime(),
        };

        const newSlug = slug(validatedProps.slug);

        // If component slug changed, enforce uniqueness before mutating
        if (prevComponentFile.slug !== newSlug) {
          await this.enforceComponentSlugIsUnique(
            validatedProps.projectId,
            newSlug,
            validatedProps.id
          );
        }

        const oldFieldDefs = prevComponentFile.fieldDefinitions;
        const newFieldDefs = validatedProps.fieldDefinitions;
        const changes = diffFieldDefinitions(oldFieldDefs, newFieldDefs);

        assertResolutionSlugsAreKnown(resolutions, newFieldDefs);

        await this.withGitRollback(projectPath, async () => {
          const filesToGitAdd: string[] = [componentFilePath];

          if (changes.length > 0) {
            filesToGitAdd.push(
              ...(await this.cascadeFieldDefinitionChanges({
                projectId: validatedProps.projectId,
                componentId: validatedProps.id,
                oldFieldDefs,
                newFieldDefs,
                changes,
                resolutions,
                languages,
              }))
            );
          }

          await this.jsonFileService.update(
            componentFile,
            componentFilePath,
            componentFileSchema
          );
          await this.gitService.add(projectPath, filesToGitAdd);
          await this.gitService.commit(projectPath, {
            method: 'update',
            reference: {
              objectType: 'component',
              id: componentFile.id,
            },
          });
        });

        // Update index after successful commit
        if (prevComponentFile.slug !== newSlug) {
          const index = await this.getSlugIndex(validatedProps.projectId);
          index[validatedProps.id] = newSlug;
          this.setSlugIndex(validatedProps.projectId, index);
        }

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim, see contributing/linting.md
        return this.toComponent(componentFile) as T;
      }
    );
  }

  /**
   * Throws when another Component already uses the given slug.
   *
   * The current Component is excluded so re-saving with an unchanged slug is
   * allowed.
   */
  private async enforceComponentSlugIsUnique(
    projectId: Uuid,
    newSlug: string,
    componentId: Uuid
  ): Promise<void> {
    const index = await this.getSlugIndex(projectId);
    const existingUuid = Object.entries(index).find(
      ([, existingSlug]) => existingSlug === newSlug
    );
    if (existingUuid && existingUuid[0] !== componentId) {
      throw CoreError.conflict(
        `Component slug is already in use by Component "${existingUuid[0]}"`
      );
    }
  }

  /**
   * Cascades field definition changes to every Entry that references this
   * Component through a dynamic field.
   *
   * Transforms each affected Entry's values, applies caller-provided resolutions
   * and writes the changed Entry files. Throws when transform issues remain
   * unresolved, so the caller's git rollback reverts any writes. Returns the
   * paths of the written Entry files so the caller can stage them.
   */
  private async cascadeFieldDefinitionChanges(params: {
    projectId: Uuid;
    componentId: Uuid;
    oldFieldDefs: FieldDefinition[];
    newFieldDefs: FieldDefinition[];
    changes: FieldChange[];
    resolutions: UpdateComponentProps['resolutions'];
    languages: ProjectLanguages;
  }): Promise<string[]> {
    const {
      projectId,
      componentId,
      oldFieldDefs,
      newFieldDefs,
      changes,
      resolutions,
      languages,
    } = params;

    const filesToGitAdd: string[] = [];
    const allIssues: EntryIssue[] = [];
    const componentResolver = await this.buildComponentResolver(
      projectId,
      newFieldDefs
    );

    // Find all collections that reference this component
    const collectionsPath = this.pathTo.collections(projectId);
    const collectionsExist = await Fs.pathExists(collectionsPath);

    if (collectionsExist) {
      const collectionReferences = await this.listReferences(
        'collection',
        projectId
      );

      for (const collectionReference of collectionReferences) {
        const collectionId = collectionReference.id;
        const collectionFile = await this.jsonFileService.read(
          this.pathTo.collectionFile(projectId, collectionId),
          collectionFileSchema
        );

        const fieldDefs = flattenFieldDefinitions(
          collectionFile.fieldDefinitions
        );

        const referencingDynamicFields =
          await this.findDynamicFieldsReferencingComponent(
            fieldDefs,
            componentId,
            projectId
          );

        if (referencingDynamicFields.length === 0) continue;

        const entriesPath = this.pathTo.entries(projectId, collectionId);
        const entriesExist = await Fs.pathExists(entriesPath);
        if (!entriesExist) continue;

        const entryReferences = await this.listReferences(
          'entry',
          projectId,
          collectionId
        );

        for (const entryReference of entryReferences) {
          const entryId = entryReference.id;
          const entryFilePath = this.pathTo.entryFile(
            projectId,
            collectionId,
            entryId
          );

          const entryFile = await this.jsonFileService.read(
            entryFilePath,
            entryFileSchema
          );

          const result = transformComponentValues(
            entryFile.id,
            collectionId,
            entryFile.values,
            componentId,
            oldFieldDefs,
            newFieldDefs,
            changes,
            referencingDynamicFields,
            languages,
            componentResolver
          );

          allIssues.push(...result.issues);

          if (result.changed || result.issues.length > 0) {
            // Apply resolutions if provided
            const finalValues = result.values;
            if (resolutions && result.issues.length > 0) {
              this.applyEntryResolutions(
                finalValues,
                resolutions,
                entryFile.id,
                newFieldDefs,
                languages,
                componentResolver
              );
            }

            if (isDeepStrictEqual(entryFile.values, finalValues) === false) {
              const updatedEntryFile = {
                ...entryFile,
                values: finalValues,
              };
              await this.jsonFileService.update(
                updatedEntryFile,
                entryFilePath,
                entryFileSchema
              );
              filesToGitAdd.push(entryFilePath);
            }
          }
        }
      }
    }

    // Check for unresolved issues
    if (allIssues.length > 0) {
      const unresolvedIssues = resolutions
        ? allIssues.filter((issue) => {
            const entryResolutions = resolutions[issue.entryId];
            return !(entryResolutions && issue.fieldSlug in entryResolutions);
          })
        : allIssues;

      if (unresolvedIssues.length > 0) {
        throw CoreError.conflict(
          'Component field definition changes require entry resolutions',
          unresolvedIssues
        );
      }
    }

    return filesToGitAdd;
  }

  /**
   * Pre-loads every Component the given field definitions reach, so the
   * cascade can build a schema for a nested dynamic field.
   */
  private async buildComponentResolver(
    projectId: Uuid,
    fieldDefinitions: FieldDefinition[]
  ): Promise<ComponentResolver> {
    return preloadComponentResolver(
      componentIdsOf(fieldDefinitions),
      async (componentId) => {
        const component = await this.read({ projectId, id: componentId });
        return component.fieldDefinitions;
      }
    );
  }

  /**
   * Applies a single Entry's resolutions onto its final values in place.
   *
   * Every slug is known to be declared by the new field definitions, because
   * `update` rejects an unknown one at its boundary before any Entry is
   * touched. Each value is validated against its field definition here and
   * throws `BadRequest` when it does not fit, which fails the update inside
   * the git rollback rather than midway through the Entries.
   */
  private applyEntryResolutions(
    finalValues: Record<string, Value>,
    resolutions: NonNullable<UpdateComponentProps['resolutions']>,
    entryId: Uuid,
    newFieldDefs: FieldDefinition[],
    languages: ProjectLanguages,
    componentResolver: ComponentResolver
  ): void {
    const entryResolutions = resolutions[entryId];
    if (!entryResolutions) return;

    for (const [fieldSlug, resolvedValue] of Object.entries(entryResolutions)) {
      const fieldDef = newFieldDefs.find((fd) => fd.slug === fieldSlug);
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

  /**
   * Deletes given Component
   *
   * Blocks the delete with `Conflict` when a Collection or another Component
   * still references it. An unconstrained `component` field, one whose
   * `ofComponents` is empty, counts as referencing every Component, so a
   * single one anywhere in the Project blocks every delete.
   *
   * The `Conflict` names the referring entities in its message text only,
   * with no structured cause.
   */
  public async delete(props: DeleteComponentProps): Promise<void> {
    return this.mutating('delete', deleteComponentSchema, props, async () => {
      await this.assertNotProvisioned('delete', props.projectId);

      const referencingEntities = await this.findReferences(
        props.projectId,
        props.id
      );

      if (referencingEntities.length > 0) {
        const refs = referencingEntities
          .map((r) => `${r.type} "${r.id}"`)
          .join(', ');
        throw CoreError.conflict(
          `Cannot delete Component "${props.id}": it is still referenced by ${refs}`
        );
      }

      const projectPath = this.pathTo.project(props.projectId);
      const componentPath = this.pathTo.component(props.projectId, props.id);

      await this.withGitRollback(projectPath, async () => {
        await this.jsonFileService.delete(componentPath);
        await this.gitService.add(projectPath, [componentPath]);
        await this.gitService.commit(projectPath, {
          method: 'delete',
          reference: { objectType: 'component', id: props.id },
        });
      });

      const index = await this.getSlugIndex(props.projectId);
      delete index[props.id];
      this.setSlugIndex(props.projectId, index);
    });
  }

  /**
   * One page of Components, in whatever order the filesystem returns the
   * folders rather than any sort.
   *
   * `limit` defaults to 15 and `limit: 0` returns everything from `offset`.
   * `total` counts every Component folder in the Project rather than the
   * page, and a Component whose file fails to read or validate is logged and
   * dropped while still counted in `total`, so one broken Component never
   * fails the call.
   */
  public async list<T extends Component = Component>(
    props: ListComponentsProps
  ): Promise<PaginatedList<T>> {
    return this.validated('list', listComponentsSchema, props, async () => {
      const offset = props.offset || 0;
      const limit = props.limit ?? 15;

      const componentReferences = await this.listReferences(
        objectTypeSchema.enum.component,
        props.projectId
      );

      const partialComponentReferences =
        limit === 0
          ? componentReferences.slice(offset)
          : componentReferences.slice(offset, offset + limit);

      const components = await this.collectResults(
        partialComponentReferences.map((reference) =>
          this.read<T>({
            projectId: props.projectId,
            id: reference.id,
          })
        )
      );

      return {
        total: componentReferences.length,
        limit,
        offset,
        list: components,
      };
    });
  }

  /**
   * Counts the folders under `components/` whose name parses as a UUID,
   * without opening `component.json`. So it counts a Component whose file is
   * missing or unreadable, can exceed the length of what `list` returns, and
   * can disagree with `listAllIds`, which reads the slug index instead.
   */
  public async count(props: CountComponentsProps): Promise<number> {
    return this.validated('count', countComponentsSchema, props, async () => {
      const refs = await this.listReferences(
        objectTypeSchema.enum.component,
        props.projectId
      );
      return refs.length;
    });
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
  public async listAllIds(projectId: string): Promise<string[]> {
    const index = await this.getSlugIndex(projectId);
    return Object.keys(index);
  }

  /**
   * Migrates a potentially outdated Component file to the current schema.
   *
   * Throws `BadRequest` when the file does not match what Core expects, with
   * the underlying `ZodError` as its cause, and `VersionSkew` when it was
   * written by a newer Core than the one installed. Reads no disk.
   */
  public migrate(potentiallyOutdatedComponentFile: unknown) {
    return migrating('Component', () => {
      const loose = migrateComponentSchema.parse(
        potentiallyOutdatedComponentFile
      );
      const migrated = applyMigrations(
        loose,
        componentMigrations,
        this.coreVersion
      );
      return componentFileSchema.parse(migrated);
    });
  }

  private toComponent(componentFile: ComponentFile): Component {
    return {
      ...componentFile,
    };
  }

  /**
   * Walks `ofComponents` looking for a cycle, throwing `BadRequest` when it
   * finds one.
   *
   * An empty `ofComponents` is skipped rather than expanded to the whole slug
   * index: it declares no edge, because the schema builder answers it with a
   * permissive item schema and never recurses. `visited` is copied per
   * branch, so a diamond is re-walked rather than pruned.
   */
  private async validateNoCircularReferences(
    componentId: string | null,
    fieldDefinitions: FieldDefinition[],
    projectId: string,
    visited: Set<string> = new Set()
  ): Promise<void> {
    if (componentId !== null) {
      if (visited.has(componentId)) {
        throw CoreError.badRequest(
          `Circular component reference detected: Component "${componentId}" creates a cycle`
        );
      }
      visited.add(componentId);
    }

    const componentFieldDefs = fieldDefinitions.filter(
      (fd) => fd.valueType === 'component'
    );

    if (componentFieldDefs.length === 0) {
      return;
    }

    for (const fieldDefinition of componentFieldDefs) {
      // An unconstrained dynamic field declares no edge in the reference
      // graph. The schema builder answers an empty `ofComponents` with one
      // permissive item schema and never recurses into it, so it cannot be
      // part of a cycle. Expanding it to every Component in the Project
      // reached the Component's own id and reported it as its own cycle.
      if (
        fieldDefinition.valueType !== 'component' ||
        fieldDefinition.ofComponents.length === 0
      ) {
        continue;
      }

      for (const cId of fieldDefinition.ofComponents) {
        const component = await this.read({ projectId, id: cId });
        await this.validateNoCircularReferences(
          cId,
          component.fieldDefinitions,
          projectId,
          new Set(visited)
        );
      }
    }
  }

  /**
   * Finds dynamic field slugs that reference the given componentId, directly
   * or transitively.
   *
   * A dynamic field matches when its `ofComponents` is empty, which means
   * every Component, when it lists the id, or when one of the Components it
   * does list transitively references it.
   */
  private async findDynamicFieldsReferencingComponent(
    fieldDefinitions: FieldDefinition[],
    componentId: string,
    projectId: string,
    visited: Set<string> = new Set()
  ): Promise<string[]> {
    const result: string[] = [];

    for (const fieldDefinition of fieldDefinitions) {
      if (fieldDefinition.valueType === 'component') {
        if (
          fieldDefinition.ofComponents.length === 0 ||
          fieldDefinition.ofComponents.includes(componentId)
        ) {
          result.push(fieldDefinition.slug);
        } else {
          const referencedIds = fieldDefinition.ofComponents;
          let found = false;

          for (const referencedComponentId of referencedIds) {
            if (found) break;
            if (visited.has(referencedComponentId)) continue;

            visited.add(referencedComponentId);
            const component = await this.read({
              projectId,
              id: referencedComponentId,
            });
            const nested = await this.findDynamicFieldsReferencingComponent(
              component.fieldDefinitions,
              componentId,
              projectId,
              visited
            );
            if (nested.length > 0) {
              result.push(fieldDefinition.slug);
              found = true;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Finds all Collections and Components that reference the given componentId
   * via dynamic (ofComponents) fields.
   */
  private async findReferences(
    projectId: string,
    componentId: string
  ): Promise<Array<{ type: 'collection' | 'component'; id: string }>> {
    const results: Array<{ type: 'collection' | 'component'; id: string }> = [];

    const componentIndex = await this.getSlugIndex(projectId);
    const otherIds = Object.keys(componentIndex).filter(
      (id) => id !== componentId
    );

    for (const otherId of otherIds) {
      const other = await this.read({ projectId, id: otherId });
      if (
        this.areFieldDefinitionsReferencingComponent(
          other.fieldDefinitions,
          componentId
        )
      ) {
        results.push({ type: 'component', id: otherId });
      }
    }

    const collectionsPath = this.pathTo.collections(projectId);
    const exists = await Fs.pathExists(collectionsPath);
    if (!exists) return results;

    const collectionReferences = await this.listReferences(
      'collection',
      projectId
    );

    for (const collectionReference of collectionReferences) {
      const collectionFile = await this.jsonFileService.read(
        this.pathTo.collectionFile(projectId, collectionReference.id),
        collectionFileSchema
      );
      const fieldDefinitions = flattenFieldDefinitions(
        collectionFile.fieldDefinitions
      );
      if (
        this.areFieldDefinitionsReferencingComponent(
          fieldDefinitions,
          componentId
        )
      ) {
        results.push({ type: 'collection', id: collectionReference.id });
      }
    }

    return results;
  }

  /**
   * The one place the empty-`ofComponents` rule is decided, for both delete
   * protection and the update cascade: a `component` field matches when its
   * `ofComponents` lists the id, or when the list is empty.
   *
   * Per array and not transitive, the callers walk.
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
