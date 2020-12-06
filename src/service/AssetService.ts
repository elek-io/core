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

  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService) {
    super('asset', options);

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
  }

  public async create(filePath: string, project: Project, language: string, name: string, description: string): Promise<Asset> {
    const id = Util.uuid();
    const destination = Path.join(Util.pathTo.lfs(project.id), `${id}.${language}${Path.extname(filePath)}`);
    const relativePath = Util.getRelativePath(destination);
    const asset = new Asset(id, language, name, description, relativePath);
    await Fs.copyFile(filePath, destination);
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
   * Finds and returns an asset by ID
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
    await Fs.remove(Path.join(Util.workingDirectory, asset.path));
    await this.jsonFileService.delete(Util.pathTo.asset(project.id, asset.id, asset.language));
    this.eventService.emit(`${this.type}:delete`, {
      project,
      data: {
        asset
      }
    });
  }

  /**
   * Checks if given model is of type asset
   * 
   * @param model The model to check
   */
  public isAsset(model: AbstractModel): boolean {
    return model.type === 'asset';
  }
}