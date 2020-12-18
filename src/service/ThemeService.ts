import Fs from 'fs-extra';
import Path from 'path';
import { ElekIoCoreOptions } from '../../type/general';
import Project from '../model/Project';
import Theme from '../model/Theme';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import GitService from './GitService';
import JsonFileService from './JsonFileService';

/**
 * Service that manages CRUD functionality for the theme in use
 */
export default class ThemeService extends AbstractService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  /**
   * Creates a new instance of the ThemeService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param jsonFileService JsonFileService
   * @param gitService GitService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService, gitService: GitService) {
    super('theme', options);

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Changes the theme in use by downloading
   * a new one from a remote repository
   * 
   * @param project Project to add the block to
   * @param repository URL to the repository to clone
   */
  public async use(project: Project, repository: string): Promise<Theme> {
    await this.delete(project);
    await this.gitService.clone(repository, Util.pathTo.theme(project.id));
    const theme = await this.read(project);
    this.eventService.emit(`${this.type}:use`, {
      project,
      data: {
        theme
      }
    });
    return theme;
  }

  /**
   * Returns the currently used theme of given project
   * 
   * @param project Project of the theme to read
   */
  public async read(project: Project): Promise<Theme> {
    const theme: Theme = await this.jsonFileService.read(Util.pathTo.themeConfig(project.id));
    this.eventService.emit(`${this.type}:read`, {
      project,
      data: {
        theme
      }
    });
    return theme;
  }

  /**
   * Updates the current theme on disk by pulling
   * the latest changes from the remote repository
   * 
   * @param project Project of the theme to update
   */
  public async update(project: Project): Promise<Theme> {
    await this.gitService.pull(Util.pathTo.theme(project.id));
    const theme = await this.read(project);
    this.eventService.emit(`${this.type}:update`, {
      project,
      data: {
        theme
      }
    });
    return theme;
  }

  /**
   * Deletes the current theme from disk
   * 
   * @param project Project of the theme to delete
   */
  public async delete(project: Project): Promise<void> {
    await Fs.emptyDir(Util.pathTo.theme(project.id));
    await Fs.writeFile(Path.join(Util.pathTo.theme(project.id), '.gitkeep'), '');
    this.eventService.emit(`${this.type}:delete`, {
      project
    });
  }
}