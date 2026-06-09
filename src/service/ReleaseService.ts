import { isDeepStrictEqual } from 'node:util';
import Semver from 'semver';
import {
  assetFileSchema,
  collectionFileSchema,
  componentFileSchema,
  entryFileSchema,
  projectBranchSchema,
  projectFileSchema,
  serviceTypeSchema,
  prepareReleaseSchema,
  createReleaseSchema,
  createPreviewReleaseSchema,
  type AssetChange,
  type AssetFile,
  type CollectionFile,
  type ComponentChange,
  type ComponentFieldChange,
  type ComponentFile,
  type ElekIoCoreOptions,
  type EntryChange,
  type EntryFile,
  flattenFieldDefinitions,
  type FieldDefinition,
  type PrepareReleaseProps,
  type CreateReleaseProps,
  type CreatePreviewReleaseProps,
  type ProjectChange,
  type ProjectFile,
  type ReleaseDiff,
  type ReleaseResult,
  type SemverBump,
  type FieldChange,
  type CollectionChange,
} from '../schema/index.js';
import { pathTo } from '../util/node.js';
import { CoreError, datetime } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';
import type { ProjectService } from './ProjectService.js';

/**
 * Service that manages Release functionality
 *
 * A release diffs the current `work` branch against the `production` branch
 * to determine what changed, computes a semver bump, and merges work into production.
 */
export class ReleaseService extends AbstractService {
  private gitService: GitService;
  private jsonFileService: JsonFileService;
  private projectService: ProjectService;

  constructor(
    options: ElekIoCoreOptions,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    projectService: ProjectService
  ) {
    super(serviceTypeSchema.enum.Release, options, logService);

    this.gitService = gitService;
    this.jsonFileService = jsonFileService;
    this.projectService = projectService;
  }

  /**
   * Prepares a release by diffing the current `work` branch against `production`.
   *
   * Returns a read-only summary of all changes and the computed next version.
   * If there are no changes, the next version and bump will be null.
   */
  public prepare(props: PrepareReleaseProps): Promise<ReleaseDiff> {
    return this.validated('prepare', prepareReleaseSchema, props, async () => {
      const projectPath = pathTo.project(props.projectId);
      const productionRef = projectBranchSchema.enum.production;

      const currentBranch = await this.gitService.branches.current(projectPath);
      if (currentBranch !== projectBranchSchema.enum.work) {
        throw CoreError.preconditionFailed(
          `Not on work branch (currently on "${currentBranch}")`
        );
      }

      const project = await this.projectService.read({ id: props.projectId });
      const currentVersion = project.version;

      const productionProject = await this.getProjectAtRef(
        props.projectId,
        projectPath,
        productionRef
      );
      const projectDiff = this.diffProject(project, productionProject);

      const currentCollections = await this.getCollectionsAtRef(
        props.projectId,
        projectPath,
        projectBranchSchema.enum.work
      );
      const productionCollections = await this.getCollectionsAtRef(
        props.projectId,
        projectPath,
        productionRef
      );
      const collectionDiff = this.diffCollections(
        currentCollections,
        productionCollections
      );

      const currentAssets = await this.getAssetsAtRef(
        props.projectId,
        projectPath,
        projectBranchSchema.enum.work
      );
      const productionAssets = await this.getAssetsAtRef(
        props.projectId,
        projectPath,
        productionRef
      );
      const assetDiff = this.diffAssets(currentAssets, productionAssets);

      const currentComponents = await this.getComponentsAtRef(
        props.projectId,
        projectPath,
        projectBranchSchema.enum.work
      );
      const productionComponents = await this.getComponentsAtRef(
        props.projectId,
        projectPath,
        productionRef
      );
      const componentDiff = this.diffComponents(
        currentComponents,
        productionComponents
      );

      const allCollectionIds = new Set([
        ...currentCollections.map((c) => c.id),
        ...productionCollections.map((c) => c.id),
      ]);

      const entryDiff = await this.diffEntries(
        props.projectId,
        projectPath,
        allCollectionIds,
        productionRef
      );

      // Combine bumps from all diffs
      let finalBump: SemverBump | null = null;
      for (const bump of [
        projectDiff.bump,
        collectionDiff.bump,
        componentDiff.bump,
        assetDiff.bump,
        entryDiff.bump,
      ]) {
        if (bump) {
          finalBump = finalBump ? this.higherBump(finalBump, bump) : bump;
        }
      }

      if (!finalBump) {
        const hasContentChanges = await this.hasCommitsBetween(
          projectPath,
          productionRef,
          projectBranchSchema.enum.work
        );
        if (hasContentChanges) {
          finalBump = 'patch';
        }
      }

      const nextVersion = finalBump
        ? Semver.inc(currentVersion, finalBump)
        : null;

      return {
        project,
        bump: finalBump,
        currentVersion,
        nextVersion,
        projectChanges: projectDiff.projectChanges,
        collectionChanges: collectionDiff.collectionChanges,
        fieldChanges: collectionDiff.fieldChanges,
        componentChanges: componentDiff.componentChanges,
        componentFieldChanges: componentDiff.componentFieldChanges,
        assetChanges: assetDiff.assetChanges,
        entryChanges: entryDiff.entryChanges,
      };
    });
  }

