import Fs from 'fs-extra';
import { Subject } from 'rxjs';
import Util from './util';
import Project from './model/Project';
import AssetService from './service/AssetService';
import EventService from './service/EventService';
import JsonFileService from './service/JsonFileService';
import ProjectService from './service/ProjectService';
import Asset from './model/Asset';
import LogService from './service/LogService';
import ElekIoCoreEvent from './model/ElekIoCoreEvent';

export default class ElekIoCore {
  private options: ElekIoCoreOptions;
  private logService = new LogService();
  private eventService = new EventService(this.logService);
  private jsonFileService = new JsonFileService(this.eventService);
  private assetService = new AssetService(this.eventService, this.jsonFileService);
  private projectService = new ProjectService(this.eventService, this.jsonFileService);

  constructor(options?: ElekIoCoreOptions) {
    const defaults = {};
    this.options = Object.assign({}, defaults, options);
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
      this.logService.global.log.info(`Initializing inside an "${process.env.NODE_ENV}" environment`);
    }
    await Promise.all([
      Fs.mkdirp(Util.pathTo.logs),
      Fs.mkdirp(Util.pathTo.projects),
      Fs.mkdirp(Util.pathTo.tmp)
    ]);
    await Fs.emptyDir(Util.pathTo.tmp);
  }

  public get events(): Subject<ElekIoCoreEvent> {
    return this.eventService.events;
  }

  public async projects(): Promise<Project[]> {
    const possibleProjectDirectories = await Util.subdirectories(Util.pathTo.projects);
    return await Util.returnResolved(possibleProjectDirectories.map((possibleProjectDirectory) => {
      return this.projectService.read(possibleProjectDirectory.name);
    }));
  }

  public get project(): ProjectService {
    return this.projectService;
  }

  public async assets(project: Project): Promise<Asset[]> {
    const possibleAssetFiles = await Util.files(Util.pathTo.assets(project.id));
    return await Util.returnResolved(possibleAssetFiles.map((possibleAssetFile) => {
      const fileNameArray = possibleAssetFile.name.split('.');
      return this.assetService.read(project, fileNameArray[0], fileNameArray[1]);
    }));
  }

  public get asset(): AssetService {
    return this.assetService;
  }
}