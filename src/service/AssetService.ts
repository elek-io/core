import Fs from 'fs-extra';
import FileType from 'file-type';
import IsSvg from 'is-svg';
import { CoreEventName } from '../../type/coreEvent';
import { ElekIoCoreOptions } from '../../type/general';
import { ModelType } from '../../type/model';
import { ExtendedCrudService, PaginatedList, ServiceType, Sort } from '../../type/service';
import AbstractModel from '../model/AbstractModel';
import AssetFile from '../model/AssetFile';
import Project from '../model/Project';
import Util from '../util';
import EventService from './EventService';
import GitService from './GitService';
import JsonFileService from './JsonFileService';
import { SupportedExtension, supportedExtensions, SupportedMimeType, supportedMimeTypes } from '../../type/asset';
import Asset from '../model/Asset';
import FileTypeNotSupportedError from '../error/FileTypeNotSupportedError';
import AbstractService from './AbstractService';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError';

/**
 * Service that manages CRUD functionality for asset files on disk
 */
export default class AssetService extends AbstractService implements ExtendedCrudService<Asset> {
  private readonly eventService: EventService;
  private readonly jsonFileService: JsonFileService;
  private readonly gitService: GitService;

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
    const fileType = await this.getSupportedFileTypeOrThrow(filePath);
    const assetFile = new AssetFile(id, language, name, description, fileType.extension, fileType.mimeType);
    const lfsFilePath = Util.pathTo.lfsFile(project.id, assetFile.id, assetFile.language, assetFile.extension);
    const assetFilePath = Util.pathTo.asset(project.id, assetFile.id, assetFile.language);
    await Fs.copyFile(filePath, lfsFilePath);
    await this.jsonFileService.create(assetFile, assetFilePath);
    await this.gitService.add(projectPath, [assetFilePath, lfsFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);
    const lfsFileSize = (await Fs.stat(lfsFilePath)).size;
    const created = await this.gitService.getFileCreatedTimestamp(projectPath, assetFilePath);
    const modified = await this.gitService.getFileLastModifiedTimestamp(projectPath, assetFilePath);
    const asset = new Asset(assetFile, created, modified, lfsFilePath, lfsFileSize);
    this.eventService.emit(CoreEventName.ASSET_CREATE, {
      project,
      data: {
        asset: asset
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
    const projectPath = Util.pathTo.project(project.id);
    const assetFilePath = Util.pathTo.asset(project.id, id, language);
    const json = await this.jsonFileService.read<AssetFile>(assetFilePath);
    const assetFile = new AssetFile(json.id, json.language, json.name, json.description, json.extension, json.mimeType);
    const lfsFilePath = Util.pathTo.lfsFile(project.id, assetFile.id, assetFile.language, assetFile.extension);
    const lfsFileSize = (await Fs.stat(lfsFilePath)).size;
    const created = await this.gitService.getFileCreatedTimestamp(projectPath, assetFilePath);
    const modified = await this.gitService.getFileLastModifiedTimestamp(projectPath, assetFilePath);
    const asset = new Asset(assetFile, created, modified, lfsFilePath, lfsFileSize);
    this.eventService.emit(CoreEventName.ASSET_READ, {
      project,
      data: {
        asset: asset
      }
    });
    return asset;
  }

  /**
   * Updates the asset's information on disk and creates a commit
   * 
   * Please note that the asset inself (e.g. an image or zip file)
   * cannot be updated and needs to be recreated.
   * The update only affects the meta information like name and description.
   * 
   * @param project Project of the asset to update
   * @param asset Asset to write to disk
   * @param message Optional overwrite for the git message
   */
  public async update(project: Project, asset: Asset, message = this.gitMessage.update): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const assetFile = new AssetFile(asset.id, asset.language, asset.name, asset.description, asset.extension, asset.mimeType);
    const assetFilePath = Util.pathTo.asset(project.id, asset.id, asset.language);
    await this.jsonFileService.update(assetFile, assetFilePath);
    await this.gitService.add(projectPath, [assetFilePath]);
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
    const assetFilePath = Util.pathTo.asset(project.id, asset.id, asset.language);
    const lfsFilePath = Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension);
    await Fs.remove(lfsFilePath);
    await this.jsonFileService.delete(assetFilePath);
    await this.gitService.add(projectPath, [assetFilePath, lfsFilePath]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.ASSET_DELETE, {
      project,
      data: {
        asset
      }
    });
  }

  public async list(project: Project, sort: Sort<Asset>[] = [], filter = '', limit = 15, offset = 0): Promise<PaginatedList<Asset>> {
    const modelReferences = await this.listReferences(ModelType.ASSET, project);
    const list = await Util.returnResolved(modelReferences.map((modelReference) => {
      if (!modelReference.language) { throw new RequiredParameterMissingError('language'); }
      return this.read(project, modelReference.id, modelReference.language);
    }));

    return this.paginate(list, sort, filter, limit, offset);
  }

  public async count(project: Project): Promise<number> {
    return (await this.listReferences(ModelType.ASSET, project)).length;
  }

  /**
   * Checks if given model is of type asset
   * 
   * @param model The model to check
   */
  public isAsset(model: AbstractModel): boolean {
    return model.type === ModelType.ASSET;
  }

  /**
   * Returns the found and supported extension as well as mime type,
   * otherwise throws an error
   * 
   * @param filePath Path to the file to check
   */
  private async getSupportedFileTypeOrThrow(filePath: string) {
    const fileSize = (await Fs.stat(filePath)).size;

    // Only try to parse potential SVG's
    // that are smaller than 500 kB
    if (fileSize / 1000 <= 500) {
      const fileBuffer = await Fs.readFile(filePath);

      if (IsSvg(fileBuffer) === true) {
        return {
          extension: 'svg' as SupportedExtension,
          mimeType: 'image/svg+xml' as SupportedMimeType
        };
      } 
    }

    // We do not use fileBuffer here again because fromFile() is recommended
    const fileType = await FileType.fromFile(filePath);

    if (!fileType) {
      throw new Error(`Could not retrieve the type of file "${filePath}"`);
    }

    if (supportedExtensions.includes(fileType.ext as SupportedExtension) === false) {
      throw new FileTypeNotSupportedError(`The extension "${fileType.ext}" is not supported`);
    }

    if (supportedMimeTypes.includes(fileType.mime as SupportedMimeType) === false) {
      throw new FileTypeNotSupportedError(`The MIME type "${fileType.mime}" is not supported`);
    }

    return {
      extension: fileType.ext as SupportedExtension,
      mimeType: fileType.mime as SupportedMimeType
    };
  }
}