  /**
   * Creates a release by:
   * 1. Recomputing the diff (stateless)
   * 2. Merging `work` into `production`
   * 3. Updating the project version on `production`
   * 4. Tagging on `production`
   * 5. Merging `production` back into `work` (fast-forward to sync the version commit)
   * 6. Switching back to `work`
   */
  public create(props: CreateReleaseProps): Promise<ReleaseResult> {
    return this.validated('create', createReleaseSchema, props, async () => {
      const projectPath = pathTo.project(props.projectId);
      const projectFilePath = pathTo.projectFile(props.projectId);

      const diff = await this.prepare(props);

      if (!diff.bump || !diff.nextVersion) {
        throw CoreError.preconditionFailed(
          'Cannot create a release: no changes detected since the last full release'
        );
      }

      const nextVersion = diff.nextVersion;

      try {
        await this.gitService.branches.switch(
          projectPath,
          projectBranchSchema.enum.production
        );
        await this.gitService.merge(projectPath, projectBranchSchema.enum.work);

        const updatedProjectFile = {
          ...diff.project,
          version: nextVersion,
          updated: datetime(),
        };

        await this.jsonFileService.update(
          updatedProjectFile,
          projectFilePath,
          projectFileSchema
        );
        await this.gitService.add(projectPath, [projectFilePath]);
        await this.gitService.commit(projectPath, {
          method: 'release',
          reference: { objectType: 'project', id: props.projectId },
        });
        await this.gitService.tags.create({
          path: projectPath,
          message: { type: 'release', version: nextVersion },
        });
        await this.gitService.branches.switch(
          projectPath,
          projectBranchSchema.enum.work
        );
        await this.gitService.merge(
          projectPath,
          projectBranchSchema.enum.production
        );

        this.logService.info({
          source: 'core',
          message: `Released version ${nextVersion} (${diff.bump} bump)`,
        });

        return {
          version: nextVersion,
          diff,
        };
      } catch (error) {
        // Best-effort recovery: switch back to work branch
        try {
          await this.gitService.branches.switch(
            projectPath,
            projectBranchSchema.enum.work
          );
        } catch {
          // Ignore recovery failure
        }
        throw error;
      }
    });
  }

  /**
   * Creates a preview release by:
   * 1. Recomputing the diff (stateless)
   * 2. Computing the preview version (e.g. 1.1.0-preview.3)
   * 3. Updating the project version on `work`
   * 4. Tagging on `work` (no merge into production)
   *
   * Preview releases are snapshots of the current work state.
   * They don't promote to production - only full releases do.
   */
  public createPreview(
    props: CreatePreviewReleaseProps
  ): Promise<ReleaseResult> {
    return this.validated(
      'createPreview',
      createPreviewReleaseSchema,
      props,
      async () => {
        const projectPath = pathTo.project(props.projectId);
        const projectFilePath = pathTo.projectFile(props.projectId);

        const diff = await this.prepare(props);

        if (!diff.bump || !diff.nextVersion) {
          throw CoreError.preconditionFailed(
            'Cannot create a preview release: no changes detected since the last full release'
          );
        }

        const previewNumber = await this.countPreviewsSinceLastRelease(
          projectPath,
          diff.nextVersion
        );
        const previewVersion = `${diff.nextVersion}-preview.${previewNumber + 1}`;

        const updatedProjectFile = {
          ...diff.project,
          version: previewVersion,
          updated: datetime(),
        };

        try {
          await this.jsonFileService.update(
            updatedProjectFile,
            projectFilePath,
            projectFileSchema
          );
          await this.gitService.add(projectPath, [projectFilePath]);
          await this.gitService.commit(projectPath, {
            method: 'release',
            reference: { objectType: 'project', id: props.projectId },
          });
          await this.gitService.tags.create({
            path: projectPath,
            message: { type: 'preview', version: previewVersion },
          });

          this.logService.info({
            source: 'core',
            message: `Preview released version ${previewVersion} (${diff.bump} bump)`,
          });

          return {
            version: previewVersion,
            diff,
          };
        } catch (error) {
          // Best-effort recovery: switch back to work branch
          try {
            await this.gitService.branches.switch(
              projectPath,
              projectBranchSchema.enum.work
            );
          } catch {
            // Ignore recovery failure
          }
          throw error;
        }
      }
    );
  }

