import { isDeepStrictEqual } from 'node:util';
import Semver from 'semver';
import {
  collectionFileSchema,
  projectBranchSchema,
  projectFileSchema,
  serviceTypeSchema,
  prepareReleaseSchema,
  createReleaseSchema,
  createPreviewReleaseSchema,
  releaseTagMessageSchema,
  type CollectionFile,
  type ElekIoCoreOptions,
  type FieldDefinition,
  type PrepareReleaseProps,
  type CreateReleaseProps,
  type CreatePreviewReleaseProps,
  type ReleaseDiff,
  type ReleaseResult,
  type SemverBump,
  type FieldChange,
  type CollectionChange,
} from '../schema/index.js';
import { pathTo } from '../util/node.js';
import { datetime } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import type { CollectionService } from './CollectionService.js';
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
export class ReleaseService extends AbstractCrudService {
  private gitService: GitService;
  private jsonFileService: JsonFileService;
  private collectionService: CollectionService;
  private projectService: ProjectService;

  constructor(
    options: ElekIoCoreOptions,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    collectionService: CollectionService,
    projectService: ProjectService
  ) {
    super(serviceTypeSchema.enum.Release, options, logService);

    this.gitService = gitService;
    this.jsonFileService = jsonFileService;
    this.collectionService = collectionService;
    this.projectService = projectService;
  }

  /**
   * Prepares a release by diffing the current `work` branch against `production`.
   *
   * Returns a read-only summary of all changes and the computed next version.
   * If there are no changes, the next version and bump will be null.
   */
  public async prepare(props: PrepareReleaseProps): Promise<ReleaseDiff> {
    prepareReleaseSchema.parse(props);

    const projectPath = pathTo.project(props.projectId);

    // Ensure we're on the work branch
    const currentBranch = await this.gitService.branches.current(projectPath);
    if (currentBranch !== projectBranchSchema.enum.work) {
      throw new Error(`Not on work branch (currently on "${currentBranch}")`);
    }

    const project = await this.projectService.read({ id: props.projectId });
    const currentVersion = project.version;

    // Get current collections from work branch (disk)
    const currentCollections = await this.collectionService.list({
      projectId: props.projectId,
      limit: 0,
    });

    // Get collections from production branch
    const productionCollections = await this.getCollectionsAtRef(
      props.projectId,
      projectPath,
      projectBranchSchema.enum.production
    );

    // Diff collections
    const { bump, collectionChanges, fieldChanges } = this.diffCollections(
      currentCollections.list,
      productionCollections
    );

    // If no schema changes, check if there are any commits between production and work
    let finalBump = bump;
    if (!finalBump) {
      const hasContentChanges = await this.hasCommitsBetween(
        projectPath,
        projectBranchSchema.enum.production,
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
      collectionChanges,
      fieldChanges,
    };
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
  public async create(props: CreateReleaseProps): Promise<ReleaseResult> {
    createReleaseSchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const projectFilePath = pathTo.projectFile(props.projectId);

    // Recompute the diff
    const diff = await this.prepare(props);

    if (!diff.bump || !diff.nextVersion) {
      throw new Error(
        'Cannot create a release: no changes detected since the last full release'
      );
    }

    const nextVersion = diff.nextVersion;

    try {
      // Merge work into production
      await this.gitService.branches.switch(
        projectPath,
        projectBranchSchema.enum.production
      );
      await this.gitService.merge(projectPath, projectBranchSchema.enum.work);

      // Update project version on production
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

      // Tag on production
      await this.gitService.tags.create({
        path: projectPath,
        message: JSON.stringify(
          releaseTagMessageSchema.parse({
            type: 'release',
            version: nextVersion,
          })
        ),
      });

      // Switch back to work and sync the version commit
      await this.gitService.branches.switch(
        projectPath,
        projectBranchSchema.enum.work
      );
      await this.gitService.merge(
        projectPath,
        projectBranchSchema.enum.production
      );
    } catch (error) {
      // Ensure we switch back to work branch on failure
      await this.gitService.branches
        .switch(projectPath, projectBranchSchema.enum.work)
        .catch(() => {
          // Best-effort recovery — log but don't mask the original error
        });
      throw error;
    }

    this.logService.info({
      source: 'core',
      message: `Released version ${nextVersion} (${diff.bump} bump)`,
    });

    return {
      version: nextVersion,
      diff,
    };
  }

  /**
   * Creates a preview release by:
   * 1. Recomputing the diff (stateless)
   * 2. Computing the preview version (e.g. 1.1.0-preview.3)
   * 3. Updating the project version on `work`
   * 4. Tagging on `work` (no merge into production)
   *
   * Preview releases are snapshots of the current work state.
   * They don't promote to production — only full releases do.
   */
  public async createPreview(
    props: CreatePreviewReleaseProps
  ): Promise<ReleaseResult> {
    createPreviewReleaseSchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const projectFilePath = pathTo.projectFile(props.projectId);

    // Recompute the diff
    const diff = await this.prepare(props);

    if (!diff.bump || !diff.nextVersion) {
      throw new Error(
        'Cannot create a preview release: no changes detected since the last full release'
      );
    }

    // Count existing preview tags for this base version to determine the N in preview.N
    const previewNumber = await this.countPreviewsSinceLastRelease(
      projectPath,
      diff.nextVersion
    );
    const previewVersion = `${diff.nextVersion}-preview.${previewNumber + 1}`;

    try {
      // Update project version on work branch
      const updatedProjectFile = {
        ...diff.project,
        version: previewVersion,
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

      // Tag on work (not production)
      await this.gitService.tags.create({
        path: projectPath,
        message: JSON.stringify(
          releaseTagMessageSchema.parse({
            type: 'preview',
            version: previewVersion,
          })
        ),
      });
    } catch (error) {
      // Ensure we stay on work branch on failure
      await this.gitService.branches
        .switch(projectPath, projectBranchSchema.enum.work)
        .catch(() => {
          // Best-effort recovery — log but don't mask the original error
        });
      throw error;
    }

    this.logService.info({
      source: 'core',
      message: `Preview released version ${previewVersion} (${diff.bump} bump)`,
    });

    return {
      version: previewVersion,
      diff,
    };
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

    // List collection folders at the ref
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
        const collectionFile = collectionFileSchema.parse(JSON.parse(content));
        collections.push(collectionFile);
      } catch {
        // Collection may not have a valid collection.json (e.g. .gitkeep only)
        this.logService.debug({
          source: 'core',
          message: `Skipping folder "${folderName}" at ref "${ref}" during release diff`,
        });
      }
    }

    return collections;
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

    // Matched collections — diff their field definitions
    for (const [id, currentCollection] of currentById) {
      const productionCollection = productionById.get(id);
      if (!productionCollection) continue;

      const changes = this.diffFieldDefinitions(
        id,
        currentCollection.fieldDefinitions,
        productionCollection.fieldDefinitions
      );

      fieldChanges.push(...changes);

      for (const change of changes) {
        highestBump = this.higherBump(highestBump, change.bump);
      }
    }

    return { bump: highestBump, collectionChanges, fieldChanges };
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

    // Matched fields — compare property by property
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
    const changes: FieldChange[] = [];
    const base = {
      collectionId,
      fieldId: current.id,
      fieldSlug: current.slug,
    };

    // MAJOR changes

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
        !isDeepStrictEqual(
          [...current.ofCollections].sort(),
          [...production.ofCollections].sort()
        )
      ) {
        changes.push({
          ...base,
          changeType: 'ofCollectionsChanged',
          bump: 'major',
        });
      }
    }

