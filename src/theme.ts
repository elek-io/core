import Path from 'path';
import * as Util from './util';
import { Repository } from 'nodegit';
import Project from './project';

export class ThemeConfig {
  public name = '';
  public description = '';
  public version = '1.0.0';
  public homepage = '';
  public repository = '';
  public author = '';
  public license = '';
}

export default class Theme {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _project!: Project;
  private _path!: string;
  private _config!: ThemeConfig;
  private _localRepository!: Repository;

  public get project(): Project {
    return this._project;
  }
  
  public get path(): string {
    return this._path;
  }

  public get config(): ThemeConfig {
    return this._config;
  }

  public get localRepository(): Repository {
    return this._localRepository;
  }

  constructor(project: Project) {
    this._project = project;
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'theme');
  }

  /**
   * Changes the theme by cloning it's repository
   */
  public async use(repository: string): Promise<Theme> {
    await this.delete();
    // Unfortunately there is no shallow clone integration
    // in nodegit and the underlying libgit2 yet.
    // See: https://github.com/libgit2/libgit2/issues/3058
    // Otherwise we could just clone the current version
    // without the history overhead
    this._localRepository = await Util.git.clone(repository, this.path);
    this._config = await Util.read.theme(this.project.id);
    return this;
  }

  /**
   * Loads the current theme
   */
  public async load(): Promise<Theme> {
    this._localRepository = await Util.git.open(this.path);
    this._config = await Util.read.theme(this.project.id);
    return this;
  }

  /**
   * Updates the theme by pulling from it's repository
   */
  public async update(): Promise<void> {
    await Util.git.pull(this._localRepository);
  }

  /**
   * Deletes this theme from disk
   */
  private async delete(): Promise<void> {
    await Util.rmrf(this.path);
    await Util.mkdir(this.path);
  }
}