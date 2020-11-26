import { Subject } from 'rxjs';
import Util from './util';
import Project from './model/Project';
import AssetService from './service/AssetService';
import EventService from './service/EventService';
import JsonFileService from './service/JsonFileService';
import ProjectService from './service/ProjectService';
import Asset from './model/Asset';

export default class ElekIoCore {
  private eventService = new EventService();
  private jsonFileService = new JsonFileService(this.eventService);
  private assetService = new AssetService(this.eventService, this.jsonFileService);
  private projectService = new ProjectService(this.eventService, this.jsonFileService);

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