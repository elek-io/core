import Fs from 'fs-extra';
import AssetService from './service/AssetService.js';
import CollectionService from './service/CollectionService.js';
import EntryService from './service/EntryService.js';
import GitService from './service/GitService.js';
import JsonFileService from './service/JsonFileService.js';
import ProjectService from './service/ProjectService.js';
// import SharedValueService from './service/SharedValueService.js';
import {
  constructorElekIoCoreSchema,
  type ConstructorElekIoCoreProps,
  type ElekIoCoreOptions,
} from './schema/coreSchema.js';
import UserService from './service/UserService.js';
import * as Util from './util/index.js';

/**
 * elek.io Core
 *
 * Provides access to all services Core is offering
 */
export default class ElekIoCore {
  private readonly options: ElekIoCoreOptions;
  private readonly userService: UserService;
  private readonly gitService: GitService;
  private readonly jsonFileService: JsonFileService;
  private readonly assetService: AssetService;
  private readonly projectService: ProjectService;
  private readonly collectionService: CollectionService;
  private readonly entryService: EntryService;
  // private readonly sharedValueService: SharedValueService;

  constructor(props?: ConstructorElekIoCoreProps) {
    const parsedProps = constructorElekIoCoreSchema.parse(props);

    const defaults: ElekIoCoreOptions = {
      environment: 'production',
      version: '0.0.0',
      file: {
        json: {
          indentation: 2,
        },
      },
    };
    this.options = Object.assign({}, defaults, parsedProps);

    this.jsonFileService = new JsonFileService(this.options);
    this.userService = new UserService(this.jsonFileService);
    this.gitService = new GitService(this.options, this.userService);
    // this.gitService.getVersion(); // @todo currently throws an "Error: Unable to find path to repository on disk."
    this.assetService = new AssetService(
      this.options,
      this.jsonFileService,
      this.gitService
    );
    this.collectionService = new CollectionService(
      this.options,
      this.jsonFileService,
      this.gitService
    );
    // this.sharedValueService = new SharedValueService(
    //   this.options,
    //   this.jsonFileService,
    //   this.gitService,
    //   this.assetService
    // );
    this.entryService = new EntryService(
      this.options,
      this.jsonFileService,
      this.gitService,
      this.collectionService,
      this.assetService
      // this.sharedValueService
    );
    this.projectService = new ProjectService(
      this.options,
      this.jsonFileService,
      this.userService,
      this.gitService,
      this.assetService,
      this.collectionService,
      this.entryService
    );

    if (this.options.environment !== 'production') {
      console.info(
        `Initializing inside an "${this.options.environment}" environment`,
        {
          ...this.options,
        }
      );
    }

    Fs.mkdirpSync(Util.pathTo.projects);
    Fs.mkdirpSync(Util.pathTo.tmp);
    Fs.emptyDirSync(Util.pathTo.tmp);
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
   * CRUD methods to work with Values
   */
  // public get sharedValues(): SharedValueService {
  //   return this.sharedValueService;
  // }
}
