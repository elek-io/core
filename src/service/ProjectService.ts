import Fs from 'fs-extra';
import Os from 'node:os';
import Path from 'node:path';
import Semver from 'semver';
import type { FileReference, ObjectType, Version } from '../schema/index.js';
import {
  cloneProjectSchema,
  createProjectSchema,
  currentBranchProjectSchema,
  deleteProjectSchema,
  getChangesProjectSchema,
  listBranchesProjectSchema,
  listProjectsSchema,
  objectTypeSchema,
  migrateProjectSchema,
  projectBranchSchema,
  projectFileSchema,
  projectFolderSchema,
  projectHistorySchema,
  readProjectSchema,
  serviceTypeSchema,
  setRemoteOriginUrlProjectSchema,
  switchBranchProjectSchema,
  synchronizeProjectSchema,
  updateProjectSchema,
  upgradeProjectSchema,
  type CloneProjectProps,
  type CreateProjectProps,
  type CrudServiceWithListCount,
  type CurrentBranchProjectProps,
  type DeleteProjectProps,
  type ElekIoCoreOptions,
  type GetChangesProjectProps,
  type ListBranchesProjectProps,
  type ListProjectsProps,
  type PaginatedList,
  type Project,
  type ProjectFile,
  type ProjectHistoryProps,
  type ProjectHistoryResult,
  type ReadProjectProps,
  type SetRemoteOriginUrlProjectProps,
  type SwitchBranchProjectProps,
  type SynchronizeProjectProps,
  type UpdateProjectProps,
  type UpgradeProjectProps,
} from '../schema/index.js';
import { applyMigrations, projectMigrations } from './migrations/index.js';
import { isNotEmpty, pathTo } from '../util/node.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { AssetService } from './AssetService.js';
import type { CollectionService } from './CollectionService.js';
import type { ComponentService } from './ComponentService.js';
import type { EntryService } from './EntryService.js';
import type { ReferenceService } from './ReferenceService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Project files on disk
 */
