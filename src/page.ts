import Path from 'path';
import * as Util from './util';
import Project from './project';
import { Signature } from 'nodegit';

export class PageContent {
  public themeBlockId = '';
  public blockId = '';
}

export class PageConfig {
  public name = '';
  public slug = '';
  public stage: PageStage = 'wip';
  public content: PageContent[] = [];
}
export type PageConfigKey = keyof PageConfig;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    return this._config;
  }

  public set config(value: PageConfig) {
    this._config = value;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new page on disk
   */
  public async create(signature: Signature, config?: PageConfig): Promise<Page> {
    this._id = Util.uuid();
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'pages', `${this.id}.json`);

    // Page can be initialized with a custom config
    // if it's not, default will be used
    if (!config) {
      config = new PageConfig();
    }
    // Create the page config file
    await Util.write.page(this.project.id, this.id, config);

    // Load the file into this object
    this._config = await Util.read.page(this.project.id, this.id);

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new page');

    return this;
  }

  /**
   * Loads a page by it's ID
   */
  public async load(id: string): Promise<Page> {
    this._id = id;
    this._config = await Util.read.page(this.project.id, this.id);
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'pages', `${this.id}.json`);
    return this;
  }

  /**
   * Saves the page's files on disk and creates a commit
   */
  public async save(signature: Signature, message = ':wrench: Updated page config'): Promise<void> {
    // Write config to disk
    await Util.write.page(this.project.id, this.id, this.config);
    // Commit changes
    await Util.git.commit(this.project.localRepository, signature, this.path, message);
  }
}