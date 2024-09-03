import Fs from 'fs-extra';
import Os from 'os';
import Path from 'path';
import Semver from 'semver';
import {
  NoCurrentUserError,
  ProjectUpgradeError,
  RequiredParameterMissingError,
} from '../error/index.js';
import {
  assetFileSchema,
  cloneProjectSchema,
  collectionFileSchema,
  createProjectSchema,
  currentBranchProjectSchema,
  deleteProjectSchema,
  entryFileSchema,
  FileReference,
  getChangesProjectSchema,
  getRemoteOriginUrlProjectSchema,
  gitCommitIconSchema,
  listBranchesProjectSchema,
  listProjectsSchema,
  ObjectType,
  objectTypeSchema,
  OutdatedProject,
  outdatedProjectSchema,
  projectFileSchema,
  projectFolderSchema,
  readProjectSchema,
  serviceTypeSchema,
  setRemoteOriginUrlProjectSchema,
  switchBranchProjectSchema,
  synchronizeProjectSchema,
  updateProjectSchema,
  upgradeProjectSchema,
  Version,
  type BaseFile,
  type CloneProjectProps,
  type CollectionExport,
  type CreateProjectProps,
  type CrudServiceWithListCount,
  type CurrentBranchProjectProps,
  type DeleteProjectProps,
  type ElekIoCoreOptions,
  type GetChangesProjectProps,
  type GetRemoteOriginUrlProjectProps,
  type ListBranchesProjectProps,
  type ListProjectsProps,
  type PaginatedList,
  type Project,
  type ProjectExport,
  type ProjectFile,
  type ProjectSettings,
  type ReadProjectProps,
  type SetRemoteOriginUrlProjectProps,
  type SwitchBranchProjectProps,
  type SynchronizeProjectProps,
  type UpdateProjectProps,
  type UpgradeProjectProps,
} from '../schema/index.js';
import { notEmpty, pathTo, returnResolved } from '../util/node.js';
import { datetime, uuid } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import { AssetService } from './AssetService.js';
import { CollectionService } from './CollectionService.js';
import type { EntryService } from './EntryService.js';
import { GitService } from './GitService.js';
import { JsonFileService } from './JsonFileService.js';
import { LogService } from './LogService.js';
import { UserService } from './UserService.js';

/**
 * Service that manages CRUD functionality for Project files on disk
 */
