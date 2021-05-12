import Path from 'path';
import Fs from 'fs-extra';
import AbstractModel from '../model/AbstractModel';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import JsonFileService from './JsonFileService';
import BlockService from './BlockService';
import { ElekIoCoreOptions } from '../../type/general';
import PageService from './PageService';
import GitService from './GitService';
import ThemeService from './ThemeService';
import { PageStatus } from '../../type/page';
import { CrudService, ServiceType } from '../../type/service';
import { ModelType } from '../../type/model';
import { CoreEventName } from '../../type/coreEvent';

/**
 * Service that manages CRUD functionality for project files on disk
 */
export default class ProjectService extends AbstractService implements CrudService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;
  private blockService: BlockService;
  private pageService: PageService;
  private themeService: ThemeService;

  /**
   * Creates a new instance of the ProjectService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param jsonFileService JsonFileService
   * @param gitService GitService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService, gitService: GitService, blockService: BlockService, pageService: PageService, themeService: ThemeService) {
    super(ServiceType.PROJECT, options);

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
    this.blockService = blockService;
    this.pageService = pageService;
    this.themeService = themeService;
  }

  /**
   * Creates a new project on disk
   * 
   * @todo Refactor to use default theme layout
   * 
   * @param name Name of the project
   * @param description Description of the project
   */
  public async create(name: string, description: string): Promise<Project> {
    const project = new Project(Util.uuid(), name, description);
    const projectPath = Util.pathTo.project(project.id);

    await Fs.ensureDir(projectPath);
    await this.gitService.init(projectPath, { initialBranch: 'main' });
    await this.createFolderStructure(project.id);
    await this.createGitignore(project.id);
    await this.jsonFileService.create(project, Util.pathTo.projectConfig(project.id));
    await this.gitService.add(projectPath, ['.']);
    // We don't use this.gitMessage.create here on purpose
    await this.gitService.commit(projectPath, ':tada: Created this new elek.io project');
    await this.gitService.switch(projectPath, 'stage', { isNew: true });
    const theme = await this.themeService.use(project, 'https://github.com/elek-io/starter-theme.git');
    const block = await this.blockService.create(project, 'en-US', 'We are very happy to have you on board. This page was created for you.\nYou can use it as a starting point or delete it. If you need help, consider visiting one of these pages:\n\n- [An introduction to the elek.io client](https://elek.io)\n- [Working with pages](https://elek.io)\n- [Choosing a theme](https://elek.io)\n- [Deploying your first project](https://elek.io)');
    const page = await this.pageService.create(project, 'en-US', 'Welcome to elek.io!', '/', theme.layouts[1].id);
    page.status = PageStatus.PUBLISHED;
    page.layoutId = 'homepage';
    page.content.push({
      positionId: 'welcome-message',
      blockId: block.id
    });
    await this.pageService.update(project, page);

    this.eventService.emit(CoreEventName.PROJECT_CREATE, {
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
    const json = await this.jsonFileService.read<Project>(Util.pathTo.projectConfig(id));
    const project = new Project(json.id, json.name, json.description);
    this.eventService.emit(CoreEventName.PROJECT_READ, {
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
  public async update(project: Project, message = this.gitMessage.update): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const configPath = Util.pathTo.projectConfig(project.id);
    await this.jsonFileService.update(project, configPath);
    await this.gitService.add(projectPath, [configPath]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.PROJECT_UPDATE, {
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
    this.eventService.emit(CoreEventName.PROJECT_DELETE, {
      project
    });
  }

  /**
   * Checks if given model is of type project
   * 
   * @param model The model to check
   */
  public isProject(model: AbstractModel): boolean {
    return model.type === ModelType.PROJECT;
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
   * 
   * @todo We probably need to add some files like thumbnails
   * for windows systems to that
   */
  private async createGitignore(id: string): Promise<void> {
    const content = '.DS_Store\ntheme/\npublic/\nlogs/\n\n# Keep directories with .gitkeep files in them\n# even if the directory itself is ignored\n!/**/.gitkeep';
    await Fs.writeFile(Path.join(Util.pathTo.project(id), '.gitignore'), content);
  }
}