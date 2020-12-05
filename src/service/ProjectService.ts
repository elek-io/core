import Fs from 'fs-extra';
import AbstractModel from '../model/AbstractModel';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import JsonFileService from './JsonFileService';

/**
 * Handles 
 */
export default class ProjectService extends AbstractService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;

  constructor(eventService: EventService, jsonFileService: JsonFileService) {
    super('project');

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
  }

  /**
   * Creates a new project on disk
   * 
   * @param name Name of the project
   * @param description Description of the project
   */
  public async create(name: string, description: string): Promise<Project> {
    const project = new Project(Util.uuid(), name, description);
    await Util.git.init(Util.pathTo.project(project.id));
    await this.jsonFileService.create(project, Util.pathTo.projectConfig(project.id));
    this.eventService.emit(`${this.type}:create`, {
      project
    });
    return project;
  }

  /**
   * Finds and returns a project by ID
   * 
   * @todo Is proper checking of the JSON we get from loaded file needed?
   * Or do we just assume that the data is correct?
   * 
   * @param id ID of the project to read
   */
  public async read(id: string): Promise<Project> {
    const project: Project = await this.jsonFileService.read(Util.pathTo.projectConfig(id));
    this.eventService.emit(`${this.type}:read`, {
      project
    });
    return project;
  }

  /**
   * Updates given project config
   * 
   * @param project Project to update
   */
  public async update(project: Project): Promise<void> {
    await this.jsonFileService.update(project, Util.pathTo.projectConfig(project.id));
    this.eventService.emit(`${this.type}:update`, {
      project
    });
  }

  /**
   * Removes given project from disk.
   * Removes the whole project folder, not only the config 
   * 
   * @param project Project to remove
   */
  public async delete(project: Project): Promise<void> {
    await Fs.remove(Util.pathTo.project(project.id));
    this.eventService.emit(`${this.type}:delete`, {
      project
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
}