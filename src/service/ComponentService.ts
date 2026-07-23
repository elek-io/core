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
import type { EntryIssue } from '../util/entryTransform.js';
import { applyMigrations, componentMigrations } from './migrations/index.js';
import { datetime, slug, uuid } from '../util/shared.js';
import { AbstractSlugIndexedEntityService } from './AbstractSlugIndexedEntityService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Component files on disk
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
    gitService: GitService
  ) {
    super(
      serviceTypeSchema.enum.Component,
      options,
      pathTo,
      logService,
      jsonFileService,
      gitService
    );

    this.coreVersion = coreVersion;
  }

  /**
   * Resolves a UUID-or-slug string to a component UUID.
   */
  public async resolveComponentId(
    props: ResolveComponentIdProps
  ): Promise<string> {
    return this.resolveId(props.projectId, props.idOrSlug);
  }

  /**
   * Creates a new Component
   *
   * Core generates the Component's `id`, but field-definition `id`s are
   * caller-supplied (pass a UUID per field definition, for example via
   * `uuid()`). They become the stable identity used to match field definitions
   * on later updates, see `update`.
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

        if (Object.values(index).includes(componentSlug)) {
          throw CoreError.conflict(
            `Component slug "${componentSlug}" is already in use by another component`
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
        await this.safeWriteSlugIndex(validatedProps.projectId, index);
        return this.toComponent(componentFile) as T;
      }
    );
  }

  /**
   * Returns a Component by ID
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
          return this.toComponent(componentFile) as T;
        }
      }
    );
  }

  /**
   * Reads a Component by its slug
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
   * Returns the commit history of a Component
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
   * Updates given Component
   *
   * Field definitions are matched by `id`. Send back the `id` of every field
   * definition you want to keep so Core matches it to the existing one and
   * preserves the entry data stored under it, even across slug renames or type
   * changes. A field definition with no `id` (or a changed `id`) is treated as
   * new, so the old field and the entry data keyed to it is removed. Ids are
   * caller-supplied (Core does not generate them), so always round-trip the
   * ids you read.
   *
   * Handles fieldDefinition change cascade across all entries that reference
   * this Component. Deterministic changes (slug renames, field removals,
   * additions with defaults) are applied automatically. Ambiguous changes
   * throw CoreError.conflict() with structured issues.
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
          await this.safeWriteSlugIndex(validatedProps.projectId, index);
        }

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
      ([, slug]) => slug === newSlug
    );
    if (existingUuid && existingUuid[0] !== componentId) {
      throw CoreError.conflict(
        `Component slug "${newSlug}" is already in use by another component`
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
            languages
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
                languages
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
   * Applies a single Entry's resolutions onto its final values in place.
   *
   * Each resolved value is validated against its field definition schema before
   * being written, throwing on a validation failure.
   */
  private applyEntryResolutions(
    finalValues: Record<string, Value>,
    resolutions: NonNullable<UpdateComponentProps['resolutions']>,
    entryId: Uuid,
    newFieldDefs: FieldDefinition[],
    languages: ProjectLanguages
  ): void {
    const entryResolutions = resolutions[entryId];
    if (!entryResolutions) return;

    for (const [fieldSlug, resolvedValue] of Object.entries(entryResolutions)) {
      const fieldDef = newFieldDefs.find((fd) => fd.slug === fieldSlug);
      if (fieldDef) {
        const schema = getValueSchemaFromFieldDefinition(fieldDef, languages);
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
   * Blocks deletion if the Component is still referenced by a Collection or another Component.
   */
  public async delete(props: DeleteComponentProps): Promise<void> {
    return this.mutating('delete', deleteComponentSchema, props, async () => {
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
        await Fs.remove(componentPath);
        await this.gitService.add(projectPath, [componentPath]);
        await this.gitService.commit(projectPath, {
          method: 'delete',
          reference: { objectType: 'component', id: props.id },
        });
      });

      const index = await this.getSlugIndex(props.projectId);
      delete index[props.id];
      await this.safeWriteSlugIndex(props.projectId, index);
    });
  }

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
      let componentIds: string[];

      if (
        fieldDefinition.valueType === 'component' &&
        fieldDefinition.ofComponents.length > 0
      ) {
        componentIds = fieldDefinition.ofComponents;
      } else {
        const index = await this.getSlugIndex(projectId);
        componentIds = Object.keys(index);
      }

      for (const cId of componentIds) {
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
   * Finds dynamic field slugs that (transitively) reference the given componentId.
   * A dynamic field references a component if its ofComponents contains the componentId,
   * or if any of its ofComponents' own fieldDefinitions transitively reference it.
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