  /**
   * Reads the project file as it exists at a given git ref
   */
  private async getProjectAtRef(
    projectId: string,
    projectPath: string,
    ref: string
  ): Promise<ProjectFile | null> {
    try {
      const content = await this.gitService.getFileContentAtCommit(
        projectPath,
        pathTo.projectFile(projectId),
        ref
      );
      return projectFileSchema.parse(JSON.parse(content));
    } catch {
      // Project may not exist at this ref (first release scenario)
      return null;
    }
  }

  /**
   * Reads asset metadata files as they exist at a given git ref
   */
  private async getAssetsAtRef(
    projectId: string,
    projectPath: string,
    ref: string
  ): Promise<AssetFile[]> {
    const assetsPath = pathTo.assets(projectId);
    const fileNames = await this.gitService.listTreeAtCommit(
      projectPath,
      assetsPath,
      ref
    );
    const assets: AssetFile[] = [];
    const jsonFiles = fileNames.filter((f) => f.endsWith('.json'));

    for (const fileName of jsonFiles) {
      const assetId = fileName.replace('.json', '');
      const assetFilePath = pathTo.assetFile(projectId, assetId);

      try {
        const content = await this.gitService.getFileContentAtCommit(
          projectPath,
          assetFilePath,
          ref
        );
        const parsed = assetFileSchema.safeParse(JSON.parse(content));
        if (parsed.success) {
          assets.push(parsed.data);
        }
      } catch {
        this.logService.debug({
          source: 'core',
          message: `Skipping asset "${fileName}" at ref "${ref}" during release diff`,
        });
      }
    }

    return assets;
  }

  /**
   * Reads entry files for a single collection as they exist at a given git ref
   */
  private async getEntriesAtRef(
    projectId: string,
    projectPath: string,
    collectionId: string,
    ref: string
  ): Promise<EntryFile[]> {
    const entriesPath = pathTo.entries(projectId, collectionId);
    const fileNames = await this.gitService.listTreeAtCommit(
      projectPath,
      entriesPath,
      ref
    );
    const entries: EntryFile[] = [];
    const entryFiles = fileNames.filter(
      (f) => f.endsWith('.json') && f !== 'collection.json'
    );

    for (const fileName of entryFiles) {
      const entryId = fileName.replace('.json', '');
      const entryFilePath = pathTo.entryFile(projectId, collectionId, entryId);

      try {
        const content = await this.gitService.getFileContentAtCommit(
          projectPath,
          entryFilePath,
          ref
        );
        const parsed = entryFileSchema.safeParse(JSON.parse(content));
        if (parsed.success) {
          entries.push(parsed.data);
        }
      } catch {
        this.logService.debug({
          source: 'core',
          message: `Skipping entry "${fileName}" in collection "${collectionId}" at ref "${ref}" during release diff`,
        });
      }
    }

    return entries;
  }

  /**
   * Reads collections as they exist at a given git ref (branch or commit)
   */
  private async getCollectionsAtRef(
    projectId: string,
    projectPath: string,
    ref: string
  ): Promise<CollectionFile[]> {
    const collectionsPath = pathTo.collections(projectId);
    const folderNames = await this.gitService.listTreeAtCommit(
      projectPath,
      collectionsPath,
      ref
    );
    const collections: CollectionFile[] = [];

    for (const folderName of folderNames) {
      const collectionFilePath = pathTo.collectionFile(projectId, folderName);

      try {
        const content = await this.gitService.getFileContentAtCommit(
          projectPath,
          collectionFilePath,
          ref
        );
        const parsed = collectionFileSchema.safeParse(JSON.parse(content));
        if (parsed.success) {
          collections.push(parsed.data);
        }
      } catch {
        this.logService.debug({
          source: 'core',
          message: `Skipping folder "${folderName}" at ref "${ref}" during release diff`,
        });
      }
    }

    return collections;
  }

