import Fs from 'fs';
import Path from 'path';
import * as Util from './util';
import { Repository } from 'nodegit';

export interface ThemeConfig {
  name: string;
  description: string;
  url: string;
  version: string;
  status: string;
}

export default class Theme {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _projectId!: string;
  private _name!: string;
  private _path!: string;
  private _url!: string;
  private _config!: ThemeConfig;
  private _repository!: Repository;

  public get projectId(): string {
    return this._projectId;
  }
  
  public get name(): string {
    return this._name;
  }

  public get path(): string {
    return this._path;
  }

  public get url(): string {
    return this._url;
  }

  public get config(): ThemeConfig {
    // Private property acts like a cache
    if (this._config) {
      return this._config;
    }

    const file = Fs.readFileSync(Path.join(this._path, Util.configNameOf.theme));
    this._config = JSON.parse(file.toString());
    return this._config;
  }

  public get repository(): Repository {
    return this._repository;
  }

  constructor(projectId: string) {
    this._projectId = projectId;
    this._path = Path.join(Util.pathTo.projects, projectId, 'theme');
  }

  /**
   * Changes the theme by cloning it's repository
   */
  public async use(url: string): Promise<Theme> {
    await this.delete();
    // Unfortunately there is no shallow clone integration
    // in nodegit and the underlying libgit2 yet.
    // See: https://github.com/libgit2/libgit2/issues/3058
    // Otherwise we could just clone the current version
    // without the history overhead
    await Util.git.clone(url, this.path);
    this._repository = await Util.git.open(this.path);
    this._name = this.config.name;
    this._url = url;
    return this;
  }

  /**
   * Loads the current theme
   */
  public async load(): Promise<Theme> {
    this._repository = await Util.git.open(this.path);
    this._name = this.config.name;
    this._url = this.config.url;
    return this;
  }

  /**
   * Updates the theme by pulling from it's repository
   */
  public async update(): Promise<void> {
    await Util.git.pull(this.repository);
  }

  /**
   * Deletes this theme from disk
   */
  public async delete(): Promise<void> {
    await Util.rmrf(this.path);
    await Util.mkdir(this.path);
  }
}