export class ProjectService
  extends AbstractCrudService
  implements CrudServiceWithListCount<Project>
{
  private coreVersion: Version;
  private logService: LogService;
  private jsonFileService: JsonFileService;
  private userService: UserService;
  private gitService: GitService;
  private assetService: AssetService;
  private collectionService: CollectionService;
  private entryService: EntryService;

  constructor(
    coreVersion: Version,
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    userService: UserService,
    gitService: GitService,
    assetService: AssetService,
    collectionService: CollectionService,
    entryService: EntryService
  ) {
    super(serviceTypeSchema.Enum.Project, options);

    this.coreVersion = coreVersion;
    this.logService = logService;
    this.jsonFileService = jsonFileService;
    this.userService = userService;
    this.gitService = gitService;
    this.assetService = assetService;
    this.collectionService = collectionService;
    this.entryService = entryService;
  }

  /**
   * Creates a new Project
   */
  public async create(props: CreateProjectProps): Promise<Project> {
    createProjectSchema.parse(props);

    const user = await this.userService.get();
    if (!user) {
      throw new NoCurrentUserError();
    }

    const id = uuid();
    const defaultSettings: ProjectSettings = {
      language: {
        default: user.language,
        supported: [user.language],
      },
    };

    const projectFile: ProjectFile = {
      ...props,
      objectType: 'project',
      id,
      description: props.description || '',
      settings: Object.assign({}, defaultSettings, props.settings),
      created: datetime(),
      updated: null,
      coreVersion: this.coreVersion,
      status: 'todo',
      version: '0.0.1',
    };

    const projectPath = pathTo.project(id);

    await Fs.ensureDir(projectPath);

    try {
      await this.createFolderStructure(projectPath);
      await this.createGitignore(projectPath);
      await this.gitService.init(projectPath, { initialBranch: 'main' });
      await this.jsonFileService.create(
        projectFile,
        pathTo.projectFile(id),
        projectFileSchema
      );
      await this.gitService.add(projectPath, ['.']);
      await this.gitService.commit(
        projectPath,
        `${gitCommitIconSchema.enum.INIT} Created this new elek.io project`
      );
      await this.gitService.branches.switch(projectPath, 'stage', {
        isNew: true,
      });
    } catch (error) {
      // To avoid partial data being added to the repository / git status reporting uncommitted files
      await this.delete({
        id,
      });
      throw error;
    }

    return await this.toProject(projectFile);
  }

  /**
   * Clones a Project by URL
   */
  public async clone(props: CloneProjectProps): Promise<Project> {
    cloneProjectSchema.parse(props);

    const tmpId = uuid();
    const tmpProjectPath = Path.join(pathTo.tmp, tmpId);
    // await Fs.ensureDir(tmpProjectPath);
    await this.gitService.clone(props.url, tmpProjectPath);

    // Check if it is actually a Project by trying to read it
    const projectFile = await this.jsonFileService.read(
      Path.join(tmpProjectPath, 'project.json'),
      projectFileSchema
    );

    // If so, copy it into the correct directory
    const projectPath = pathTo.project(projectFile.id);
    const alreadyExists = await Fs.pathExists(projectPath);
    if (alreadyExists) {
      throw new Error(
        `Tried to clone Project "${projectFile.id}" from "${props.url}" - but the Project already exists locally`
      );
    }
    await Fs.copy(tmpProjectPath, projectPath);
    await Fs.remove(tmpProjectPath);

    return await this.toProject(projectFile);
  }

  /**
   * Returns a Project by ID
   *
   * If a commit hash is provided, the Project is read from history
   */
  public async read(props: ReadProjectProps): Promise<Project> {
    readProjectSchema.parse(props);

    if (!props.commitHash) {
      const projectFile = await this.jsonFileService.read(
        pathTo.projectFile(props.id),
        projectFileSchema
      );

      return await this.toProject(projectFile);
    } else {
      const projectFile = this.migrate(
        JSON.parse(
          await this.gitService.getFileContentAtCommit(
            pathTo.project(props.id),
            pathTo.projectFile(props.id),
            props.commitHash
          )
        )
      );

      return await this.toProject(projectFile);
    }
  }

  /**
   * Updates given Project
   */
  public async update(props: UpdateProjectProps): Promise<Project> {
    updateProjectSchema.parse(props);

    const projectPath = pathTo.project(props.id);
    const filePath = pathTo.projectFile(props.id);
    const prevProjectFile = await this.read(props);

    const projectFile: ProjectFile = {
      ...prevProjectFile,
      name: props.name || prevProjectFile.name,
      description: props.description || prevProjectFile.description,
      settings: {
        language: {
          supported:
            props.settings?.language.supported ||
            prevProjectFile.settings.language.supported,
          default:
            props.settings?.language.default ||
            prevProjectFile.settings.language.default,
        },
      },
      updated: datetime(),
    };

    await this.jsonFileService.update(projectFile, filePath, projectFileSchema);
    await this.gitService.add(projectPath, [filePath]);
    await this.gitService.commit(projectPath, this.gitMessage.update);

    return await this.toProject(projectFile);
  }

  /**
   * Upgrades given Project to the current version of Core
   *
   * Needed when a new Core version is requiring changes to existing files or structure.
   */
  public async upgrade(props: UpgradeProjectProps): Promise<void> {
    upgradeProjectSchema.parse(props);

    const projectPath = pathTo.project(props.id);
    const projectFilePath = pathTo.projectFile(props.id);

    // Get the current Project file
    const prevProjectFile = outdatedProjectSchema
      .passthrough() // Allow unknown properties
      .parse(await this.jsonFileService.unsafeRead(projectFilePath));

    if (Semver.gt(prevProjectFile.coreVersion, this.coreVersion)) {
      // Upgrade of the client needed before the project can be upgraded
      throw new ProjectUpgradeError(
        `The Projects Core version "${prevProjectFile.coreVersion}" is higher than the current Core version "${this.coreVersion}".`
      );
    }

    if (
      Semver.eq(prevProjectFile.coreVersion, this.coreVersion) &&
      props.force !== true
    ) {
      // Nothing, since both are equal
      throw new ProjectUpgradeError(
        `The Projects Core version "${prevProjectFile.coreVersion}" is already up to date.`
      );
    }

    const assetReferences = await this.listReferences('asset', props.id);
    const collectionReferences = await this.listReferences(
      'collection',
      props.id
    );

    this.logService.info(
      `Attempting to upgrade Project "${props.id}" from Core version ${prevProjectFile.coreVersion} to ${this.coreVersion}`
    );

    // Make a tag to revert back to on failure
    const failsafeTag = await this.gitService.tags.create({
      path: projectPath,
      message: `Attempting to upgrade Project from Core version ${prevProjectFile.coreVersion} to ${this.coreVersion}`,
    });

    try {
      await Promise.all(
        assetReferences.map(async (reference) => {
          await this.upgradeObjectFile(props.id, 'asset', reference);
        })
      );

      await Promise.all(
        collectionReferences.map(async (reference) => {
          await this.upgradeObjectFile(props.id, 'collection', reference);
        })
      );

      await Promise.all(
        collectionReferences.map(async (collectionReference) => {
          const entryReferences = await this.listReferences(
            'entry',
            props.id,
            collectionReference.id
          );

          await Promise.all(
            entryReferences.map(async (reference) => {
              await this.upgradeObjectFile(
                props.id,
                'entry',
                reference,
                collectionReference.id
              );
            })
          );
        })
      );

      // Upgrade the Project file itself
      const migratedProjectFile = this.migrate(prevProjectFile);
      await this.jsonFileService.update(
        {
          ...migratedProjectFile,
          coreVersion: this.coreVersion, // Override the Projects core version
        },
        projectFilePath,
        projectFileSchema
      );
      this.logService.info(`Upgraded project "${projectFilePath}"`, {
        previous: prevProjectFile,
        migrated: migratedProjectFile,
      });

      // And create another tag to show the successfull upgrade in git log
      await this.gitService.tags.create({
        path: projectPath,
        message: `Upgraded Project to Core version "${this.coreVersion}"`,
      });

      // Done, remove the failsafe tag again
      await this.gitService.tags.delete({
        path: projectPath,
        id: failsafeTag.id,
      });
    } catch (error) {
      // Reset Project to the tag made before
      await this.gitService.reset(projectPath, 'hard', failsafeTag.id);

      throw error;
    }
  }

  public branches = {
    list: async (props: ListBranchesProjectProps) => {
      listBranchesProjectSchema.parse(props);
      const projectPath = pathTo.project(props.id);
      const hasOrigin = await this.gitService.remotes.hasOrigin(projectPath);
      if (hasOrigin) {
        await this.gitService.fetch(projectPath);
      }
      return await this.gitService.branches.list(projectPath);
    },
    current: async (props: CurrentBranchProjectProps) => {
      currentBranchProjectSchema.parse(props);
      const projectPath = pathTo.project(props.id);
      return await this.gitService.branches.current(projectPath);
    },
    switch: async (props: SwitchBranchProjectProps) => {
      switchBranchProjectSchema.parse(props);
      const projectPath = pathTo.project(props.id);
      return await this.gitService.branches.switch(
        projectPath,
        props.branch,
        props.options
      );
    },
  };

  public remotes = {
    getOriginUrl: async (props: GetRemoteOriginUrlProjectProps) => {
      getRemoteOriginUrlProjectSchema.parse(props);
      const projectPath = pathTo.project(props.id);
      const hasOrigin = await this.gitService.remotes.hasOrigin(projectPath);
      if (!hasOrigin) {
        return null;
      } else {
        return await this.gitService.remotes.getOriginUrl(projectPath);
      }
    },
    setOriginUrl: async (props: SetRemoteOriginUrlProjectProps) => {
      setRemoteOriginUrlProjectSchema.parse(props);
      const projectPath = pathTo.project(props.id);
      const hasOrigin = await this.gitService.remotes.hasOrigin(projectPath);
      if (!hasOrigin) {
        await this.gitService.remotes.addOrigin(projectPath, props.url);
      } else {
        await this.gitService.remotes.setOriginUrl(projectPath, props.url);
      }
    },
  };

  /**
   * Returns the differences of the given Projects current branch
   * between the local and remote `origin` (commits ahead & behind)
   *
   * - `behind` contains a list of commits on the current branch that are available on the remote `origin` but not yet locally
   * - `ahead` contains a list of commits on the current branch that are available locally but not yet on the remote `origin`
   */
  public async getChanges(props: GetChangesProjectProps) {
    getChangesProjectSchema.parse(props);
    const projectPath = pathTo.project(props.id);
    const currentBranch = await this.gitService.branches.current(projectPath);

    await this.gitService.fetch(projectPath);
    const behind = await this.gitService.log(projectPath, {
      between: { from: currentBranch, to: `origin/${currentBranch}` },
    });
    const ahead = await this.gitService.log(projectPath, {
      between: { from: `origin/${currentBranch}`, to: currentBranch },
    });

    return {
      behind,
      ahead,
    };
  }

  /**
   * Pulls remote changes of `origin` down to the local repository
   * and then pushes local commits to the upstream branch
   */
  public async synchronize(props: SynchronizeProjectProps) {
    synchronizeProjectSchema.parse(props);
    const projectPath = pathTo.project(props.id);

    await this.gitService.pull(projectPath);
    await this.gitService.push(projectPath);
  }

  /**
   * Deletes given Project
   *
   * Deletes the whole Project folder including the history, not only the config file.
   * Use with caution, since a Project that is only available locally could be lost forever.
   * Or changes that are not pushed to a remote yet, will be lost too.
   */
  public async delete(props: DeleteProjectProps): Promise<void> {
    deleteProjectSchema.parse(props);

    await Fs.remove(pathTo.project(props.id));
  }

  /**
   * Lists outdated Projects that need to be upgraded
   */
  public async listOutdated(): Promise<OutdatedProject[]> {
    const projectReferences = await this.listReferences(
      objectTypeSchema.Enum.project
    );

    const result = await Promise.all(
      projectReferences.map(async (reference) => {
        const json = await this.jsonFileService.unsafeRead(
          pathTo.projectFile(reference.id)
        );
        const projectFile = outdatedProjectSchema.parse(json);

        if (projectFile.coreVersion !== this.coreVersion) {
          return projectFile;
        }

        return null;
      })
    );

    return result.filter(notEmpty);
  }

  public async list(
    props?: ListProjectsProps
  ): Promise<PaginatedList<Project>> {
    if (props) {
      listProjectsSchema.parse(props);
    }

    const offset = props?.offset || 0;
    const limit = props?.limit || 15;

    const projectReferences = await this.listReferences(
      objectTypeSchema.Enum.project
    );

    const partialProjectReferences = projectReferences.slice(offset, limit);

    const projects = await returnResolved(
      partialProjectReferences.map((reference) => {
        return this.read({ id: reference.id });
      })
    );

    return {
      total: projectReferences.length,
      limit,
      offset,
      list: projects,
    };
  }

  public async count(): Promise<number> {
    return (await this.listReferences(objectTypeSchema.Enum.project)).length;
  }

  /**
   * Checks if given object is of type Project
   */
  public isProject(obj: BaseFile | unknown): obj is Project {
    return projectFileSchema.safeParse(obj).success;
  }

  /**
   * Exports given Project to JSON
   *
   * @todo do not read everything before writing to disk -> stream into file given via props
   * @todo performance tests
   * @todo add progress callback
   */
  public async exportToJson(projectId: string): Promise<ProjectExport> {
    const project = await this.read({ id: projectId });
    const assets = (await this.assetService.list({ projectId, limit: 0 })).list;
    const collections = (
      await this.collectionService.list({ projectId, limit: 0 })
    ).list;

    const collectionExport: CollectionExport[] = await Promise.all(
      collections.map(async (collection) => {
        const entries = (
          await this.entryService.list({
            projectId,
            collectionId: collection.id,
            limit: 0,
          })
        ).list;

        return {
          ...collection,
          entries,
        };
      })
    );

    return {
      ...project,
      assets,
      collections: collectionExport,
    };
  }

  /**
   * Migrates an potentially outdated Project file to the current schema
   */
  public migrate(potentiallyOutdatedProjectFile: unknown) {
    // @todo

    return projectFileSchema.parse(potentiallyOutdatedProjectFile);
  }

  /**
   * Creates a Project from given ProjectFile
   */
  private async toProject(projectFile: ProjectFile): Promise<Project> {
    const fullHistory = await this.gitService.log(
      pathTo.project(projectFile.id)
    );
    const history = await this.gitService.log(pathTo.project(projectFile.id), {
      filePath: pathTo.projectFile(projectFile.id),
    });

    return {
      ...projectFile,
      history,
      fullHistory,
    };
  }

  /**
   * Creates the projects folder structure and makes sure to
   * write empty .gitkeep files inside them to ensure they are
   * committed
   */
  private async createFolderStructure(path: string): Promise<void> {
    const folders = Object.values(projectFolderSchema.Values);

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
      // projectFolderSchema.Enum.theme + '/',
      // projectFolderSchema.Enum.public + '/',
      // projectFolderSchema.Enum.logs + '/',
    ];
    await Fs.writeFile(Path.join(path, '.gitignore'), lines.join(Os.EOL));
  }

  private async upgradeObjectFile(
    projectId: string,
    objectType: ObjectType,
    reference: FileReference,
    collectionId?: string
  ) {
    switch (objectType) {
      case 'asset': {
        const assetFilePath = pathTo.assetFile(projectId, reference.id);
        const prevAssetFile = await this.jsonFileService.unsafeRead(
          assetFilePath
        );
        const migratedAssetFile = this.assetService.migrate(prevAssetFile);
        await this.jsonFileService.update(
          migratedAssetFile,
          assetFilePath,
          assetFileSchema
        );
        this.logService.info(`Upgraded ${objectType} "${assetFilePath}"`, {
          previous: prevAssetFile,
          migrated: migratedAssetFile,
        });
        return;
      }
      case 'collection': {
        const collectionFilePath = pathTo.collectionFile(
          projectId,
          reference.id
        );
        const prevCollectionFile = await this.jsonFileService.unsafeRead(
          collectionFilePath
        );
        const migratedCollectionFile =
          this.collectionService.migrate(prevCollectionFile);
        await this.jsonFileService.update(
          migratedCollectionFile,
          collectionFilePath,
          collectionFileSchema
        );
        this.logService.info(`Upgraded ${objectType} "${collectionFilePath}"`, {
          previous: prevCollectionFile,
          migrated: migratedCollectionFile,
        });
        return;
      }
      case 'entry': {
        if (!collectionId) {
          throw new RequiredParameterMissingError('collectionId');
        }
        const entryFilePath = pathTo.entryFile(
          projectId,
          collectionId,
          reference.id
        );
        const prevEntryFile = await this.jsonFileService.unsafeRead(
          entryFilePath
        );
        const migratedEntryFile = this.entryService.migrate(prevEntryFile);
        await this.jsonFileService.update(
          migratedEntryFile,
          entryFilePath,
          entryFileSchema
        );
        this.logService.info(`Upgraded ${objectType} "${entryFilePath}"`, {
          previous: prevEntryFile,
          migrated: migratedEntryFile,
        });
        return;
      }
      default:
        throw new Error(
          `Trying to upgrade unsupported object file of type "${objectType}"`
        );
    }
  }
}
