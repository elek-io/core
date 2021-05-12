import Fs from 'fs-extra';
import Path from 'path';
import { CoreEventName } from '../../type/coreEvent';
import { ElekIoCoreOptions } from '../../type/general';
import { ModelType } from '../../type/model';
import { CrudService, ServiceType } from '../../type/service';
import AbstractModel from '../model/AbstractModel';
import Asset from '../model/Asset';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import GitService from './GitService';
import JsonFileService from './JsonFileService';

/**
 * Service that manages CRUD functionality for asset files on disk
 */
export default class AssetService extends AbstractService implements CrudService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  /**
   * Creates a new instance of the AssetService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param jsonFileService JsonFileService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService, gitService: GitService) {
    super(ServiceType.ASSET, options);

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new asset on disk, copies the assets file to the projects lfs folder
   * and creates a new commit
   * 
   * @param filePath Path of the file to add as a new asset
   * @param project Project to add the asset to
   * @param language Language of the new asset
   * @param name Name of the new asset
   * @param description Description of the new asset
   */
  public async create(filePath: string, project: Project, language: string, name: string, description: string): Promise<Asset> {
    const id = Util.uuid();
    const projectPath = Util.pathTo.project(project.id);
    const extension = Path.extname(filePath).split('.').join('');
    const destination = Path.join(Util.pathTo.lfs(project.id), `${id}.${language}.${extension}`);
    const asset = new Asset(id, language, name, description, extension);
    const assetPath = Util.pathTo.asset(project.id, asset.id, asset.language);
    await Fs.copyFile(filePath, destination);
    await this.jsonFileService.create(asset, assetPath);
    await this.gitService.add(projectPath, [assetPath]);
    await this.gitService.add(projectPath, [Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension)]);
    await this.gitService.commit(projectPath, this.gitMessage.create);
    this.eventService.emit(CoreEventName.ASSET_CREATE, {
      project,
      data: {
        asset
      }
    });
    return asset;
  }

  /**
   * Finds and returns an asset on disk by ID
   * 
   * @param project Project of the asset to read
   * @param id ID of the asset to read
   * @param language Language of the asset to read
   */
  public async read(project: Project, id: string, language: string): Promise<Asset> {
    const json = await this.jsonFileService.read<Asset>(Util.pathTo.asset(project.id, id, language));
    const asset = new Asset(json.id, json.language, json.name, json.description, json.extension);
    this.eventService.emit(CoreEventName.ASSET_READ, {
      project,
      data: {
        asset
      }
    });
    return asset;
  }

  /**
   * Updates the asset's files on disk and creates a commit
   * 
   * @param project Project of the asset to update
   * @param asset Asset to write to disk
   * @param message Optional overwrite for the git message
   */
  public async update(project: Project, asset: Asset, message = this.gitMessage.update): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const assetJsonPath = Util.pathTo.asset(project.id, asset.id, asset.language);
    await this.jsonFileService.update(asset, assetJsonPath);
    await this.gitService.add(projectPath, [assetJsonPath]);
    await this.gitService.add(projectPath, [Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension)]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.ASSET_UPDATE, {
      project,
      data: {
        asset
      }
    });
  }

  /**
   * Deletes the asset's files from disk and creates a commit
   * 
   * @param project Project of the asset to delete
   * @param asset Asset to delete from disk
   * @param message Optional overwrite for the git message
   */
  public async delete(project: Project, asset: Asset, message = this.gitMessage.delete): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const assetJsonPath = Util.pathTo.asset(project.id, asset.id, asset.language);
    await Fs.remove(Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension));
    await this.jsonFileService.delete(assetJsonPath);
    await this.gitService.add(projectPath, [assetJsonPath]);
    await this.gitService.add(projectPath, [Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension)]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.ASSET_DELETE, {
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
    return model.type === ModelType.ASSET;
  }
}