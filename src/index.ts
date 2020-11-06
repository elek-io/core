import Fs from 'fs-extra';
import Util from './util';
import Project from './project';
import GlobalLogger from './logger/globalLogger';
import { GitSignature } from './util/git';

export interface ElekIoCoreOptions {
  foo: string;
}

/**
 * elek.io core class
 * 
 * Provides access to the global logger, utilities and projects.
 * 
 * @todo Add "element" as new ProjectItem. Like a "block" but for a specific single element,
 * which meta information can be accessed individually. E.g. an image with path and alt.
 */
export default class ElekIoCore {
  /**
   * The global logger for everything not project related
   */
  public logger: GlobalLogger;
  /**
   * Utility functions
   */
  public util = Util;

  private _isInitialized = false;
  private _projects: Project[] = [];

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public get projects(): Project[] {
    return this._projects;
  }

  constructor(options?: Partial<ElekIoCoreOptions>) {
    this.logger = new GlobalLogger();
  }

  /**
   * Initializes elek.io core by assuring the basic requirements are met.
   * 
   * Checks if the "NODE_ENV" variable is available, 
   * assures the directory structure is there,
   * empties the tmp directory and loads all projects.
   */
  public async init(): Promise<void> {
    if (!process.env.NODE_ENV) {
      throw new Error('Environment variable "NODE_ENV" is not set');
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log.info(`Initializing inside an "${process.env.NODE_ENV}" environment`);
    }

    // Make sure the basic file structure is given
    await Promise.all([
      Fs.mkdirp(Util.pathTo.logs),
      Fs.mkdirp(Util.pathTo.projects),
      Fs.mkdirp(Util.pathTo.tmp)
    ]);

    // Empty the tmp directory
    await Fs.emptyDir(Util.pathTo.tmp);

    // Load all projects
    this._projects = await this.loadProjects();

    // Finished initializing
    this._isInitialized = true;
  }

  /**
   * Helper methods for working with projects
   */
  public project = {
    create: async (name: string, signature: GitSignature): Promise<Project> => {
      return await new Project().create(name, signature);
    }
  };

  /**
   * Downloads all remote projects that do not exist on disk yet
   * and then reloads all local ones, which refreshes the "projects" array
   */
  public async reloadProjects(): Promise<void> {
    if (this._isInitialized === false) {
      throw new Error('Tried reloading projects without running init() beforehand');
    }

    this._projects = await this.loadProjects();
  }

  /**
   * Returns a list of all projects
   */
  private async loadProjects(): Promise<Project[]> {
    await this.downloadRemoteProjects();
    return await this.loadLocalProjects();
  }

  /**
   * Loads all local projects and returns them
   */
  private async loadLocalProjects(): Promise<Project[]> {
    // Get all subdirectories from the projects folder
    const possibleProjectDirectories = await Util.subdirectories(Util.pathTo.projects);
    // Load all projects we are able to resolve without throwing errors
    // which can happen for example if the user created an empty directory 
    // inside the "projects" directory
    return await Util.returnResolved(possibleProjectDirectories.map((possibleProjectDirectory) => {
      return new Project().load(possibleProjectDirectory.name);
    }));
  }

  /**
   * Requests all project IDs from elek.io cloud,
   * checks if the local project exists and if not,
   * downloads it.
   * 
   * @todo implement once elek.io cloud exists
   */
  private async downloadRemoteProjects(): Promise<void> {
    //
  }
}