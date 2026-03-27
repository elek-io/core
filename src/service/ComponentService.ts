import Fs from 'fs-extra';
import { CoreError } from '../util/shared.js';
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
  public async resolveComponentId(
    props: ResolveComponentIdProps
  ): Promise<string> {
    return this.resolveId(props.projectId, props.idOrSlug);
  }

  /**
   * Creates a new Component
   */
  public async create<T extends Component = Component>(
    props: CreateComponentProps
  ): Promise<T> {
    return this.validated(
      'create',
      createComponentSchema,
      props,
      async (validatedProps) => {
        await this.validateNoCircularReferences(
          null,
          validatedProps.fieldDefinitions,
          validatedProps.projectId
        );

        const id = uuid();
        const projectPath = pathTo.project(validatedProps.projectId);
        const componentPath = pathTo.component(validatedProps.projectId, id);
        const componentFilePath = pathTo.componentFile(
          validatedProps.projectId,
          id
        );
        const componentSlug = slug(validatedProps.slug);

        const index = await this.getIndex(validatedProps.projectId);

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

        await this.withGitRollback(
          projectPath,
          async () => {
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
          },
          [componentPath]
        );

        index[id] = componentSlug;
        await this.safeWriteIndex(validatedProps.projectId, index);
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
      async () => {
        if (!props.commitHash) {
          const componentFile = await this.jsonFileService.read(
            pathTo.componentFile(props.projectId, props.id),
            componentFileSchema
          );
          return this.toComponent(componentFile) as T;
        } else {
          const content = await this.gitService.getFileContentAtCommit(
            pathTo.project(props.projectId),
            pathTo.componentFile(props.projectId, props.id),
            props.commitHash
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
      async () => {
        return this.gitService.log(pathTo.project(props.projectId), {
          filePath: pathTo.componentFile(props.projectId, props.id),
        });
      }
    );
  }

  /**
   * Updates given Component
   *
   * Handles fieldDefinition slug rename cascade: when a sub-field slug changes
   * (matched by UUID), all Entry data referencing this Component is updated.
   */
  public async update<T extends Component = Component>(
    props: UpdateComponentProps
  ): Promise<T> {
    return this.validated(
      'update',
      updateComponentSchema,
      props,
      async (validatedProps) => {
        await this.validateNoCircularReferences(
          validatedProps.id,
          validatedProps.fieldDefinitions,
          validatedProps.projectId
        );

        const projectPath = pathTo.project(validatedProps.projectId);
        const componentFilePath = pathTo.componentFile(
          validatedProps.projectId,
          validatedProps.id
        );

        const prevComponentFile = await this.read(validatedProps);

        const { projectId: _, ...validatedUpdateProps } = validatedProps;
        const componentFile: ComponentFile = {
          ...prevComponentFile,
          ...validatedUpdateProps,
          updated: datetime(),
        };

        const newSlug = slug(validatedProps.slug);

        // If component slug changed, enforce uniqueness before mutating
        if (prevComponentFile.slug !== newSlug) {
          const index = await this.getIndex(validatedProps.projectId);
          const existingUuid = Object.entries(index).find(
            ([, s]) => s === newSlug
          );
          if (existingUuid && existingUuid[0] !== validatedProps.id) {
            throw CoreError.conflict(
              `Component slug "${newSlug}" is already in use by another component`
            );
          }
        }

        const oldFieldDefs = prevComponentFile.fieldDefinitions;
        const newFieldDefs = validatedProps.fieldDefinitions;
        const slugRenames: Array<{ oldSlug: string; newSlug: string }> = [];

        const oldByUuid = new Map(oldFieldDefs.map((fd) => [fd.id, fd]));
        for (const newFd of newFieldDefs) {
          const oldFd = oldByUuid.get(newFd.id);
          if (oldFd && oldFd.slug !== newFd.slug) {
            slugRenames.push({
              oldSlug: oldFd.slug,
              newSlug: newFd.slug,
            });
          }
        }

        await this.withGitRollback(projectPath, async () => {
          const filesToGitAdd: string[] = [componentFilePath];

          if (slugRenames.length > 0) {
            const cascadedFiles = await this.cascadeComponentSlugRenames(
              validatedProps.projectId,
              validatedProps.id,
              slugRenames
            );
            filesToGitAdd.push(...cascadedFiles);
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
          const index = await this.getIndex(validatedProps.projectId);
          index[validatedProps.id] = newSlug;
          await this.safeWriteIndex(validatedProps.projectId, index);
        }

        return this.toComponent(componentFile) as T;
      }
    );
  }

  /**
   * Deletes given Component
   *
   * Blocks deletion if the Component is still referenced by a Collection or another Component.
   */
  public async delete(props: DeleteComponentProps): Promise<void> {
    return this.validated(
      'delete',
      deleteComponentSchema,
      props,
      async () => {
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

        const projectPath = pathTo.project(props.projectId);
        const componentPath = pathTo.component(props.projectId, props.id);

        await this.withGitRollback(projectPath, async () => {
          await Fs.remove(componentPath);
          await this.gitService.add(projectPath, [componentPath]);
          await this.gitService.commit(projectPath, {
            method: 'delete',
            reference: { objectType: 'component', id: props.id },
          });
        });

        const index = await this.getIndex(props.projectId);
        delete index[props.id];
        await this.safeWriteIndex(props.projectId, index);
      }
    );
  }

  public async list<T extends Component = Component>(
    props: ListComponentsProps
  ): Promise<PaginatedList<T>> {
    return this.validated(
      'list',
      listComponentsSchema,
      props,
      async () => {
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
      }
    );
  }

  public async count(props: CountComponentsProps): Promise<number> {
    return this.validated(
      'count',
      countComponentsSchema,
      props,
      async () => {
        const refs = await this.listReferences(
          objectTypeSchema.enum.component,
          props.projectId
        );
        return refs.length;
      }
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
  public async listAllIds(projectId: string): Promise<string[]> {
    const index = await this.getIndex(projectId);
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
        const index = await this.getIndex(projectId);
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
   * Cascades field definition slug renames through all Entries that reference
   * this Component (directly or nested inside other Components).
   * Returns the list of modified Entry file paths for git staging.
   */
  private async cascadeComponentSlugRenames(
    projectId: string,
    componentId: string,
    slugRenames: Array<{ oldSlug: string; newSlug: string }>
  ): Promise<string[]> {
    const modifiedFiles: string[] = [];
    const collectionsPath = pathTo.collections(projectId);

    const exists = await Fs.pathExists(collectionsPath);
    if (!exists) return modifiedFiles;

    const collectionFolders = await folders(collectionsPath);
    const validFolders = collectionFolders.filter(
      (f) => uuidSchema.safeParse(f.name).success
    );

    for (const collectionFolder of validFolders) {
      const collectionFile = await this.jsonFileService.read(
        pathTo.collectionFile(projectId, collectionFolder.name),
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

      const entriesPath = pathTo.entries(projectId, collectionFolder.name);

      const entriesExist = await Fs.pathExists(entriesPath);
      if (!entriesExist) continue;

      const allEntryFiles = await Fs.readdir(entriesPath);
      const entryFiles = allEntryFiles.filter(
        (entryFile) =>
          entryFile.endsWith('.json') && entryFile !== 'collection.json'
      );

      for (const entryFileName of entryFiles) {
        const entryId = entryFileName.replace('.json', '');
        const entryFilePath = pathTo.entryFile(
          projectId,
          collectionFolder.name,
          entryId
        );

        const entryFile = await this.jsonFileService.read(
          entryFilePath,
          entryFileSchema
        );

        let changed = false;
        const newValues = { ...entryFile.values };

        for (const s of referencingDynamicFields) {
          const dynamicValue = newValues[s];
          if (dynamicValue && Array.isArray(dynamicValue.content)) {
            for (const contentObject of dynamicValue.content) {
              if (contentObject.componentId === componentId) {
                for (const {
                  oldSlug,
                  newSlug: renamedSlug,
                } of slugRenames) {
                  if (oldSlug in contentObject.values) {
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
          await this.jsonFileService.update(
            updatedEntryFile,
            entryFilePath,
            entryFileSchema
          );
          modifiedFiles.push(entryFilePath);
        }
      }
    }

    return modifiedFiles;
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

    const componentIndex = await this.getIndex(projectId);
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

    const collectionsPath = pathTo.collections(projectId);
    const exists = await Fs.pathExists(collectionsPath);
    if (!exists) return results;

    const collectionFolders = await folders(collectionsPath);
    const validFolders = collectionFolders.filter(
      (f) => uuidSchema.safeParse(f.name).success
    );

    for (const folder of validFolders) {
      const collectionFile = await this.jsonFileService.read(
        pathTo.collectionFile(projectId, folder.name),
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
        results.push({ type: 'collection', id: folder.name });
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