  /**
   * Reads component files as they exist at a given git ref
   */
  private async getComponentsAtRef(
    projectId: string,
    projectPath: string,
    ref: string
  ): Promise<ComponentFile[]> {
    const componentsPath = pathTo.components(projectId);
    const folderNames = await this.gitService.listTreeAtCommit(
      projectPath,
      componentsPath,
      ref
    );
    const components: ComponentFile[] = [];

    for (const folderName of folderNames) {
      const componentFilePath = pathTo.componentFile(projectId, folderName);

      try {
        const content = await this.gitService.getFileContentAtCommit(
          projectPath,
          componentFilePath,
          ref
        );
        const parsed = componentFileSchema.safeParse(JSON.parse(content));
        if (parsed.success) {
          components.push(parsed.data);
        }
      } catch {
        this.logService.debug({
          source: 'core',
          message: `Skipping component folder "${folderName}" at ref "${ref}" during release diff`,
        });
      }
    }

    return components;
  }

  /**
   * Diffs two sets of components and returns all changes with the computed bump level.
   *
   * Component-level changes: added (MINOR), deleted (MAJOR).
   * Field-level changes within matched components reuse the same rules as collection fields.
   */
  private diffComponents(
    currentComponents: ComponentFile[],
    productionComponents: ComponentFile[]
  ): {
    bump: SemverBump | null;
    componentChanges: ComponentChange[];
    componentFieldChanges: ComponentFieldChange[];
  } {
    const componentChanges: ComponentChange[] = [];
    const componentFieldChanges: ComponentFieldChange[] = [];
    let highestBump: SemverBump | null = null;

    const currentById = new Map(currentComponents.map((c) => [c.id, c]));
    const productionById = new Map(productionComponents.map((c) => [c.id, c]));

    // Deleted components (in production but not in current) - MAJOR
    for (const [id] of productionById) {
      if (!currentById.has(id)) {
        componentChanges.push({
          componentId: id,
          changeType: 'deleted',
          bump: 'major',
        });
        highestBump = 'major';
      }
    }

    // New components (in current but not in production) - MINOR
    for (const [id] of currentById) {
      if (!productionById.has(id)) {
        componentChanges.push({
          componentId: id,
          changeType: 'added',
          bump: 'minor',
        });
        highestBump = this.higherBump(highestBump, 'minor');
      }
    }

    // Matched components - diff their field definitions
    for (const [id, currentComponent] of currentById) {
      const productionComponent = productionById.get(id);
      if (!productionComponent) continue;

      const changes = this.diffComponentFieldDefinitions(
        id,
        currentComponent.fieldDefinitions,
        productionComponent.fieldDefinitions
      );

      componentFieldChanges.push(...changes);

      for (const change of changes) {
        highestBump = this.higherBump(highestBump, change.bump);
      }
    }

    return { bump: highestBump, componentChanges, componentFieldChanges };
  }

  /**
   * Diffs field definitions of a single component.
   * Reuses the same classification rules as collection field diffs.
   */
  private diffComponentFieldDefinitions(
    componentId: string,
    currentFields: FieldDefinition[],
    productionFields: FieldDefinition[]
  ): ComponentFieldChange[] {
    const changes: ComponentFieldChange[] = [];

    const currentById = new Map(currentFields.map((f) => [f.id, f]));
    const productionById = new Map(productionFields.map((f) => [f.id, f]));

    // Deleted fields - MAJOR
    for (const [id, field] of productionById) {
      if (!currentById.has(id)) {
        changes.push({
          componentId,
          fieldId: id,
          fieldSlug: field.slug,
          changeType: 'deleted',
          bump: 'major',
        });
      }
    }

    // New fields - MINOR
    for (const [id, field] of currentById) {
      if (!productionById.has(id)) {
        changes.push({
          componentId,
          fieldId: id,
          fieldSlug: field.slug,
          changeType: 'added',
          bump: 'minor',
        });
      }
    }

    // Matched fields - compare property by property
    for (const [id, currentField] of currentById) {
      const productionField = productionById.get(id);
      if (!productionField) continue;

      const fieldChanges = this.diffSingleField(
        componentId,
        currentField,
        productionField
      );

      // Map FieldChange to ComponentFieldChange
      for (const fc of fieldChanges) {
        changes.push({
          componentId,
          fieldId: fc.fieldId,
          fieldSlug: fc.fieldSlug,
          changeType: fc.changeType,
          bump: fc.bump,
        });
      }
    }

    return changes;
  }

