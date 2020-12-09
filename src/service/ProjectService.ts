import Path from 'path';
import Fs from 'fs-extra';
import AbstractModel from '../model/AbstractModel';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import JsonFileService from './JsonFileService';
import { ElekIoCoreOptions } from '../../type/general';

/**
 * Service that manages CRUD functionality for project files on disk
 */
export default class ProjectService extends AbstractService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;

  /**
   * Creates a new instance of the ProjectService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param jsonFileService JsonFileService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService) {
    super('project', options);

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
    await this.createFolderStructure(project.id);
    await this.createGitignore(project.id);
    await this.jsonFileService.create(project, Util.pathTo.projectConfig(project.id));
    await Util.git.commit(Util.pathTo.project(project.id), this.options.signature, '*', ':tada: Created this new elek.io project');
    await Util.git.checkout(Util.pathTo.project(project.id), 'stage', true);

    this.eventService.emit(`${this.type}:create`, {
      project
    });
    return project;
  }

  /**
   * Finds and returns a project by ID
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
   * Updates given project
   * 
   * @param project Project to update
   * @param message Optional overwrite for the git message
   */
  public async update(project: Project, message = `Updated ${this.type}`): Promise<void> {
    await this.jsonFileService.update(project, Util.pathTo.projectConfig(project.id));
    await Util.git.commit(Util.pathTo.project(project.id), this.options.signature, Util.pathTo.projectConfig(project.id), `:wrench: ${message}`);
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
  public isProject(model: AbstractModel): boolean {
    return model.type === 'project';
  }

  /**
   * Creates the projects folder structure and makes sure to 
   * write empty .gitkeep files inside them to ensure they are 
   * committed
   */
  private async createFolderStructure(id: string): Promise<void> {
    const folders = [
      'theme',
      'assets',
      'pages',
      'blocks',
      'public',
      'logs',
      'lfs'
    ];

    await Promise.all(folders.map(async (folder) => {
      await Fs.mkdirp(Path.join(Util.pathTo.project(id), folder));
      await Fs.writeFile(Path.join(Util.pathTo.project(id), folder, '.gitkeep'), '');
    }));
  }

  /**
   * Writes the projects main .gitignore file to disk
   */
  private async createGitignore(id: string): Promise<void> {
    const content = `.DS_Store
theme/
public/
logs/
lfs/

# Keep directories with .gitkeep files in them
# even if the directory itself is ignored
!/**/.gitkeep`;
    await Fs.writeFile(Path.join(Util.pathTo.project(id), '.gitignore'), content);
  }
}