import Path from 'path';
import * as Util from './util';
import Project from './project';

export class PageConfig {
  public name = '';
  public slug = '';
  public stage: PageStage = 'wip';
}

export enum PageStageEnum {
  /**
   * Only visible for the author himself
   */
  'private',
  /**
   * Work in progress
   */
  'wip',
  /**
   * Done but awaiting someone to (probably) review and publish it
   */
  'pending',
  /**
   * Scheduled to be published on a specific date and time
   */
  'scheduled',
  /**
   * Already available to the public
   */
  'published'
}
export const PageStageArray = <PageStage[]>Object.keys(PageStageEnum).filter((key) => {
  return typeof PageStageEnum[key as any] === 'number';
});
export type PageStage = keyof typeof PageStageEnum;

export default class Page {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _project!: Project;
  private _path!: string;
  private _config!: PageConfig;

  public get id(): string {
    return this._id;
  }

  public get project(): Project {
    return this._project;
  }

  public get path(): string {
    return this._path;
  }

  public get config(): PageConfig {
    // Private property acts like a cache
    if (this._config) {
      return this._config;
    }

    this._config = Util.config.read.page(this.project.id, this.id);
    return this._config;
  }

  public set config(value: PageConfig) {
    this._config = value;
  }

  constructor(project: Project) {
    this._project = project;
  }

  public async create(): Promise<Page> {
    this._id = Util.uuid();
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'pages', `${this.id}.json`);
    await this.createConfig();
    this._config = Util.config.read.page(this.project.id, this.id);

    return this;
  }

  /**
   * Loads the current theme
   */
  public async load(fileName: string): Promise<Page> {
    this._config = Util.config.read.page(this.project.id, this.id);
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'pages', fileName);
    this._id = fileName.split('.json')[0];
    return this;
  }

  private async createConfig(): Promise<void> {
    const content = new PageConfig();
    Util.config.write.page(this.project.id, this.id, content);
  }
}