  /**
   * Checks if there are any commits between two refs
   */
  private async hasCommitsBetween(
    projectPath: string,
    from: string,
    to: string
  ): Promise<boolean> {
    try {
      const commits = await this.gitService.log(projectPath, {
        between: { from, to },
      });
      return commits.length > 0;
    } catch {
      // If production branch has no commits yet (first release scenario),
      // treat as having changes
      return true;
    }
  }

  /**
   * Diffs two sets of collections and returns all changes with the computed bump level.
   *
   * Always collects all changes so they can be displayed to the user.
   */
  private diffCollections(
    currentCollections: CollectionFile[],
    productionCollections: CollectionFile[]
  ): {
    bump: SemverBump | null;
    collectionChanges: CollectionChange[];
    fieldChanges: FieldChange[];
  } {
    const collectionChanges: CollectionChange[] = [];
    const fieldChanges: FieldChange[] = [];
    let highestBump: SemverBump | null = null;

    const currentById = new Map(currentCollections.map((c) => [c.id, c]));
    const productionById = new Map(productionCollections.map((c) => [c.id, c]));

    // Deleted collections (in production but not in current)
    for (const [id] of productionById) {
      if (!currentById.has(id)) {
        collectionChanges.push({
          collectionId: id,
          changeType: 'deleted',
          bump: 'major',
        });
        highestBump = 'major';
      }
    }

    // New collections (in current but not in production)
    for (const [id] of currentById) {
      if (!productionById.has(id)) {
        collectionChanges.push({
          collectionId: id,
          changeType: 'added',
          bump: 'minor',
        });
        highestBump = this.higherBump(highestBump, 'minor');
      }
    }

    // Matched collections - diff their field definitions
    for (const [id, currentCollection] of currentById) {
      const productionCollection = productionById.get(id);
      if (!productionCollection) continue;

      const changes = this.diffFieldDefinitions(
        id,
        flattenFieldDefinitions(currentCollection.fieldDefinitions),
        flattenFieldDefinitions(productionCollection.fieldDefinitions)
      );

      fieldChanges.push(...changes);

      for (const change of changes) {
        highestBump = this.higherBump(highestBump, change.bump);
      }
    }

    return { bump: highestBump, collectionChanges, fieldChanges };
  }

  /**
   * Diffs the project file between current and production.
   *
   * Skips immutable/system-managed fields (id, objectType, created, updated, version, coreVersion).
   */
  private diffProject(
    current: ProjectFile,
    production: ProjectFile | null
  ): {
    bump: SemverBump | null;
    projectChanges: ProjectChange[];
  } {
    const projectChanges: ProjectChange[] = [];

    // No production project means first release - no changes to report
    if (!production) {
      return { bump: null, projectChanges };
    }

    let highestBump: SemverBump | null = null;

    // MAJOR: default language changed
    if (
      current.settings.language.default !== production.settings.language.default
    ) {
      projectChanges.push({
        changeType: 'defaultLanguageChanged',
        bump: 'major',
      });
      highestBump = 'major';
    }

    // MAJOR: supported language removed
    const currentSupported = new Set(current.settings.language.supported);
    const productionSupported = new Set(production.settings.language.supported);

    for (const lang of productionSupported) {
      if (!currentSupported.has(lang)) {
        projectChanges.push({
          changeType: 'supportedLanguageRemoved',
          bump: 'major',
        });
        highestBump = 'major';
        break;
      }
    }

    // MINOR: supported language added
    for (const lang of currentSupported) {
      if (!productionSupported.has(lang)) {
        projectChanges.push({
          changeType: 'supportedLanguageAdded',
          bump: 'minor',
        });
        highestBump = this.higherBump(highestBump, 'minor');
        break;
      }
    }

    // PATCH: name, description
    if (current.name !== production.name) {
      projectChanges.push({ changeType: 'nameChanged', bump: 'patch' });
      highestBump = this.higherBump(highestBump, 'patch');
    }

    if (current.description !== production.description) {
      projectChanges.push({
        changeType: 'descriptionChanged',
        bump: 'patch',
      });
      highestBump = this.higherBump(highestBump, 'patch');
    }

    return { bump: highestBump, projectChanges };
  }

