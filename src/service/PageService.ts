import { CoreEventName } from '../../type/coreEvent';
import { ElekIoCoreOptions } from '../../type/general';
import { ModelType } from '../../type/model';
import { ExtendedCrudService, PaginatedList, ServiceType, Sort } from '../../type/service';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError';
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
export default class PageService extends AbstractService implements ExtendedCrudService<Page> {
  private eventService: EventService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;

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
    const page = new Page(id, language, name, uriPath, layoutId, []);
    const pagePath = Util.pathTo.page(project.id, page.id, language);
    await this.jsonFileService.create(page, pagePath);
    await this.gitService.add(projectPath, [pagePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);
    this.eventService.emit(CoreEventName.PAGE_CREATE, {
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
    const page = new Page(json.id, json.language, json.name, json.uriPath, json.layoutId, json.content);
    this.eventService.emit(CoreEventName.PAGE_READ, {
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
  public async update(project: Project, page: Page, message = this.gitMessage.update): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const pagePath = Util.pathTo.page(project.id, page.id, page.language);
    await this.jsonFileService.update(page, pagePath);
    await this.gitService.add(projectPath, [pagePath]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.PAGE_UPDATE, {
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
  public async delete(project: Project, page: Page, message = this.gitMessage.delete): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const pagePath = Util.pathTo.page(project.id, page.id, page.language);
    await this.jsonFileService.delete(pagePath);
    await this.gitService.add(projectPath, [pagePath]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.PAGE_DELETE, {
      project,
      data: {
        page
      }
    });
  }

  public async list(project: Project, sort: Sort<Page>[] = [], filter = '', limit = 15, offset = 0): Promise<PaginatedList<Page>> {
    const modelReferences = await this.listReferences(ModelType.PAGE, project);
    const list = await Util.returnResolved(modelReferences.map((modelReference) => {
      if (!modelReference.language) { throw new RequiredParameterMissingError('language'); }
      return this.read(project, modelReference.id, modelReference.language);
    }));

    return this.paginate(list, sort, filter, limit, offset);
  }

  public async count(project: Project): Promise<number> {
    return (await this.listReferences(ModelType.PAGE, project)).length;
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