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
import { datetime, uuid } from '../util/shared.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { AssetService } from './AssetService.js';
import type { CollectionService } from './CollectionService.js';
import type { ComponentService } from './ComponentService.js';
import type { EntryService } from './EntryService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';
import {
  CoreErrors,
  parseSchema,
  ResultAsync,
  errAsync,
  okAsync,
  type CoreResult,
} from '../util/shared.js';

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

  constructor(
    coreVersion: Version,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    assetService: AssetService,
    collectionService: CollectionService,
    componentService: ComponentService,
    entryService: EntryService
  ) {
    super(serviceTypeSchema.enum.Project, options, logService, gitService, jsonFileService);

    this.coreVersion = coreVersion;
    this.assetService = assetService;
    this.collectionService = collectionService;
    this.componentService = componentService;
    this.entryService = entryService;
  }

  /**
   * Creates a new Project
   */
  public create(props: CreateProjectProps): CoreResult<Project> {
    const validated = parseSchema(createProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }
    const validatedProps = validated.value;

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

    const operation = ResultAsync.fromPromise(
      Fs.ensureDir(projectPath),
      CoreErrors.fromUnknown
    )
      .andThen(() => this.createFolderStructure(projectPath))
      .andThen(() => this.createGitignore(projectPath))
      .andThen(() =>
        this.gitService.init(projectPath, {
          initialBranch: projectBranchSchema.enum.production,
        })
      )
      .andThen(() =>
        this.jsonFileService.create(
          projectFile,
          pathTo.projectFile(id),
          projectFileSchema
        )
      )
      .andThen(() => this.gitService.add(projectPath, ['.']))
      .andThen(() =>
        this.gitService.commit(projectPath, {
          method: 'create',
          reference: { objectType: 'project', id },
        })
      )
      .andThen(() =>
        this.gitService.branches.switch(
          projectPath,
          projectBranchSchema.enum.work,
          {
            isNew: true,
          }
        )
      )
      .andThen(() => this.toProject(projectFile));

    return this.logged(
      'create',
      operation.orElse((error) =>
        this.delete({ id, force: true }).andThen(() => errAsync(error))
      )
    );
  }

  /**
   * Clones a Project by URL
   */
  public clone(props: CloneProjectProps): CoreResult<Project> {
    const validated = parseSchema(cloneProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const tmpId = uuid();
    const tmpProjectPath = Path.join(pathTo.tmp, tmpId);

    const result = this.gitService.clone(props.url, tmpProjectPath)
      .andThen(() =>
        this.jsonFileService.read(
          Path.join(tmpProjectPath, 'project.json'),
          projectFileSchema
        )
      )
      .andThen((projectFile) => {
        const projectPath = pathTo.project(projectFile.id);
        return ResultAsync.fromPromise(
          Fs.pathExists(projectPath),
          CoreErrors.fromUnknown
        ).andThen((alreadyExists) => {
          if (alreadyExists) {
            return errAsync(
              CoreErrors.conflict(
                `Tried to clone Project "${projectFile.id}" from "${props.url}" - but the Project already exists locally`
              )
            );
          }
          return ResultAsync.fromPromise(
            Fs.copy(tmpProjectPath, projectPath),
            CoreErrors.fromUnknown
          )
            .andThen(() =>
              ResultAsync.fromPromise(
                Fs.remove(tmpProjectPath),
                CoreErrors.fromUnknown
              )
            )
            .andThen(() => this.toProject(projectFile));
        });
      });

    return this.logged('clone', result);
  }

  /**
   * Returns a Project by ID
   *
   * If a commit hash is provided, the Project is read from history
   */
  public read(props: ReadProjectProps): CoreResult<Project> {
    const validated = parseSchema(readProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    if (!props.commitHash) {
      const result = this.jsonFileService
        .read(pathTo.projectFile(props.id), projectFileSchema)
        .andThen((projectFile) => this.toProject(projectFile));

      return this.logged('read', result);
    } else {
      const result = this.gitService
        .getFileContentAtCommit(
          pathTo.project(props.id),
          pathTo.projectFile(props.id),
          props.commitHash
        )
        .andThen((content) => {
          const projectFile = this.migrate(JSON.parse(content));
          return this.toProject(projectFile);
        });

      return this.logged('read', result);
    }
  }

  /**
   * Returns the commit history of a Project
   */
  public history(
    props: ProjectHistoryProps
  ): CoreResult<ProjectHistoryResult> {
    const validated = parseSchema(projectHistorySchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const projectPath = pathTo.project(props.id);

    const result = this.gitService
      .log(projectPath)
      .andThen((fullHistory) =>
        this.gitService
          .log(projectPath, {
            filePath: pathTo.projectFile(props.id),
          })
          .map((history) => ({ history, fullHistory }))
      );

    return this.logged('history', result);
  }

  /**
   * Updates given Project
   */
  public update(props: UpdateProjectProps): CoreResult<Project> {
    const validated = parseSchema(updateProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }
    const validatedProps = validated.value;

    const projectPath = pathTo.project(validatedProps.id);
    const filePath = pathTo.projectFile(validatedProps.id);

    const result = this.read(validatedProps)
      .andThen((prevProjectFile) => {
        const projectFile: ProjectFile = {
          ...prevProjectFile,
          ...validatedProps,
          updated: datetime(),
        };

        return this.jsonFileService
          .update(projectFile, filePath, projectFileSchema)
          .andThen(() => this.gitService.add(projectPath, [filePath]))
          .andThen(() =>
            this.gitService.commit(projectPath, {
              method: 'update',
              reference: { objectType: 'project', id: projectFile.id },
            })
          )
          .andThen(() => this.toProject(projectFile));
      });

    return this.logged('update', result);
  }

  /**
   * Upgrades given Project to the current version of Core
   *
   * Needed when a new Core version is requiring changes to existing files or structure.
   */
  public upgrade(props: UpgradeProjectProps): CoreResult<void> {
    const validated = parseSchema(upgradeProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const projectPath = pathTo.project(props.id);
    const projectFilePath = pathTo.projectFile(props.id);

    const result = this.gitService.branches
      .current(projectPath)
      .andThen((currentBranch) => {
        if (currentBranch !== projectBranchSchema.enum.work) {
          return this.gitService.branches
            .switch(projectPath, projectBranchSchema.enum.work)
            .map(() => undefined);
        }
        return okAsync(undefined);
      })
      .andThen(() =>
        this.jsonFileService.unsafeRead(projectFilePath)
      )
      .andThen((currentProjectFile) => {
        const typed = currentProjectFile as Record<string, unknown> & {
          coreVersion: string;
        };

        if (Semver.gt(typed.coreVersion, this.coreVersion)) {
          return errAsync(
            CoreErrors.upgradeFailed(
              `The Projects Core version "${typed.coreVersion}" is higher than the current Core version "${this.coreVersion}".`
            )
          );
        }

        if (
          Semver.eq(typed.coreVersion, this.coreVersion) &&
          props.force !== true
        ) {
          return errAsync(
            CoreErrors.upgradeFailed(
              `The Projects Core version "${typed.coreVersion}" is already up to date.`
            )
          );
        }

        return this.listReferences('asset', props.id)
          .andThen((assetReferences) =>
            this.listReferences('component', props.id).andThen(
              (componentReferences) =>
                this.listReferences('collection', props.id).map(
                  (collectionReferences) => ({
                    assetReferences,
                    componentReferences,
                    collectionReferences,
                    currentProjectFile: typed,
                  })
                )
            )
          );
      })
      .andThen(
        ({
          assetReferences,
          componentReferences,
          collectionReferences,
          currentProjectFile,
        }) => {
          this.logService.info({
            source: 'core',
            message: `Attempting to upgrade Project "${props.id}" from Core version ${currentProjectFile.coreVersion} to ${this.coreVersion}`,
          });

          const upgradeBranchName = `upgrade/core-${currentProjectFile.coreVersion}-to-${this.coreVersion}`;

          const upgradeOperation = this.gitService.branches
            .switch(projectPath, upgradeBranchName, { isNew: true })
            .andThen(() =>
              ResultAsync.combine(
                assetReferences.map((reference) =>
                  this.upgradeObjectFile(props.id, 'asset', reference)
                )
              )
            )
            .andThen(() =>
              ResultAsync.combine(
                componentReferences.map((reference) =>
                  this.upgradeObjectFile(props.id, 'component', reference)
                )
              )
            )
            .andThen(() =>
              ResultAsync.combine(
                collectionReferences.map((reference) =>
                  this.upgradeObjectFile(props.id, 'collection', reference)
                )
              )
            )
            .andThen(() =>
              ResultAsync.combine(
                collectionReferences.map((collectionReference) =>
                  this.listReferences(
                    'entry',
                    props.id,
                    collectionReference.id
                  ).andThen((entryReferences) =>
                    ResultAsync.combine(
                      entryReferences.map((reference) =>
                        this.upgradeObjectFile(
                          props.id,
                          'entry',
                          reference,
                          collectionReference.id
                        )
                      )
                    )
                  )
                )
              )
            )
            .andThen(() => {
              const migratedProjectFile = this.migrate(currentProjectFile);
              return this.update(migratedProjectFile)
                .andThen(() =>
                  this.gitService.branches.switch(
                    projectPath,
                    projectBranchSchema.enum.work
                  )
                )
                .andThen(() =>
                  this.gitService.merge(projectPath, upgradeBranchName, {
                    squash: true,
                  })
                )
                .andThen(() =>
                  this.gitService.commit(projectPath, {
                    method: 'upgrade',
                    reference: {
                      objectType: 'project',
                      id: migratedProjectFile.id,
                    },
                  })
                )
                .andThen(() =>
                  this.gitService.tags.create({
                    path: projectPath,
                    message: {
                      type: 'upgrade',
                      coreVersion: migratedProjectFile.coreVersion,
                    },
                  })
                )
                .andThen(() =>
                  this.gitService.branches.delete(
                    projectPath,
                    upgradeBranchName,
                    true
                  )
                )
                .map(() => {
                  this.logService.info({
                    source: 'core',
                    message: `Successfully upgraded Project "${props.id}" to Core version "${this.coreVersion}"`,
                    meta: {
                      previous: currentProjectFile,
                      migrated: migratedProjectFile,
                    },
                  });
                });
            });

          return upgradeOperation.orElse((error) =>
            this.gitService.branches
              .switch(projectPath, projectBranchSchema.enum.work)
              .andThen(() =>
                this.gitService.branches.delete(
                  projectPath,
                  upgradeBranchName,
                  true
                )
              )
              .andThen(() => errAsync(error))
          );
        }
      );

    return this.logged('upgrade', result);
  }

  public branches = {
    list: (props: ListBranchesProjectProps): CoreResult<{ local: string[]; remote: string[] }> => {
      const validated = parseSchema(listBranchesProjectSchema, props);
      if (validated.isErr()) {
        return errAsync(validated.error);
      }

      const projectPath = pathTo.project(props.id);
      return this.logged(
        'branches.list',
        this.gitService.remotes.hasOrigin(projectPath).andThen((hasOrigin) => {
          if (hasOrigin) {
            return this.gitService
              .fetch(projectPath)
              .andThen(() => this.gitService.branches.list(projectPath));
          }
          return this.gitService.branches.list(projectPath);
        })
      );
    },
    current: (props: CurrentBranchProjectProps): CoreResult<string> => {
      const validated = parseSchema(currentBranchProjectSchema, props);
      if (validated.isErr()) {
        return errAsync(validated.error);
      }

      const projectPath = pathTo.project(props.id);
      return this.logged(
        'branches.current',
        this.gitService.branches.current(projectPath)
      );
    },
    switch: (props: SwitchBranchProjectProps): CoreResult<void> => {
      const validated = parseSchema(switchBranchProjectSchema, props);
      if (validated.isErr()) {
        return errAsync(validated.error);
      }

      const projectPath = pathTo.project(props.id);
      return this.logged(
        'branches.switch',
        this.gitService.branches.switch(
          projectPath,
          props.branch,
          props.options
        )
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
  ): CoreResult<void> {
    const validated = parseSchema(setRemoteOriginUrlProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const projectPath = pathTo.project(props.id);
    const result = this.gitService.remotes
      .hasOrigin(projectPath)
      .andThen((hasOrigin) => {
        if (!hasOrigin) {
          return this.gitService.remotes.addOrigin(projectPath, props.url);
        }
        return this.gitService.remotes.setOriginUrl(projectPath, props.url);
      });

    return this.logged('setRemoteOriginUrl', result);
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
    const validated = parseSchema(getChangesProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const projectPath = pathTo.project(props.id);
    const result = this.gitService.remotes
      .hasOrigin(projectPath)
      .andThen((hasRemoteOrigin) => {
        if (hasRemoteOrigin === false) {
          return errAsync(
            CoreErrors.preconditionFailed(
              `Project "${props.id}" does not have a remote origin`
            )
          );
        }
        return this.gitService.branches.current(projectPath);
      })
      .andThen((currentBranch) =>
        this.gitService.fetch(projectPath).andThen(() =>
          this.gitService
            .log(projectPath, {
              between: {
                from: currentBranch,
                to: `origin/${currentBranch}`,
              },
            })
            .andThen((behind) =>
              this.gitService
                .log(projectPath, {
                  between: {
                    from: `origin/${currentBranch}`,
                    to: currentBranch,
                  },
                })
                .map((ahead) => ({ behind, ahead }))
            )
        )
      );

    return this.logged('getChanges', result);
  }

  /**
   * Pulls remote changes of `origin` down to the local repository
   * and then pushes local commits to the upstream branch
   */
  public synchronize(props: SynchronizeProjectProps): CoreResult<void> {
    const validated = parseSchema(synchronizeProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const projectPath = pathTo.project(props.id);
    const result = this.gitService
      .pull(projectPath)
      .andThen(() => this.gitService.push(projectPath));

    return this.logged('synchronize', result);
  }

  /**
   * Deletes given Project
   *
   * Deletes the whole Project folder including the history, not only the config file.
   * Throws in case a Project is only available locally and could be lost forever,
   * or changes are not pushed to a remote yet.
   */
  public delete(props: DeleteProjectProps): CoreResult<void> {
    const validated = parseSchema(deleteProjectSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const result = this.gitService.remotes
      .hasOrigin(pathTo.project(props.id))
      .andThen((hasRemoteOrigin) => {
        if (hasRemoteOrigin === false && props.force !== true) {
          return errAsync(
            CoreErrors.preconditionFailed(
              `Project "${props.id}" does not have a remote origin. Use force to delete anyway.`
            )
          );
        }

        if (hasRemoteOrigin === true && props.force !== true) {
          return this.getChanges({ id: props.id }).andThen((changes) => {
            if (changes.ahead.length > 0) {
              return errAsync(
                CoreErrors.conflict(
                  `Project "${props.id}" has local changes that are not pushed to the remote origin. Use force to delete anyway.`
                )
              );
            }
            return ResultAsync.fromPromise(
              Fs.remove(pathTo.project(props.id)),
              CoreErrors.fromUnknown
            );
          });
        }

        return ResultAsync.fromPromise(
          Fs.remove(pathTo.project(props.id)),
          CoreErrors.fromUnknown
        );
      });

    return this.logged('delete', result);
  }

  /**
   * Lists outdated Projects that need to be upgraded
   */
  public listOutdated(): CoreResult<ProjectFile[]> {
    const result = this.listReferences(objectTypeSchema.enum.project).andThen(
      (projectReferences) =>
        ResultAsync.fromSafePromise(
          Promise.all(
            projectReferences.map(async (reference) => {
              const jsonResult = await this.jsonFileService.unsafeRead(
                pathTo.projectFile(reference.id)
              );
              if (jsonResult.isErr()) {
                return null;
              }
              const projectFile = migrateProjectSchema.parse(jsonResult.value);

              if (projectFile.coreVersion !== this.coreVersion) {
                return this.migrate(projectFile);
              }

              return null;
            })
          )
        ).map((results) => results.filter(isNotEmpty))
    );

    return this.logged('listOutdated', result);
  }

  public list(
    props?: ListProjectsProps
  ): CoreResult<PaginatedList<Project>> {
    if (props) {
      const validated = parseSchema(listProjectsSchema, props);
      if (validated.isErr()) {
        return errAsync(validated.error);
      }
    }

    const offset = props?.offset || 0;
    const limit = props?.limit ?? 15;

    const result = this.listReferences(objectTypeSchema.enum.project).andThen(
      (projectReferences) => {
        const partialProjectReferences =
          limit === 0
            ? projectReferences.slice(offset)
            : projectReferences.slice(offset, offset + limit);

        return ResultAsync.fromSafePromise(
          this.collectResults(
            partialProjectReferences.map((reference) =>
              this.read({ id: reference.id })
            )
          )
        ).map((projects) => ({
          total: projectReferences.length,
          limit,
          offset,
          list: projects,
        }));
      }
    );

    return this.logged('list', result);
  }

  public count(): CoreResult<number> {
    const result = this.listReferences(objectTypeSchema.enum.project).map(
      (refs) => refs.length
    );

    return this.logged('count', result);
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
  private toProject(projectFile: ProjectFile): CoreResult<Project> {
    const projectPath = pathTo.project(projectFile.id);

    return this.gitService.remotes
      .hasOrigin(projectPath)
      .andThen((hasOrigin) => {
        if (hasOrigin) {
          return this.gitService.remotes
            .getOriginUrl(projectPath)
            .map((remoteOriginUrl) => ({
              ...projectFile,
              remoteOriginUrl,
            }));
        }
        return okAsync({
          ...projectFile,
          remoteOriginUrl: null,
        });
      });
  }

  /**
   * Creates the projects folder structure and makes sure to
   * write empty .gitkeep files inside them to ensure they are
   * committed
   */
  private createFolderStructure(path: string): CoreResult<void> {
    const folders = Object.values(projectFolderSchema.enum);

    return ResultAsync.fromPromise(
      Promise.all(
        folders.map(async (folder) => {
          await Fs.mkdirp(Path.join(path, folder));
          await Fs.writeFile(Path.join(path, folder, '.gitkeep'), '');
        })
      ),
      CoreErrors.fromUnknown
    ).map(() => undefined);
  }

  /**
   * Writes the Projects main .gitignore file to disk
   *
   * @todo Add general things to ignore
   * @see https://github.com/github/gitignore/tree/master/Global
   */
  private createGitignore(path: string): CoreResult<void> {
    const lines = [
      '# Ignore all hidden files and folders...',
      '.*',
      '# ...but these',
      '!/.gitignore',
      '!/.gitattributes',
      '!/**/.gitkeep',
      '',
      '# elek.io related ignores',
      'collections/index.json',
      'components/index.json',
    ];
    return ResultAsync.fromPromise(
      Fs.writeFile(Path.join(path, '.gitignore'), lines.join(Os.EOL)),
      CoreErrors.fromUnknown
    );
  }

  private upgradeObjectFile(
    projectId: string,
    objectType: ObjectType,
    reference: FileReference,
    collectionId?: string
  ): CoreResult<void> {
    switch (objectType) {
      case 'asset': {
        const assetFilePath = pathTo.assetFile(projectId, reference.id);
        return this.jsonFileService
          .unsafeRead(assetFilePath)
          .andThen((prevAssetFile) => {
            const migratedAssetFile =
              this.assetService.migrate(prevAssetFile);
            return this.assetService
              .update({ projectId, ...migratedAssetFile })
              .map(() => {
                this.logService.info({
                  source: 'core',
                  message: `Upgraded ${objectType} "${assetFilePath}"`,
                  meta: {
                    previous: prevAssetFile,
                    migrated: migratedAssetFile,
                  },
                });
              });
          });
      }
      case 'component': {
        const componentFilePath = pathTo.componentFile(
          projectId,
          reference.id
        );
        return this.jsonFileService
          .unsafeRead(componentFilePath)
          .andThen((prevComponentFile) => {
            const migratedComponentFile =
              this.componentService.migrate(prevComponentFile);
            return this.componentService
              .update({ projectId, ...migratedComponentFile })
              .map(() => {
                this.logService.info({
                  source: 'core',
                  message: `Upgraded ${objectType} "${componentFilePath}"`,
                  meta: {
                    previous: prevComponentFile,
                    migrated: migratedComponentFile,
                  },
                });
              });
          });
      }
      case 'collection': {
        const collectionFilePath = pathTo.collectionFile(
          projectId,
          reference.id
        );
        return this.jsonFileService
          .unsafeRead(collectionFilePath)
          .andThen((prevCollectionFile) => {
            const migratedCollectionFile =
              this.collectionService.migrate(prevCollectionFile);
            return this.collectionService
              .update({ projectId, ...migratedCollectionFile })
              .map(() => {
                this.logService.info({
                  source: 'core',
                  message: `Upgraded ${objectType} "${collectionFilePath}"`,
                  meta: {
                    previous: prevCollectionFile,
                    migrated: migratedCollectionFile,
                  },
                });
              });
          });
      }
      case 'entry': {
        if (!collectionId) {
          return errAsync(
            CoreErrors.badRequest(
              'Missing required parameter "collectionId"'
            )
          );
        }
        const entryFilePath = pathTo.entryFile(
          projectId,
          collectionId,
          reference.id
        );
        return this.jsonFileService
          .unsafeRead(entryFilePath)
          .andThen((prevEntryFile) => {
            const migratedEntryFile =
              this.entryService.migrate(prevEntryFile);
            return this.entryService
              .update({ projectId, collectionId, ...migratedEntryFile })
              .map(() => {
                this.logService.info({
                  source: 'core',
                  message: `Upgraded ${objectType} "${entryFilePath}"`,
                  meta: {
                    previous: prevEntryFile,
                    migrated: migratedEntryFile,
                  },
                });
              });
          });
      }
      default:
        return errAsync(
          CoreErrors.badRequest(
            `Trying to upgrade unsupported object file of type "${objectType}"`
          )
        );
    }
  }
}
