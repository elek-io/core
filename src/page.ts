import PageFile from './file/pageFile';
import * as Util from './util';
import * as Git from './git';
import Project from './project';
import ProjectChild from './projectChild';
import { ThemeBlockPosition, ThemeLayout } from './theme';
import Block from './block';

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

export interface PageTaxonomyOption {
  id: string;
  value: string;
}

export type PageTaxonomy = {
  id: string;
  type: 'select';
  options?: PageTaxonomyOption[];
  value: string;
} | {
  id: string;
  type: 'multiselect';
  options?: PageTaxonomyOption[];
  value: string[];
}

export class PageFileContent {
  public name = '';
  public path = '';
  public stage: PageStage = 'wip';
  public layoutId = '';
  public taxonomies: PageTaxonomy[] = [];
  public content: PageContentReference[] = [];
}
export type PageFileContentKey = keyof PageFileContent;

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

export default class Page extends ProjectChild {
  private _file: PageFile | null = null;
  private _config: PageFileContent | null = null;
  private _layout: ThemeLayout | null = null;
  private _content: PageContent[] = [];

  public get language(): string {
    return this.checkInitialization(this._language);
  }

  private get file(): PageFile {
    return this.checkInitialization(this._file);
  }

  public get config(): PageFileContent {
    return this.checkInitialization(this._config);
  }

  public get layout(): ThemeLayout | null {
    return this._layout;
  }

  public get content(): PageContent[] {
    return this._content;
  }

  constructor(project: Project) {
    super(project, 'page');
  }

  /**
   * Creates a new page on disk
   */
  public async create(signature: Git.GitSignature, language: string, partialPageFileContent?: Partial<PageFileContent>): Promise<Page> {
    this.checkReinitialization();

    this._id = Util.uuid();
    this._language = language;
    this._file = new PageFile(this.project.id, this.id, this.language, this.project.logger);

    // The pages file will be initialized with a default that can be overwritten
    this._config = Util.assignDefaultIfMissing(partialPageFileContent || {}, new PageFileContent());

    // Create the pages file
    await this._file.save(this._config);

    // Load the pages layout
    await this.loadLayout();

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new page');

    // Add this page to the project
    this.project.pages.push(this);

    return this;
  }

  /**
   * Loads a page by it's ID and language
   */
  public async load(id: string, language: string): Promise<Page> {
    this.checkReinitialization();

    this._id = id;
    this._language = language;
    this._file = new PageFile(this.project.id, this.id, this.language, this.project.logger);
    this._config = await this._file.load();

    // Load the pages layout
    await this.loadLayout();

    // Populate the content property by loading the objects references
    await this.loadContentByReferences();

    // Push the page to the project if it's not already there
    if (!this.project.pages.find((page) => {
      return page.id === this.id && page.language === this._language;
    })) {
      this.project.pages.push(this);
    }

    return this;
  }

  /**
   * Saves the page's files on disk and creates a commit
   */
  public async save(signature: Git.GitSignature, message = ':wrench: Updated page'): Promise<void> {
    // Write config to disk
    await this.file.save(this.config);
    // Commit changes
    await Git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
  }

  /**
   * Deletes the page's files from disk, creates a commit and removes it's reference from the project
   */
  public async delete(signature: Git.GitSignature, message = ':fire: Deleted page'): Promise<void> {
    // Remove config from disk
    await this.file.delete();
    // Commit changes
    await Git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
    // Remove it from the project
    this.removeFromProject();
  }

  public async export(): Promise<{
    id: string;
    name: string;
    language: string;
    path: string;
    stage: PageStage;
    layout: ThemeLayout | null;
    content: {
      id: string;
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
          ...block.config,
          html: block.content
        };
      }))
    };
  }

  /**
   * Loads all content references inside the pages config into objects 
   * and populates the content property with them
   */
  private async loadContentByReferences() {
    this._content = await Util.returnResolved(this.config.content.map(async (contentReference, contentReferenceIndex) => {
      // Find the position by reference
      const position = this.project.theme.blockPositions.find((position) => {
        return position.id === contentReference.positionId;
      });
      // Find the block by reference
      const block = this.project.blocks.find((block) => {
        return block.id === contentReference.blockId;
      });
      if (!position || !block) {
        // Remove the invalid content reference from this pages config
        delete this.config.content[contentReferenceIndex];
        if (!position) {
          throw new Error(`Could not find the themes block position by ID (${contentReference.positionId}) to resolve a pages content`);
        } else if (!block) {
          throw new Error(`Could not find the block by ID (${contentReference.blockId}) to resolve a pages content`);
        }
      }
      return {
        position,
        block
      };
    }));
  }

  /**
   * Loads the specified layout of this page from the theme in use
   */
  private async loadLayout() {
    // If there is no layout for this page selected yet, that's fine
    if (!this.config.layoutId) {
      this._layout = null;
      return;
    }
    // Else, try to load the layout of this page
    const layout = this.project.theme.config.layouts.find((layout) => {
      return layout.id === this.config.layoutId;
    });
    // If the specified layout cannot be found inside the current theme, 
    // which can be the case if the project uses a different theme
    // and something inside the wizard failed,
    // reset the layout of this page and inside the pages config
    if (!layout) {
      this.config.layoutId = '';
      this._layout = null;
      return;
    }
    // Assign the found layout to this page
    this._layout = layout;
  }
}