    // MINOR changes

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

    // PATCH changes

    if (this.isMinMaxLoosened(current, production)) {
      changes.push({
        ...base,
        changeType: 'minMaxLoosened',
        bump: 'patch',
      });
    }

    if (!isDeepStrictEqual(current.label, production.label)) {
      changes.push({ ...base, changeType: 'labelChanged', bump: 'patch' });
    }

    if (!isDeepStrictEqual(current.description, production.description)) {
      changes.push({
        ...base,
        changeType: 'descriptionChanged',
        bump: 'patch',
      });
    }

    if (
      'defaultValue' in current &&
      'defaultValue' in production &&
      !isDeepStrictEqual(current.defaultValue, production.defaultValue)
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
   *
   * Parses all tag messages looking for `{ type: 'preview', version: 'X.Y.Z-preview.N' }`
   * where the base version matches.
   */
  private async countPreviewsSinceLastRelease(
    projectPath: string,
    baseVersion: string
  ): Promise<number> {
    const tags = await this.gitService.tags.list({ path: projectPath });
    let count = 0;

    for (const tag of tags.list) {
      let rawMessage: unknown = null;
      try {
        rawMessage = JSON.parse(tag.message);
      } catch {
        // Not JSON, skip
      }
      const parsed = releaseTagMessageSchema.safeParse(rawMessage);

      if (!parsed.success) continue;

      if (parsed.data.type === 'release') {
        // Hit the last full release — stop counting
        break;
      }

      if (parsed.data.type === 'preview') {
        // Check if this preview is for the same base version
        const previewBase = parsed.data.version.split('-')[0];
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