  /**
   * Diffs two sets of assets and returns all changes with the computed bump level.
   */
  private diffAssets(
    currentAssets: AssetFile[],
    productionAssets: AssetFile[]
  ): {
    bump: SemverBump | null;
    assetChanges: AssetChange[];
  } {
    const assetChanges: AssetChange[] = [];
    let highestBump: SemverBump | null = null;

    const currentById = new Map(currentAssets.map((a) => [a.id, a]));
    const productionById = new Map(productionAssets.map((a) => [a.id, a]));

    // Deleted assets (in production but not in current) - MAJOR
    for (const [id] of productionById) {
      if (!currentById.has(id)) {
        assetChanges.push({
          assetId: id,
          changeType: 'deleted',
          bump: 'major',
        });
        highestBump = 'major';
      }
    }

    // New assets (in current but not in production) - MINOR
    for (const [id] of currentById) {
      if (!productionById.has(id)) {
        assetChanges.push({ assetId: id, changeType: 'added', bump: 'minor' });
        highestBump = this.higherBump(highestBump, 'minor');
      }
    }

    // Modified assets - compare properties
    for (const [id, current] of currentById) {
      const production = productionById.get(id);
      if (!production) continue;

      // Binary changed (extension, mimeType, or size differ) - PATCH
      if (
        current.extension !== production.extension ||
        current.mimeType !== production.mimeType ||
        current.size !== production.size
      ) {
        assetChanges.push({
          assetId: id,
          changeType: 'binaryChanged',
          bump: 'patch',
        });
        highestBump = this.higherBump(highestBump, 'patch');
      }

      // Metadata changed (name or description differ) - PATCH
      if (
        current.name !== production.name ||
        current.description !== production.description
      ) {
        assetChanges.push({
          assetId: id,
          changeType: 'metadataChanged',
          bump: 'patch',
        });
        highestBump = this.higherBump(highestBump, 'patch');
      }
    }

    return { bump: highestBump, assetChanges };
  }

  /**
   * Diffs entries across all collections between current and production.
   */
  private async diffEntries(
    projectId: string,
    projectPath: string,
    allCollectionIds: Set<string>,
    productionRef: string
  ): Promise<{
    bump: SemverBump | null;
    entryChanges: EntryChange[];
  }> {
    const entryChanges: EntryChange[] = [];
    let highestBump: SemverBump | null = null;

    for (const collectionId of allCollectionIds) {
      const currentEntries = await this.getEntriesAtRef(
        projectId,
        projectPath,
        collectionId,
        projectBranchSchema.enum.work
      );
      const productionEntries = await this.getEntriesAtRef(
        projectId,
        projectPath,
        collectionId,
        productionRef
      );

      const currentById = new Map(currentEntries.map((e) => [e.id, e]));
      const productionById = new Map(productionEntries.map((e) => [e.id, e]));

      // Deleted entries - MAJOR
      for (const [id] of productionById) {
        if (!currentById.has(id)) {
          entryChanges.push({
            collectionId,
            entryId: id,
            changeType: 'deleted',
            bump: 'major',
          });
          highestBump = 'major';
        }
      }

      // New entries - MINOR
      for (const [id] of currentById) {
        if (!productionById.has(id)) {
          entryChanges.push({
            collectionId,
            entryId: id,
            changeType: 'added',
            bump: 'minor',
          });
          highestBump = this.higherBump(highestBump, 'minor');
        }
      }

      // Modified entries - PATCH
      for (const [id, current] of currentById) {
        const production = productionById.get(id);
        if (!production) continue;

        if (isDeepStrictEqual(current.values, production.values) === false) {
          entryChanges.push({
            collectionId,
            entryId: id,
            changeType: 'modified',
            bump: 'patch',
          });
          highestBump = this.higherBump(highestBump, 'patch');
        }
      }
    }

    return { bump: highestBump, entryChanges };
  }

  /**
   * Diffs field definitions of a single collection.
   *
   * Matches fields by UUID and classifies each change.
   * Always collects all changes so they can be displayed to the user.
   */
  private diffFieldDefinitions(
    collectionId: string,
    currentFields: FieldDefinition[],
    productionFields: FieldDefinition[]
  ): FieldChange[] {
    const changes: FieldChange[] = [];

    const currentById = new Map(currentFields.map((f) => [f.id, f]));
    const productionById = new Map(productionFields.map((f) => [f.id, f]));

    // Deleted fields
    for (const [id, field] of productionById) {
      if (!currentById.has(id)) {
        changes.push({
          collectionId,
          fieldId: id,
          fieldSlug: field.slug,
          changeType: 'deleted',
          bump: 'major',
        });
      }
    }

    // New fields
    for (const [id, field] of currentById) {
      if (!productionById.has(id)) {
        changes.push({
          collectionId,
          fieldId: id,
          fieldSlug: field.slug,
          changeType: 'added',
          bump: 'minor',
        });
      }
    }

    // Matched fields - compare property by property
    for (const [id, currentField] of currentById) {
      const productionField = productionById.get(id);
      if (!productionField) continue;

      const fieldChanges = this.diffSingleField(
        collectionId,
        currentField,
        productionField
      );

      changes.push(...fieldChanges);
    }

    return changes;
  }

