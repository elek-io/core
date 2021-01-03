import { ElekIoCoreOptions } from '../../type/general';
import { ModelType } from '../../type/model';
import { CrudService, ServiceType } from '../../type/service';
import AbstractModel from '../model/AbstractModel';
import Page from '../model/Page';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import GitService from './GitService';
import JsonFileService from './JsonFileService';

/**
 * Service that manages CRUD functionality for page files on disk
 */
export default class PageService extends AbstractService implements CrudService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  /**
   * Creates a new instance of the PageService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param jsonFileService JsonFileService
   * @param gitService GitService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService, gitService: GitService) {
    super(ServiceType.PAGE, options);

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new page on disk and commits it
   * 
   * @param project Project to add the page to
   * @param language Language of the new page
   * @param name Name of the new page
   */
  public async create(project: Project, language: string, name: string, uriPath: string, layoutId: string): Promise<Page> {
    const id = Util.uuid();
    const projectPath = Util.pathTo.project(project.id);
    const page = new Page(id, language, name, uriPath, layoutId);
    const pagePath = Util.pathTo.page(project.id, page.id, language);
    await this.jsonFileService.create(page, pagePath);
    await this.gitService.add(projectPath, [pagePath]);
    await this.gitService.commit(projectPath, `:heavy_plus_sign: Created new ${this.type}`);
    this.eventService.emit(`${this.type}:create`, {
      project,
      data: {
        page
      }
    });
    return page;
  }

  /**
   * Finds and returns a page on disk by ID
   * 
   * @param project Project of the page to read
   * @param id ID of the page to read
   * @param language Language of the page to read
   */
  public async read(project: Project, id: string, language: string): Promise<Page> {
    const json = await this.jsonFileService.read<Page>(Util.pathTo.page(project.id, id, language));
    const page = new Page(json.id, json.language, json.name, json.uriPath, json.layoutId);
    this.eventService.emit(`${this.type}:read`, {
      project,
      data: {
        page
      }
    });
    return page;
  }

  /**
   * Updates the page file on disk and creates a commit
   * 
   * @param project Project of the page to update
   * @param page Page to write to disk
   * @param message Optional overwrite for the git message
   */
  public async update(project: Project, page: Page, message = `Updated ${this.type}`): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const pagePath = Util.pathTo.page(project.id, page.id, page.language);
    await this.jsonFileService.update(page, pagePath);
    await this.gitService.add(projectPath, [pagePath]);
    await this.gitService.commit(projectPath, `:wrench: ${message}`);
    this.eventService.emit(`${this.type}:update`, {
      project,
      data: {
        page
      }
    });
  }

  /**
   * Deletes the page file from disk and creates a commit
   * 
   * @param project Project of the page to delete
   * @param page Page to delete from disk
   * @param message Optional overwrite for the git message
   */
  public async delete(project: Project, page: Page, message = `Deleted ${this.type}`): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const pagePath = Util.pathTo.page(project.id, page.id, page.language);
    await this.jsonFileService.delete(pagePath);
    await this.gitService.add(projectPath, [pagePath]);
    await this.gitService.commit(projectPath, `:fire: ${message}`);
    this.eventService.emit(`${this.type}:delete`, {
      project,
      data: {
        page
      }
    });
  }

  /**
   * Checks if given model is of type page
   * 
   * @param model The model to check
   */
  public isPage(model: AbstractModel): boolean {
    return model.type === ModelType.PAGE;
  }
}