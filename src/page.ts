import Path from 'path';
import Util from './util';
import { GitSignature } from './util/git';
import Project from './project';
import { ThemeBlockPosition, ThemeLayout } from './theme';
import Block, { BlockConfig } from './block';

/**
 * Reference of this pages content to the themes block position ID 
 * and the actual block ID saved inside the pages config
 */
export interface PageContentReference {
  positionId: string;
  blockId: string;
}

/**
 * The actual position and block objects
 */
export interface PageContent {
  position: ThemeBlockPosition;
  block: Block;
}

export class PageConfig {
  public name = '';
  public path = '';
  public stage: PageStage = 'wip';
  public layoutId = '';
  public content: PageContentReference[] = [];
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
  private _language!: string;
  private _project!: Project;
  private _path!: string;
  private _config!: PageConfig;
  private _layout!: ThemeLayout;
  private _content: PageContent[] = [];

  public get id(): string {
    return this._id;
  }

  public get language(): string {
    return this._language;
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

  public get layout(): ThemeLayout {
    return this._layout;
  }

  public get content(): PageContent[] {
    return this._content;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new page on disk
   */
  public async create(signature: GitSignature, language: string, config?: PageConfig): Promise<Page> {
    this._id = Util.uuid();
    this._language = language;
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'pages', `${this.id}.${this.language}.json`);

    // Page can be initialized with a custom config
    // if it's not, default will be used
    if (!config) {
      config = new PageConfig();
    }
    // Create the page config file
    await Util.write.page(this.project.id, this.id, this.language, config);

    // Load the file into this object
    this._config = await Util.read.page(this.project.id, this.id, this.language);

    // Load the pages layout
    await this.loadLayout();

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new page');

    return this;
  }

  /**
   * Loads a page by it's ID
   */
  public async load(id: string, language: string): Promise<Page> {
    this._id = id;
    this._language = language;
    this._config = await Util.read.page(this.project.id, this.id, this.language);
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'pages', `${this.id}.${this.language}.json`);

    // Load the pages layout
    await this.loadLayout();

    // Populate the content property by loading the objects references
    await this.loadContentByReferences();

    return this;
  }

  /**
   * Saves the page's files on disk and creates a commit
   */
  public async save(signature: GitSignature, message = ':wrench: Updated page config'): Promise<void> {
    // Write config to disk
    await Util.write.page(this.project.id, this.id, this.language, this.config);
    // Commit changes
    await Util.git.commit(this.project.path, signature, this.path, message);
  }

  public async export(): Promise<{
    id: string;
    name: string;
    language: string;
    path: string;
    stage: PageStage;
    layout: ThemeLayout;
    content: {
      id: string;
      // position: ThemeBlockPosition;
      // block: {
      //   id: string;
      //   path: string;
      //   config: BlockConfig;
      //   content: string;
      // },
      html: string;
    }[]
  }> {
    await this.loadContentByReferences();
    return {
      id: this.id,
      name: this.config.name,
      language: this.language,
      path: this.config.path,
      stage: this.config.stage,
      layout: this.layout,
      content: await Promise.all(this.content.map(async (pageContent) => {
        const block = await pageContent.block.export(pageContent.position.restrictions);
        return {
          id: pageContent.position.id,
          // position: pageContent.position,
          ...block.config,
          html: block.content
        };
      }))
    };
  }

  private async loadContentByReferences() {
    this._content = await Promise.all(this._config.content.map(async (contentReference) => {
      const position = this.project.theme.blockPositions.find((position) => {
        return position.id === contentReference.positionId;
      });
      if (!position) {
        throw new Error(`Could not find themes block position "${contentReference.positionId}"`);
      }
      const block = await new Block(this.project).load(contentReference.blockId, this.language);
      return {
        position,
        block
      };
    }));
  }

  private async loadLayout() {
    const layout = this.project.theme.config.layouts.find((layout) => {
      return layout.id === this.config.layoutId;
    });
    if (layout) {
      this._layout = layout;
    }
  }
}