export class ProjectService
  extends AbstractEntityService
  implements CrudServiceWithListCount<Project>
{
  private coreVersion: Version;
  private assetService: AssetService;
  private collectionService: CollectionService;
  private componentService: ComponentService;
  private entryService: EntryService;
  private referenceService: ReferenceService;

  constructor(
    coreVersion: Version,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    assetService: AssetService,
    collectionService: CollectionService,
    componentService: ComponentService,
    entryService: EntryService,
    referenceService: ReferenceService
  ) {
    super(
      serviceTypeSchema.enum.Project,
      options,
      logService,
      gitService,
      jsonFileService
    );

    this.coreVersion = coreVersion;
    this.assetService = assetService;
    this.collectionService = collectionService;
    this.componentService = componentService;
    this.entryService = entryService;
    this.referenceService = referenceService;
  }

  /**
   * Creates a new Project
   */
  public create(props: CreateProjectProps): Promise<Project> {
    return this.validated(
      'create',
      createProjectSchema,
      props,
      async (validatedProps) => {
        const id = uuid();

        const projectFile: ProjectFile = {
          ...validatedProps,
          objectType: 'project',
          id,
          created: datetime(),
          updated: null,
          coreVersion: this.coreVersion,
          version: '0.0.1',
        };

        const projectPath = pathTo.project(id);

        try {
          await Fs.ensureDir(projectPath);
          await this.createFolderStructure(projectPath);
          await this.createGitignore(projectPath);
          await this.createGitattributes(projectPath);
          await this.gitService.init(projectPath, {
            initialBranch: projectBranchSchema.enum.production,
          });
          await this.jsonFileService.create(
            projectFile,
            pathTo.projectFile(id),
            projectFileSchema
          );
          await this.gitService.add(projectPath, ['.']);
          await this.gitService.commit(projectPath, {
            method: 'create',
            reference: { objectType: 'project', id },
          });
          await this.gitService.branches.switch(
            projectPath,
            projectBranchSchema.enum.work,
            {
              isNew: true,
            }
          );
          return await this.toProject(projectFile);
        } catch (error) {
          await this.delete({ id, force: true });
          throw error;
        }
      }
    );
  }

  /**
   * Clones a Project by URL
   */
  public clone(props: CloneProjectProps): Promise<Project> {
    return this.validated('clone', cloneProjectSchema, props, async () => {
      const tmpId = uuid();
      const tmpProjectPath = Path.join(pathTo.tmp, tmpId);

      await this.gitService.clone(props.url, tmpProjectPath);
      const projectFile = await this.jsonFileService.read(
        Path.join(tmpProjectPath, 'project.json'),
        projectFileSchema
      );

      const projectPath = pathTo.project(projectFile.id);
      const alreadyExists = await Fs.pathExists(projectPath);

      if (alreadyExists) {
        throw CoreError.conflict(
          `Tried to clone Project "${projectFile.id}" from "${props.url}" - but the Project already exists locally`
        );
      }

      await Fs.copy(tmpProjectPath, projectPath);
      await Fs.remove(tmpProjectPath);
      return await this.toProject(projectFile);
    });
  }

  /**
   * Returns a Project by ID
   *
   * If a commit hash is provided, the Project is read from history
   */
  public read(props: ReadProjectProps): Promise<Project> {
    return this.validated('read', readProjectSchema, props, async () => {
      if (!props.commitHash) {
        const projectFile = await this.jsonFileService.read(
          pathTo.projectFile(props.id),
          projectFileSchema
        );
        return await this.toProject(projectFile);
      } else {
        const content = await this.gitService.getFileContentAtCommit(
          pathTo.project(props.id),
          pathTo.projectFile(props.id),
          props.commitHash
        );
        const projectFile = this.migrate(JSON.parse(content));
        return await this.toProject(projectFile);
      }
    });
  }

  /**
   * Returns the commit history of a Project
   */
  public history(props: ProjectHistoryProps): Promise<ProjectHistoryResult> {
    return this.validated('history', projectHistorySchema, props, async () => {
      const projectPath = pathTo.project(props.id);

      const fullHistory = await this.gitService.log(projectPath);
      const history = await this.gitService.log(projectPath, {
        filePath: pathTo.projectFile(props.id),
      });
      return { history, fullHistory };
    });
  }

  /**
   * Updates given Project
   */
  public update(props: UpdateProjectProps): Promise<Project> {
    return this.validated(
      'update',
      updateProjectSchema,
      props,
      async (validatedProps) => {
        const projectPath = pathTo.project(validatedProps.id);
        const filePath = pathTo.projectFile(validatedProps.id);

        const prevProjectFile = await this.read(validatedProps);

        const projectFile: ProjectFile = {
          ...prevProjectFile,
          ...validatedProps,
          updated: datetime(),
        };

        await this.jsonFileService.update(
          projectFile,
          filePath,
          projectFileSchema
        );
        await this.gitService.add(projectPath, [filePath]);
        await this.gitService.commit(projectPath, {
          method: 'update',
          reference: { objectType: 'project', id: projectFile.id },
        });
        return await this.toProject(projectFile);
      }
    );
  }

  /**
   * Upgrades given Project to the current version of Core
   *
   * Needed when a new Core version is requiring changes to existing files or structure.
   */
  public upgrade(props: UpgradeProjectProps): Promise<void> {
    return this.validated('upgrade', upgradeProjectSchema, props, async () => {
      const projectPath = pathTo.project(props.id);
      const projectFilePath = pathTo.projectFile(props.id);

      const currentProjectFile = await this.ensureProjectIsUpgradeable(
        projectPath,
        projectFilePath,
        props.force
      );

      const assetReferences = await this.listReferences('asset', props.id);
      const componentReferences = await this.listReferences(
        'component',
        props.id
      );
      const collectionReferences = await this.listReferences(
        'collection',
        props.id
      );

      this.logService.info({
        source: 'core',
        message: `Attempting to upgrade Project "${props.id}" from Core version ${currentProjectFile.coreVersion} to ${this.coreVersion}`,
      });

      const upgradeBranchName = `upgrade/core-${currentProjectFile.coreVersion}-to-${this.coreVersion}`;

      try {
        await this.gitService.branches.switch(projectPath, upgradeBranchName, {
          isNew: true,
        });

        await this.upgradeAllObjectFiles(
          props.id,
          assetReferences,
          componentReferences,
          collectionReferences
        );

        // Persist the migrated Project file directly. update() intentionally
        // omits coreVersion (not a user-updatable field), so routing through it
        // would re-write the previous version and never bump it
        const migratedProjectFile: ProjectFile = {
          ...this.migrate(currentProjectFile),
          updated: datetime(),
        };
        await this.jsonFileService.update(
          migratedProjectFile,
          projectFilePath,
          projectFileSchema
        );
        await this.gitService.add(projectPath, [projectFilePath]);
        await this.gitService.commit(projectPath, {
          method: 'update',
          reference: {
            objectType: 'project',
            id: migratedProjectFile.id,
          },
        });
        await this.gitService.branches.switch(
          projectPath,
          projectBranchSchema.enum.work
        );
        await this.gitService.merge(projectPath, upgradeBranchName, {
          squash: true,
        });
        await this.gitService.commit(projectPath, {
          method: 'upgrade',
          reference: {
            objectType: 'project',
            id: migratedProjectFile.id,
          },
        });
        await this.gitService.tags.create({
          path: projectPath,
          message: {
            type: 'upgrade',
            coreVersion: migratedProjectFile.coreVersion,
          },
        });
        await this.gitService.branches.delete(
          projectPath,
          upgradeBranchName,
          true
        );

        this.logService.info({
          source: 'core',
          message: `Successfully upgraded Project "${props.id}" to Core version "${this.coreVersion}"`,
          meta: {
            previous: currentProjectFile,
            migrated: migratedProjectFile,
          },
        });
      } catch (error) {
        await this.cleanupFailedUpgrade(projectPath, upgradeBranchName);
        throw error;
      }
    });
  }

  /**
   * Switches to the work branch and verifies the Project can be upgraded.
   *
   * Throws when the Projects Core version is ahead of the current Core version,
   * or when it is already up to date and the upgrade was not forced.
   * Returns the current Project file so the caller can migrate it.
   */
  private async ensureProjectIsUpgradeable(
    projectPath: string,
    projectFilePath: string,
    force: boolean | undefined
  ): Promise<Record<string, unknown> & { coreVersion: string }> {
    const currentBranch = await this.gitService.branches.current(projectPath);
    if (currentBranch !== projectBranchSchema.enum.work) {
      await this.gitService.branches.switch(
        projectPath,
        projectBranchSchema.enum.work
      );
    }

    const currentProjectFile = (await this.jsonFileService.unsafeRead(
      projectFilePath
    )) as Record<string, unknown> & { coreVersion: string };

    if (Semver.gt(currentProjectFile.coreVersion, this.coreVersion)) {
      throw CoreError.upgradeFailed(
        `The Projects Core version "${currentProjectFile.coreVersion}" is higher than the current Core version "${this.coreVersion}".`
      );
    }

    if (
      Semver.eq(currentProjectFile.coreVersion, this.coreVersion) &&
      force !== true
    ) {
      throw CoreError.upgradeFailed(
        `The Projects Core version "${currentProjectFile.coreVersion}" is already up to date.`
      );
    }

    return currentProjectFile;
  }

  /**
   * Migrates and updates every object file referenced by the Project.
   *
   * Upgrades assets, components and collections, then walks each collection to
   * upgrade its entries.
   */
  private async upgradeAllObjectFiles(
    projectId: string,
    assetReferences: FileReference[],
    componentReferences: FileReference[],
    collectionReferences: FileReference[]
  ): Promise<void> {
    for (const reference of assetReferences) {
      await this.upgradeObjectFile(projectId, 'asset', reference);
    }

    for (const reference of componentReferences) {
      await this.upgradeObjectFile(projectId, 'component', reference);
    }

    for (const reference of collectionReferences) {
      await this.upgradeObjectFile(projectId, 'collection', reference);
    }

    for (const collectionReference of collectionReferences) {
      const entryReferences = await this.listReferences(
        'entry',
        projectId,
        collectionReference.id
      );
      for (const reference of entryReferences) {
        await this.upgradeObjectFile(
          projectId,
          'entry',
          reference,
          collectionReference.id
        );
      }
    }
  }

  /**
   * Best-effort cleanup after a failed upgrade.
   *
   * Switches back to the work branch and removes the upgrade branch, swallowing
   * any error so the original upgrade failure is the one that surfaces.
   */
  private async cleanupFailedUpgrade(
    projectPath: string,
    upgradeBranchName: string
  ): Promise<void> {
    try {
      await this.gitService.branches.switch(
        projectPath,
        projectBranchSchema.enum.work
      );
      await this.gitService.branches.delete(
        projectPath,
        upgradeBranchName,
        true
      );
    } catch {
      // Best-effort cleanup
    }
  }

  public branches = {
    list: (
      props: ListBranchesProjectProps
    ): Promise<{ local: string[]; remote: string[] }> => {
      return this.validated(
        'branches.list',
        listBranchesProjectSchema,
        props,
        async () => {
          const projectPath = pathTo.project(props.id);
          const hasOrigin =
            await this.gitService.remotes.hasOrigin(projectPath);
          if (hasOrigin) {
            await this.gitService.fetch(projectPath);
          }
          return await this.gitService.branches.list(projectPath);
        }
      );
    },
    current: (props: CurrentBranchProjectProps): Promise<string> => {
      return this.validated(
        'branches.current',
        currentBranchProjectSchema,
        props,
        async () => {
          const projectPath = pathTo.project(props.id);
          return await this.gitService.branches.current(projectPath);
        }
      );
    },
    switch: (props: SwitchBranchProjectProps): Promise<void> => {
      return this.validated(
        'branches.switch',
        switchBranchProjectSchema,
        props,
        async () => {
          const projectPath = pathTo.project(props.id);
          return await this.gitService.branches.switch(
            projectPath,
            props.branch,
            props.options
          );
        }
      );
    },
  };

  /**
   * Updates the remote origin URL of given Project
   *
   * @todo maybe add this logic to the update method
   */
  public setRemoteOriginUrl(
    props: SetRemoteOriginUrlProjectProps
  ): Promise<void> {
    return this.validated(
      'setRemoteOriginUrl',
      setRemoteOriginUrlProjectSchema,
      props,
      async () => {
        const projectPath = pathTo.project(props.id);
        const hasOrigin = await this.gitService.remotes.hasOrigin(projectPath);
        if (!hasOrigin) {
          return await this.gitService.remotes.addOrigin(
            projectPath,
            props.url
          );
        }
        return await this.gitService.remotes.setOriginUrl(
          projectPath,
          props.url
        );
      }
    );
  }

  /**
   * Returns the differences of the given Projects current branch
   * between the local and remote `origin` (commits ahead & behind)
   *
   * Throws an error if the Project does not have a remote origin.
   *
   * - `behind` contains a list of commits on the current branch that are available on the remote `origin` but not yet locally
   * - `ahead` contains a list of commits on the current branch that are available locally but not yet on the remote `origin`
   */
  public getChanges(props: GetChangesProjectProps) {
    return this.validated(
      'getChanges',
      getChangesProjectSchema,
      props,
      async () => {
        const projectPath = pathTo.project(props.id);
        const hasRemoteOrigin =
          await this.gitService.remotes.hasOrigin(projectPath);

        if (hasRemoteOrigin === false) {
          throw CoreError.preconditionFailed(
            `Project "${props.id}" does not have a remote origin`
          );
        }

        const currentBranch =
          await this.gitService.branches.current(projectPath);
        await this.gitService.fetch(projectPath);

        const behind = await this.gitService.log(projectPath, {
          between: {
            from: currentBranch,
            to: `origin/${currentBranch}`,
          },
        });
        const ahead = await this.gitService.log(projectPath, {
          between: {
            from: `origin/${currentBranch}`,
            to: currentBranch,
          },
        });

        return { behind, ahead };
      }
    );
  }

  /**
   * Integrates remote changes of `origin` and pushes local commits, refusing to
   * push a state that would strand a dangling reference.
   *
   * A rebase can integrate two individually valid changes (one client deletes a
   * target after the last reference to it is removed, another adds a reference
   * to that same target) into a tree with a dangling reference and no textual
   * conflict. To stop that state ever reaching the shared remote, the integrated
   * tree is scanned for dangling references BEFORE the push and the push is
   * blocked if any are found (`ReferenceService.findDanglingReferences`). The
   * integrated commits stay local so the user can repair them through Core's own
   * (integrity-gated) delete/update and synchronize again.
   *
   * The transaction is: refuse on a dirty tree, then fetch, controlled rebase
   * (a textual conflict aborts cleanly rather than leaving the repository
   * mid-rebase), top up LFS, scan, and push inside a bounded non-fast-forward
   * retry loop. A blocked sync performs no remote mutation, since every gate
   * throws before the push.
   *
   * Scope is the current `work` tree only; released `production` history is not
   * reconciled here.
   */
  public synchronize(props: SynchronizeProjectProps): Promise<void> {
    return this.validated(
      'synchronize',
      synchronizeProjectSchema,
      props,
      async () => {
        const projectPath = pathTo.project(props.id);

        // A rebase against uncommitted changes fails and could cost the user
        // work, so refuse a sync on a dirty tree before touching the remote.
        const uncommitted = await this.gitService.status(projectPath);
        if (uncommitted.length > 0) {
          throw CoreError.preconditionFailed(
            `Project "${props.id}" has uncommitted changes. Commit or discard them before synchronizing.`,
            uncommitted
          );
        }

        const branch = await this.gitService.branches.current(projectPath);

        // Bounded so a remote that keeps advancing cannot spin this forever.
        const maxAttempts = 5;
        for (let attempt = 1; ; attempt += 1) {
          // Integrate the remote into the working tree without pushing yet.
          // `lfs.fetchAll` (not `git lfs pull`) tops up every ref's objects so
          // switching branches works offline. A textual conflict aborts cleanly
          // inside `rebase` and surfaces a `PreconditionFailed`, leaving the
          // repository in a recoverable, non-mid-rebase state.
          await this.gitService.fetch(projectPath);
          await this.gitService.rebase(projectPath, `origin/${branch}`);
          await this.gitService.lfs.fetchAll(projectPath);

          // Validate the integrated tree BEFORE pushing, so a dangling state
          // never reaches the shared remote.
          const danglingReferences =
            await this.referenceService.findDanglingReferences(props.id);
          if (danglingReferences.length > 0) {
            throw CoreError.conflict(
              'Synchronize would integrate dangling references',
              danglingReferences
            );
          }

          try {
            await this.gitService.push(projectPath);
            return;
          } catch (error) {
            // A non-fast-forward rejection means the remote advanced between the
            // fetch and the push. Re-integrate and try again, up to the cap.
            // Matched on the message `push` sets for that specific case, so an
            // unrelated `PreconditionFailed` (for example a broken LFS endpoint)
            // is not mistaken for a retryable race.
            const isNonFastForward =
              error instanceof CoreError &&
              error.type === 'PreconditionFailed' &&
              error.message.startsWith('Push rejected because the remote');
            if (isNonFastForward && attempt < maxAttempts) {
              continue;
            }
            throw error;
          }
        }
      }
    );
  }

  /**
   * Deletes given Project
   *
   * Deletes the whole Project folder including the history, not only the config file.
   * Throws in case a Project is only available locally and could be lost forever,
   * or changes are not pushed to a remote yet.
   */
  public delete(props: DeleteProjectProps): Promise<void> {
    return this.validated('delete', deleteProjectSchema, props, async () => {
      const hasRemoteOrigin = await this.gitService.remotes.hasOrigin(
        pathTo.project(props.id)
      );

      if (hasRemoteOrigin === false && props.force !== true) {
        throw CoreError.preconditionFailed(
          `Project "${props.id}" does not have a remote origin. Use force to delete anyway.`
        );
      }

      if (hasRemoteOrigin === true && props.force !== true) {
        const changes = await this.getChanges({ id: props.id });
        if (changes.ahead.length > 0) {
          throw CoreError.conflict(
            `Project "${props.id}" has local changes that are not pushed to the remote origin. Use force to delete anyway.`
          );
        }
      }

      await Fs.remove(pathTo.project(props.id));
    });
  }

  /**
   * Lists outdated Projects that need to be upgraded
   */
  public async listOutdated(): Promise<ProjectFile[]> {
    const projectReferences = await this.listReferences(
      objectTypeSchema.enum.project
    );

    const results = await Promise.all(
      projectReferences.map(async (reference) => {
        try {
          const json = await this.jsonFileService.unsafeRead(
            pathTo.projectFile(reference.id)
          );
          const projectFile = migrateProjectSchema.parse(json);

          if (projectFile.coreVersion !== this.coreVersion) {
            return this.migrate(projectFile);
          }

          return null;
        } catch {
          return null;
        }
      })
    );

    return results.filter(isNotEmpty);
  }

  public async list(
    props?: ListProjectsProps
  ): Promise<PaginatedList<Project>> {
    if (props) {
      const parsed = listProjectsSchema.safeParse(props);
      if (!parsed.success) {
        throw CoreError.badRequest(parsed.error.message, parsed.error);
      }
    }

    const offset = props?.offset || 0;
    const limit = props?.limit ?? 15;

    const projectReferences = await this.listReferences(
      objectTypeSchema.enum.project
    );

    const partialProjectReferences =
      limit === 0
        ? projectReferences.slice(offset)
        : projectReferences.slice(offset, offset + limit);

    const projects = await this.collectResults(
      partialProjectReferences.map((reference) =>
        this.read({ id: reference.id })
      )
    );

    return {
      total: projectReferences.length,
      limit,
      offset,
      list: projects,
    };
  }

  public async count(): Promise<number> {
    const refs = await this.listReferences(objectTypeSchema.enum.project);
    return refs.length;
  }

  /**
   * Checks if given object is of type Project
   */
  public isProject(obj: unknown): obj is Project {
    return projectFileSchema.safeParse(obj).success;
  }

  /**
   * Migrates an potentially outdated Project file to the current schema
   */
  public migrate(potentiallyOutdatedFile: unknown): ProjectFile {
    const loose = migrateProjectSchema.parse(potentiallyOutdatedFile);
    const migrated = applyMigrations(
      loose,
      projectMigrations,
      this.coreVersion
    );
    return projectFileSchema.parse(migrated);
  }

  /**
   * Creates a Project from given ProjectFile
   */
  private async toProject(projectFile: ProjectFile): Promise<Project> {
    const projectPath = pathTo.project(projectFile.id);

    const hasOrigin = await this.gitService.remotes.hasOrigin(projectPath);
    if (hasOrigin) {
      const remoteOriginUrl =
        await this.gitService.remotes.getOriginUrl(projectPath);
      return {
        ...projectFile,
        remoteOriginUrl,
      };
    }
    return {
      ...projectFile,
      remoteOriginUrl: null,
    };
  }

  /**
   * Creates the projects folder structure and makes sure to
   * write empty .gitkeep files inside them to ensure they are
   * committed
   */
  private async createFolderStructure(path: string): Promise<void> {
    const folders = Object.values(projectFolderSchema.enum);

    await Promise.all(
      folders.map(async (folder) => {
        await Fs.mkdirp(Path.join(path, folder));
        await Fs.writeFile(Path.join(path, folder, '.gitkeep'), '');
      })
    );
  }

  /**
   * Writes the Projects main .gitignore file to disk
   *
   * @todo Add general things to ignore
   * @see https://github.com/github/gitignore/tree/master/Global
   */
  private async createGitignore(path: string): Promise<void> {
    const lines = [
      '# Ignore all hidden files and folders...',
      '.*',
      '# ...but these',
      '!/.gitignore',
      '!/.gitattributes',
      '!/**/.gitkeep',
      '',
      '# elek.io related ignores',
      'collections/slug.index.json',
      'components/slug.index.json',
    ];
    await Fs.writeFile(Path.join(path, '.gitignore'), lines.join(Os.EOL));
  }

  /**
   * Writes the Projects .gitattributes file to disk
   *
   * Tracks every binary Asset under `lfs/` with Git LFS so they are stored as
   * pointers in history while the bytes are offloaded. The `.gitkeep`
   * placeholder is kept out of LFS (last matching pattern wins).
   *
   * @see https://git-lfs.com
   */
  private async createGitattributes(path: string): Promise<void> {
    const lines = [
      'lfs/** filter=lfs diff=lfs merge=lfs -text',
      'lfs/.gitkeep -filter -diff -merge text',
    ];
    await Fs.writeFile(Path.join(path, '.gitattributes'), lines.join(Os.EOL));
  }

  private async upgradeObjectFile(
    projectId: string,
    objectType: ObjectType,
    reference: FileReference,
    collectionId?: string
  ): Promise<void> {
    switch (objectType) {
      case 'asset': {
        const assetFilePath = pathTo.assetFile(projectId, reference.id);
        const prevAssetFile =
          await this.jsonFileService.unsafeRead(assetFilePath);
        const migratedAssetFile = this.assetService.migrate(prevAssetFile);
        await this.assetService.update({ projectId, ...migratedAssetFile });
        this.logService.info({
          source: 'core',
          message: `Upgraded ${objectType} "${assetFilePath}"`,
          meta: {
            previous: prevAssetFile,
            migrated: migratedAssetFile,
          },
        });
        return;
      }
      case 'component': {
        const componentFilePath = pathTo.componentFile(projectId, reference.id);
        const prevComponentFile =
          await this.jsonFileService.unsafeRead(componentFilePath);
        const migratedComponentFile =
          this.componentService.migrate(prevComponentFile);
        await this.componentService.update({
          projectId,
          ...migratedComponentFile,
        });
        this.logService.info({
          source: 'core',
          message: `Upgraded ${objectType} "${componentFilePath}"`,
          meta: {
            previous: prevComponentFile,
            migrated: migratedComponentFile,
          },
        });
        return;
      }
      case 'collection': {
        const collectionFilePath = pathTo.collectionFile(
          projectId,
          reference.id
        );
        const prevCollectionFile =
          await this.jsonFileService.unsafeRead(collectionFilePath);
        const migratedCollectionFile =
          this.collectionService.migrate(prevCollectionFile);
        await this.collectionService.update({
          projectId,
          ...migratedCollectionFile,
        });
        this.logService.info({
          source: 'core',
          message: `Upgraded ${objectType} "${collectionFilePath}"`,
          meta: {
            previous: prevCollectionFile,
            migrated: migratedCollectionFile,
          },
        });
        return;
      }
      case 'entry': {
        if (!collectionId) {
          throw CoreError.badRequest(
            'Missing required parameter "collectionId"'
          );
        }
        const entryFilePath = pathTo.entryFile(
          projectId,
          collectionId,
          reference.id
        );
        const prevEntryFile =
          await this.jsonFileService.unsafeRead(entryFilePath);
        const migratedEntryFile = this.entryService.migrate(prevEntryFile);
        await this.entryService.update({
          projectId,
          collectionId,
          ...migratedEntryFile,
        });
        this.logService.info({
          source: 'core',
          message: `Upgraded ${objectType} "${entryFilePath}"`,
          meta: {
            previous: prevEntryFile,
            migrated: migratedEntryFile,
          },
        });
        return;
      }
      default:
        throw CoreError.badRequest(
          `Trying to upgrade unsupported object file of type "${objectType}"`
        );
    }
  }
}
