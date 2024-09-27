import Fs from 'fs-extra';
import { version as coreVersion } from '../package.json';
import { LocalApi } from './api/index.js';
import {
  constructorElekIoCoreSchema,
  Version,
  type ConstructorElekIoCoreProps,
  type ElekIoCoreOptions,
} from './schema/index.js';
import {
  AssetService,
  CollectionService,
  EntryService,
  GitService,
  JsonFileService,
  ProjectService,
  UserService,
} from './service/index.js';
import { LogService } from './service/LogService.js';
import * as Util from './util/node.js';

// Export all schemas and shared code that works inside node environments,
// including code that requires filesystem access / git integration etc.
export * from './schema/index.js';
export * from './util/shared.js';

/**
 * elek.io Core
 *
 * Provides access to all services Core is offering
 */
export default class ElekIoCore {
  public readonly coreVersion: Version;
  public readonly options: ElekIoCoreOptions;
  private readonly logService: LogService;
  private readonly userService: UserService;
  private readonly gitService: GitService;
  private readonly jsonFileService: JsonFileService;
  private readonly assetService: AssetService;
  private readonly projectService: ProjectService;
  private readonly collectionService: CollectionService;
  private readonly entryService: EntryService;
  private readonly localApi: LocalApi;

  constructor(props?: ConstructorElekIoCoreProps) {
    this.coreVersion = coreVersion;
    const parsedProps = constructorElekIoCoreSchema.parse(props);

    const defaults: ElekIoCoreOptions = {
      log: {
        level: 'info',
      },
      file: {
        cache: true,
      },
    };
    this.options = Object.assign({}, defaults, parsedProps);

    this.logService = new LogService(this.options);
    this.jsonFileService = new JsonFileService(this.options, this.logService);
    this.userService = new UserService(this.logService, this.jsonFileService);
    this.gitService = new GitService(
      this.options,
      this.logService,
      this.userService
    );
    this.assetService = new AssetService(
      this.options,
      this.logService,
      this.jsonFileService,
      this.gitService
    );
    this.collectionService = new CollectionService(
      this.options,
      this.jsonFileService,
      this.gitService
    );
    this.entryService = new EntryService(
      this.options,
      this.logService,
      this.jsonFileService,
      this.gitService,
      this.collectionService,
      this.assetService
    );
    this.projectService = new ProjectService(
      this.coreVersion,
      this.options,
      this.logService,
      this.jsonFileService,
      this.userService,
      this.gitService,
      this.assetService,
      this.collectionService,
      this.entryService
    );
    this.localApi = new LocalApi(this.logService, this.projectService);

    this.logService.info(`Initializing elek.io Core ${this.coreVersion}`, {
      options: this.options,
    });

    Fs.mkdirpSync(Util.pathTo.projects);
    Fs.mkdirpSync(Util.pathTo.tmp);
    Fs.emptyDirSync(Util.pathTo.tmp);
  }

  /**
   * Exposes the logger
   */
  public get logger() {
    return this.logService;
  }

  /**
   * Utility / helper functions
   */
  public get util() {
    return Util;
  }

  /**
   * Exposes git functions
   */
  public get git(): GitService {
    return this.gitService;
  }

  /**
   * Getter and setter methods for the User currently working with Core
   */
  public get user(): UserService {
    return this.userService;
  }

  /**
   * CRUD methods to work with Projects
   */
  public get projects(): ProjectService {
    return this.projectService;
  }

  /**
   * CRUD methods to work with Assets
   */
  public get assets(): AssetService {
    return this.assetService;
  }

  /**
   * CRUD methods to work with Collections
   */
  public get collections(): CollectionService {
    return this.collectionService;
  }

  /**
   * CRUD methods to work with Entries
   */
  public get entries(): EntryService {
    return this.entryService;
  }

  /**
   * Allows starting and stopping a REST API
   * to allow developers to read local Project data
   */
  public get api(): LocalApi {
    return this.localApi;
  }
}
