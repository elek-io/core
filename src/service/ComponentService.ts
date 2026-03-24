import Fs from 'fs-extra';
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
  private gitService: GitService;

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
    super(serviceTypeSchema.enum.Component, options, logService, jsonFileService);

    this.coreVersion = coreVersion;
    this.gitService = gitService;
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
  public async create(props: CreateComponentProps): Promise<Component> {
    const validatedProps = createComponentSchema.parse(props);

    await this.validateNoCircularReferences(
      null,
      validatedProps.fieldDefinitions,
      validatedProps.projectId
    );

    const id = uuid();
    const projectPath = pathTo.project(validatedProps.projectId);
    const componentPath = pathTo.component(validatedProps.projectId, id);
    const componentFilePath = pathTo.componentFile(validatedProps.projectId, id);
    const componentSlug = slug(validatedProps.slug);

    // Enforce component slug uniqueness via index
    const index = await this.getIndex(validatedProps.projectId);
    if (Object.values(index).includes(componentSlug)) {
      throw new Error(
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

    // Update the index (not git-tracked)
    index[id] = componentSlug;
    await this.writeIndex(validatedProps.projectId, index);

    return this.toComponent(componentFile);
  }

  /**
   * Returns a Component by ID
   */
  public async read(props: ReadComponentProps): Promise<Component> {
    readComponentSchema.parse(props);

    if (!props.commitHash) {
      const componentFile = await this.jsonFileService.read(
        pathTo.componentFile(props.projectId, props.id),
        componentFileSchema
      );

      return this.toComponent(componentFile);
    } else {
      const componentFile = this.migrate(
        JSON.parse(
          await this.gitService.getFileContentAtCommit(
            pathTo.project(props.projectId),
            pathTo.componentFile(props.projectId, props.id),
            props.commitHash
          )
        )
      );

      return this.toComponent(componentFile);
    }
  }

  /**
   * Reads a Component by its slug
   */
  public async readBySlug(props: ReadBySlugComponentProps): Promise<Component> {
    const id = await this.resolveComponentId({
      projectId: props.projectId,
      idOrSlug: props.slug,
    });
    return this.read({
      projectId: props.projectId,
      id,
      commitHash: props.commitHash,
    });
  }

  /**
   * Returns the commit history of a Component
   */
  public async history(props: ComponentHistoryProps): Promise<GitCommit[]> {
    componentHistorySchema.parse(props);

    return this.gitService.log(pathTo.project(props.projectId), {
      filePath: pathTo.componentFile(props.projectId, props.id),
    });
  }

  /**
   * Updates given Component
   *
   * Handles fieldDefinition slug rename cascade: when a sub-field slug changes
   * (matched by UUID), all Entry data referencing this Component is updated.
   */
  public async update(props: UpdateComponentProps): Promise<Component> {
    const validatedProps = updateComponentSchema.parse(props);

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

    const filesToGitAdd: string[] = [componentFilePath];

    // If component slug changed, enforce uniqueness
    const newSlug = slug(validatedProps.slug);
    if (prevComponentFile.slug !== newSlug) {
      const index = await this.getIndex(validatedProps.projectId);
      const existingUuid = Object.entries(index).find(([, s]) => s === newSlug);
      if (existingUuid && existingUuid[0] !== validatedProps.id) {
        throw new Error(
          `Component slug "${newSlug}" is already in use by another component`
        );
      }
      index[validatedProps.id] = newSlug;
      await this.writeIndex(validatedProps.projectId, index);
    }

    // FieldDefinition slug rename cascade:
    // Match old and new fieldDefinitions by UUID to detect slug renames
    const oldFieldDefs = prevComponentFile.fieldDefinitions;
    const newFieldDefs = validatedProps.fieldDefinitions;
    const slugRenames: Array<{ oldSlug: string; newSlug: string }> = [];

    const oldByUuid = new Map(oldFieldDefs.map((fd) => [fd.id, fd]));
    for (const newFd of newFieldDefs) {
      const oldFd = oldByUuid.get(newFd.id);
      if (oldFd && oldFd.slug !== newFd.slug) {
        slugRenames.push({ oldSlug: oldFd.slug, newSlug: newFd.slug });
      }
    }

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
      reference: { objectType: 'component', id: componentFile.id },
    });

    return this.toComponent(componentFile);
  }

  /**
   * Deletes given Component
   *
   * Blocks deletion if the Component is still referenced by a Collection or another Component.
   */
  public async delete(props: DeleteComponentProps): Promise<void> {
    deleteComponentSchema.parse(props);

    // Check if any Collection or Component references this one
    const referencingEntities = await this.findReferences(
      props.projectId,
      props.id
    );
    if (referencingEntities.length > 0) {
      const refs = referencingEntities
        .map((r) => `${r.type} "${r.id}"`)
        .join(', ');
      throw new Error(
        `Cannot delete Component "${props.id}": it is still referenced by ${refs}`
      );
    }

    const projectPath = pathTo.project(props.projectId);
    const componentPath = pathTo.component(props.projectId, props.id);

    await Fs.remove(componentPath);
    await this.gitService.add(projectPath, [componentPath]);
    await this.gitService.commit(projectPath, {
      method: 'delete',
      reference: { objectType: 'component', id: props.id },
    });

    // Remove from index
    const index = await this.getIndex(props.projectId);
    delete index[props.id];
    await this.writeIndex(props.projectId, index);
  }

  public async list(
    props: ListComponentsProps
  ): Promise<PaginatedList<Component>> {
    listComponentsSchema.parse(props);

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

    const components = await this.settleAndWarn(
      partialComponentReferences.map((reference) => {
        return this.read({
          projectId: props.projectId,
          id: reference.id,
        });
      })
    );

    return {
      total: componentReferences.length,
      limit,
      offset,
      list: components,
    };
  }

  public async count(props: CountComponentsProps): Promise<number> {
    countComponentsSchema.parse(props);

    return (
      await this.listReferences(
        objectTypeSchema.enum.component,
        props.projectId
      )
    ).length;
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
        throw new Error(
          `Circular component reference detected: Component "${componentId}" creates a cycle`
        );
      }
      visited.add(componentId);
    }

    for (const fieldDefinition of fieldDefinitions) {
      if (fieldDefinition.valueType === 'component') {
        const componentIds =
          fieldDefinition.ofComponents.length > 0
            ? fieldDefinition.ofComponents
            : Object.keys(await this.getIndex(projectId));
        for (const componentId of componentIds) {
          const component = await this.read({ projectId, id: componentId });
          await this.validateNoCircularReferences(
            componentId,
            component.fieldDefinitions,
            projectId,
            new Set(visited)
          );
        }
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

    // Find all Collections that (transitively) reference this Component
    const collectionsPath = pathTo.collections(projectId);
    if (!(await Fs.pathExists(collectionsPath))) return modifiedFiles;

    const collectionFolders = await folders(collectionsPath);
    for (const collectionFolder of collectionFolders) {
      if (!uuidSchema.safeParse(collectionFolder.name).success) continue;

      const collectionFile = await this.jsonFileService.read(
        pathTo.collectionFile(projectId, collectionFolder.name),
        collectionFileSchema
      );
      const fieldDefs = flattenFieldDefinitions(
        collectionFile.fieldDefinitions
      );

      // Check if any dynamic field transitively references our component
      const referencingDynamicFields =
        await this.findDynamicFieldsReferencingComponent(
          fieldDefs,
          componentId,
          projectId
        );
      if (referencingDynamicFields.length === 0) continue;

      // Process all Entries of this Collection
      const entriesPath = pathTo.entries(projectId, collectionFolder.name);
      if (!(await Fs.pathExists(entriesPath))) continue;

      const entryFiles = (await Fs.readdir(entriesPath)).filter(
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

        for (const slug of referencingDynamicFields) {
          const dynamicValue = newValues[slug];
          if (dynamicValue && Array.isArray(dynamicValue.content)) {
            for (const contentObject of dynamicValue.content) {
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

              // Handle nested: if this item's values contain dynamic values,
              // recurse into them
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
          const updatedEntryFile = { ...entryFile, values: newValues };
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
          // Check transitively: do any of the referenced components reference our target?
          for (const referencedComponentId of fieldDefinition.ofComponents) {
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
              break;
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

    // Check other components
    const componentIndex = await this.getIndex(projectId);
    for (const otherId of Object.keys(componentIndex)) {
      if (otherId === componentId) continue;
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

    // Check collections
    const collectionsPath = pathTo.collections(projectId);
    if (await Fs.pathExists(collectionsPath)) {
      const collectionFolders = await folders(collectionsPath);
      for (const folder of collectionFolders) {
        if (!uuidSchema.safeParse(folder.name).success) continue;
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