  /**
   * Compares two versions of the same field definition and returns all detected changes.
   *
   * Collects every change on the field so the full diff can be shown to the user.
   */
  private diffSingleField(
    collectionId: string,
    current: FieldDefinition,
    production: FieldDefinition
  ): FieldChange[] {
    const base = {
      collectionId,
      fieldId: current.id,
      fieldSlug: current.slug,
    };

    return [
      ...this.collectMajorFieldChanges(base, current, production),
      ...this.collectMinorFieldChanges(base, current, production),
      ...this.collectPatchFieldChanges(base, current, production),
    ];
  }

  /**
   * Collects breaking (major) changes between two versions of a field.
   */
  private collectMajorFieldChanges(
    base: Pick<FieldChange, 'collectionId' | 'fieldId' | 'fieldSlug'>,
    current: FieldDefinition,
    production: FieldDefinition
  ): FieldChange[] {
    const changes: FieldChange[] = [];

    if (current.valueType !== production.valueType) {
      changes.push({ ...base, changeType: 'valueTypeChanged', bump: 'major' });
    }

    if (current.fieldType !== production.fieldType) {
      changes.push({ ...base, changeType: 'fieldTypeChanged', bump: 'major' });
    }

    if (current.slug !== production.slug) {
      changes.push({ ...base, changeType: 'slugChanged', bump: 'major' });
    }

    if (this.isMinMaxTightened(current, production)) {
      changes.push({
        ...base,
        changeType: 'minMaxTightened',
        bump: 'major',
      });
    }

    if (production.isRequired === true && current.isRequired === false) {
      changes.push({
        ...base,
        changeType: 'isRequiredToNotRequired',
        bump: 'major',
      });
    }

    if (production.isUnique === true && current.isUnique === false) {
      changes.push({
        ...base,
        changeType: 'isUniqueToNotUnique',
        bump: 'major',
      });
    }

    if (current.fieldType === 'entry' && production.fieldType === 'entry') {
      if (
        isDeepStrictEqual(
          [...current.ofCollections].sort(),
          [...production.ofCollections].sort()
        ) === false
      ) {
        changes.push({
          ...base,
          changeType: 'ofCollectionsChanged',
          bump: 'major',
        });
      }
    }

    if (current.fieldType === 'slug' && production.fieldType === 'slug') {
      // Changing the slug format re-canonicalises every value, breaking any
      // consumer relying on the slugs.
      if (
        current.separator !== production.separator ||
        current.lowercase !== production.lowercase ||
        current.decamelize !== production.decamelize
      ) {
        changes.push({
          ...base,
          changeType: 'slugFormatChanged',
          bump: 'major',
        });
      }
    }

    return changes;
  }

  /**
   * Collects backwards-compatible (minor) changes between two versions of a field.
   */
  private collectMinorFieldChanges(
    base: Pick<FieldChange, 'collectionId' | 'fieldId' | 'fieldSlug'>,
    current: FieldDefinition,
    production: FieldDefinition
  ): FieldChange[] {
    const changes: FieldChange[] = [];

    if (production.isRequired === false && current.isRequired === true) {
      changes.push({
        ...base,
        changeType: 'isNotRequiredToRequired',
        bump: 'minor',
      });
    }

    if (production.isUnique === false && current.isUnique === true) {
      changes.push({
        ...base,
        changeType: 'isNotUniqueToUnique',
        bump: 'minor',
      });
    }

    return changes;
  }

