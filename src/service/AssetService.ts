import Fs from 'fs-extra';
import Path from 'path';
import AbstractModel from '../model/AbstractModel';
import Asset from '../model/Asset';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import JsonFileService from './JsonFileService';

export default class AssetService extends AbstractService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;

  constructor(eventService: EventService, jsonFileService: JsonFileService) {
    super('asset');

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
  }

  public async create(filePath: string, project: Project, language: string, name: string, description: string): Promise<Asset> {
    const id = Util.uuid();
    const path = Path.join(Util.pathTo.lfs(project.id), `${id}.${language}${Path.extname(filePath)}`);
    // const path = await this.copyFileToLfs(filePath, project, id);
    const asset = new Asset(id, language, name, description, path);
    await this.jsonFileService.create(asset, Util.pathTo.asset(project.id, asset.id, asset.language));
    this.eventService.emit(`${this.type}:create`, {
      project,
      data: {
        asset
      }
    });
    return asset;
  }

  /**
   * Finds and returns a asset by ID
   * 
   * @todo Is proper checking of the JSON we get from loaded file needed?
   * Or do we just assume that the data is correct?
   * 
   * @param project Project of the asset to read
   * @param id ID of the asset to read
   * @param language Language of the asset to read
   */
  public async read(project: Project, id: string, language: string): Promise<Asset> {
    const asset: Asset = await this.jsonFileService.read(Util.pathTo.asset(project.id, id, language));
    this.eventService.emit(`${this.type}:read`, {
      project,
      data: {
        asset
      }
    });
    return asset;
  }

  public async update(project: Project, asset: Asset): Promise<void> {
    await this.jsonFileService.update(asset, Util.pathTo.asset(project.id, asset.id, asset.language));
    this.eventService.emit(`${this.type}:update`, {
      project,
      data: {
        asset
      }
    });
  }

  public async delete(project: Project, asset: Asset): Promise<void> {
    await Fs.remove(Util.pathTo.lfs(project.id));
    await this.jsonFileService.delete(Util.pathTo.asset(project.id, asset.id, asset.language));
    this.eventService.emit(`${this.type}:delete`, {
      project,
      data: {
        asset
      }
    });
  }

  /**
   * Checks if given model is of type project
   * 
   * @param model The model to check
   */
  public static isProject(model: AbstractModel): boolean {
    return model.type === 'project';
  }

  /**
   * Copies given file to the projects LFS
   * and returns it's new relative path
   */
  private async copyFileToLfs(filePath: string, project: Project, asset: Asset) {
    const destination = Path.join(Util.pathTo.lfs(project.id), `${asset.id}${asset.language}${Path.extname(filePath)}`);
    const relativePath = Util.getRelativePath(destination);
    await Fs.copyFile(filePath, destination);
    this.eventService.emit(`${this.type}:copyFileToLfs`, {
      project,
      data: {
        filePath,
        destination,
        relativePath
      }
    });
    return relativePath;
  }
}