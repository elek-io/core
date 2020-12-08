import Fs from 'fs-extra';
import Util from './util';
import Project from './model/Project';
import AssetService from './service/AssetService';
import EventService from './service/EventService';
import JsonFileService from './service/JsonFileService';
import ProjectService from './service/ProjectService';
import Asset from './model/Asset';
import LogService from './service/LogService';

export default class ElekIoCore {
  private readonly options: ElekIoCoreOptions;
  private readonly logService: LogService;
  private readonly eventService: EventService;
  private readonly jsonFileService: JsonFileService;
  private readonly assetService: AssetService;
  private readonly projectService: ProjectService;

  constructor(options: ElekIoCoreOptions) {
    const defaults = {};
    this.options = Object.assign({}, defaults, options);

    this.logService = new LogService(this.options);
    this.eventService = new EventService(this.options, this.logService);
    this.jsonFileService = new JsonFileService(this.options, this.eventService);
    this.assetService = new AssetService(this.options, this.eventService, this.jsonFileService);
    this.projectService = new ProjectService(this.options, this.eventService, this.jsonFileService);
  }

  /**
   * Initializes elek.io core by assuring the basic requirements are met.
   * 
   * Checks if the "NODE_ENV" variable is available, 
   * assures the directory structure is there
   * and empties the tmp directory.
   */
  public async init(): Promise<void> {
    if (!process.env.NODE_ENV) {
      throw new Error('Environment variable "NODE_ENV" is not set');
    }
    if (process.env.NODE_ENV !== 'production') {
      this.logService.generic.log.info(`Initializing inside an "${process.env.NODE_ENV}" environment`);
    }
    await Promise.all([
      Fs.mkdirp(Util.pathTo.logs),
      Fs.mkdirp(Util.pathTo.projects),
      Fs.mkdirp(Util.pathTo.tmp)
    ]);
    await Fs.emptyDir(Util.pathTo.tmp);
  }

  /**
   * Endpoint to subscribe to internal events and react to accordingly
   * 
   * @todo figure out if we really want outside code be able to call emit()
   */
  public get event() {
    return {
      on: this.eventService.on,
      emit: this.eventService.emit
    };
  }

  /**
   * Searches for projects on disk, loads and returns them
   */
  public async projects(): Promise<Project[]> {
    const possibleProjectDirectories = await Util.subdirectories(Util.pathTo.projects);
    return await Util.returnResolved(possibleProjectDirectories.map((possibleProjectDirectory) => {
      return this.projectService.read(possibleProjectDirectory.name);
    }));
  }

  /**
   * CRUD methods to work with projects
   */
  public get project(): ProjectService {
    return this.projectService;
  }

  /**
   * Searches for assets of given project on disk, loads and returns them
   */
  public async assets(project: Project): Promise<Asset[]> {
    const possibleAssetFiles = await Util.files(Util.pathTo.assets(project.id));
    return await Util.returnResolved(possibleAssetFiles.map((possibleAssetFile) => {
      const fileNameArray = possibleAssetFile.name.split('.');
      return this.assetService.read(project, fileNameArray[0], fileNameArray[1]);
    }));
  }

  /**
   * CRUD methods to work with assets
   */
  public get asset(): AssetService {
    return this.assetService;
  }
}