  /**
   * Collects non-breaking (patch) changes between two versions of a field.
   */
  private collectPatchFieldChanges(
    base: Pick<FieldChange, 'collectionId' | 'fieldId' | 'fieldSlug'>,
    current: FieldDefinition,
    production: FieldDefinition
  ): FieldChange[] {
    const changes: FieldChange[] = [];

    if (this.isMinMaxLoosened(current, production)) {
      changes.push({
        ...base,
        changeType: 'minMaxLoosened',
        bump: 'patch',
      });
    }

    if (isDeepStrictEqual(current.label, production.label) === false) {
      changes.push({ ...base, changeType: 'labelChanged', bump: 'patch' });
    }

    if (
      isDeepStrictEqual(current.description, production.description) === false
    ) {
      changes.push({
        ...base,
        changeType: 'descriptionChanged',
        bump: 'patch',
      });
    }

    if (
      'defaultValue' in current &&
      'defaultValue' in production &&
      isDeepStrictEqual(current.defaultValue, production.defaultValue) === false
    ) {
      changes.push({
        ...base,
        changeType: 'defaultValueChanged',
        bump: 'patch',
      });
    }

    if (current.inputWidth !== production.inputWidth) {
      changes.push({
        ...base,
        changeType: 'inputWidthChanged',
        bump: 'patch',
      });
    }

    if (current.isDisabled !== production.isDisabled) {
      changes.push({
        ...base,
        changeType: 'isDisabledChanged',
        bump: 'patch',
      });
    }

    // A slug's source fields are only a soft generation hint, they never change
    // stored data, so unlike ofCollectionsChanged this is non-breaking.
    if (
      current.fieldType === 'slug' &&
      production.fieldType === 'slug' &&
      isDeepStrictEqual(
        [...current.ofFieldDefinitions].sort(),
        [...production.ofFieldDefinitions].sort()
      ) === false
    ) {
      changes.push({
        ...base,
        changeType: 'ofFieldDefinitionsChanged',
        bump: 'patch',
      });
    }

    return changes;
  }

  /**
   * Checks if min/max constraints have been tightened.
   *
   * Tightening means: new min > old min, or new max < old max.
   * A null value means no constraint (unbounded).
   */
  private isMinMaxTightened(
    current: FieldDefinition,
    production: FieldDefinition
  ): boolean {
    const currentMin = this.getMinMax(current, 'min');
    const productionMin = this.getMinMax(production, 'min');
    const currentMax = this.getMinMax(current, 'max');
    const productionMax = this.getMinMax(production, 'max');

    // Tightened min: was null (unbounded) and now has value, or increased
    if (currentMin !== null && productionMin === null) return true;
    if (
      currentMin !== null &&
      productionMin !== null &&
      currentMin > productionMin
    )
      return true;

    // Tightened max: was null (unbounded) and now has value, or decreased
    if (currentMax !== null && productionMax === null) return true;
    if (
      currentMax !== null &&
      productionMax !== null &&
      currentMax < productionMax
    )
      return true;

    return false;
  }

  /**
   * Checks if min/max constraints have been loosened.
   *
   * Loosening means: new min < old min, or new max > old max.
   */
  private isMinMaxLoosened(
    current: FieldDefinition,
    production: FieldDefinition
  ): boolean {
    const currentMin = this.getMinMax(current, 'min');
    const productionMin = this.getMinMax(production, 'min');
    const currentMax = this.getMinMax(current, 'max');
    const productionMax = this.getMinMax(production, 'max');

    // Loosened min: had value and now null (unbounded), or decreased
    if (currentMin === null && productionMin !== null) return true;
    if (
      currentMin !== null &&
      productionMin !== null &&
      currentMin < productionMin
    )
      return true;

    // Loosened max: had value and now null (unbounded), or increased
    if (currentMax === null && productionMax !== null) return true;
    if (
      currentMax !== null &&
      productionMax !== null &&
      currentMax > productionMax
    )
      return true;

    return false;
  }

  /**
   * Safely extracts min or max from a field definition (not all types have it)
   */
  private getMinMax(
    field: FieldDefinition,
    prop: 'min' | 'max'
  ): number | null {
    switch (field.fieldType) {
      case 'text':
      case 'textarea':
      case 'number':
      case 'range':
      case 'asset':
      case 'entry':
        return field[prop];
      default:
        return null;
    }
  }

  /**
   * Counts existing preview tags for a given base version since the last full release.
   */
  private async countPreviewsSinceLastRelease(
    projectPath: string,
    baseVersion: string
  ): Promise<number> {
    const tags = await this.gitService.tags.list({ path: projectPath });
    let count = 0;

    for (const tag of tags.list) {
      if (tag.message.type === 'upgrade') continue;

      if (tag.message.type === 'release') {
        // Hit the last full release - stop counting
        break;
      }

      if (tag.message.type === 'preview') {
        // Check if this preview is for the same base version
        const previewBase = tag.message.version.split('-')[0];
        if (previewBase === baseVersion) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Returns the higher of two bumps (major > minor > patch)
   */
  private higherBump(a: SemverBump | null, b: SemverBump): SemverBump {
    const order: Record<SemverBump, number> = {
      patch: 0,
      minor: 1,
      major: 2,
    };
    if (a === null) return b;
    return order[a] >= order[b] ? a : b;
  }
}
