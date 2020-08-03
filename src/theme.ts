import Fs from 'fs-extra';
import Path from 'path';
import Cheerio from 'cheerio';
import * as Util from './util';
import * as Git from './git';
import Project from './project';
import ProjectChild from './projectChild';
import ThemeFile from './file/themeFile';
import { BlockRestrictions, BlockRuleArray, BlockRule } from './block';
import { PageTaxonomy } from './page';

export class ThemeFileContent {
  public name = '';
  public description = '';
  public version = '1.0.0';
  public homepage = '';
  public repository = '';
  public author = '';
  public license = '';
  public navigations: ThemeNavigation[] = [];
  public layouts: ThemeLayout[] = [];
  public scripts!: {
    serve: string;
    build: string;
  };
  public exportFile = '.elek.io/project.json';
  public buildDir = 'dist';
}

export class ThemeNavigation {
  public id!: string;
  public items?: {
    minimum?: number;
    maximum?: number;
  } = {
    minimum: 0,
    maximum: 0
  };
  public subitems?: {
    allowed?: boolean;
    levels?: number;
  } = {
    allowed: true,
    levels: 1
  }
}

export class ThemeLayout {
  public id!: string;
  public type!: string;
  public name!: string;
  public description!: string;
  public path!: string;
  public taxonomies: PageTaxonomy[] = [];
  public children: ThemeLayout[] = [];
}

export class ThemeBlockPosition {
  public id!: string;
  public layout!: ThemeLayout;
  public restrictions!: BlockRestrictions;
}

export default class Theme extends ProjectChild {
  private _file: ThemeFile | null = null;
  private _config: ThemeFileContent | null = null;
  private _blockPositions: ThemeBlockPosition[] = [];

  public get config(): ThemeFileContent {
    return this.checkInitialization(this._config);
  }

  public get blockPositions(): ThemeBlockPosition[] {
    return this._blockPositions;
  }

  constructor(project: Project) {
    super(project, 'theme');
  }

  /**
   * Changes the theme by cloning it's repository
   * 
   * @todo implement logic to map between both themes layouts
   */
  public async use(repository: string): Promise<Theme> {
    await this.delete();
    // Clone only the main branch with a history depth of 1
    // to save resources and time
    await Git.clone(repository, Util.pathTo.theme(this.project.id), {
      singleBranch: true,
      depth: 1
    });
    this._file = new ThemeFile(this.project.id);
    this._config = await this._file.load();
    await this.parse();

    // Implement logic to map the layouts of all current pages
    // to the layouts of the new theme here

    return this;
  }

  /**
   * Loads the current theme
   * 
   * @todo decide where the themes ID comes from. 
   * Of course from the elek.io cloud but how do we map 
   * the theme with it's ID?
   */
  public async load(): Promise<Theme> {
    this.checkReinitialization();

    this._file = new ThemeFile(this.project.id);
    this._config = await this._file.load();

    // This is a placeholder for @todo
    this._id = this._config.name;

    await this.parse();

    return this;
  }

  /**
   * Updates the theme by pulling from it's repository
   * 
   * @todo implement logic to check for layout ID changes and maybe map between both versions if needed
   */
  public async update(): Promise<void> {
    await Git.pull(Util.pathTo.theme(this.project.id));
  }

  public async export(): Promise<{
    config: ThemeFileContent;
    blockPositions: ThemeBlockPosition[];
  }> {
    return {
      config: this.config,
      blockPositions: this.blockPositions
    };
  }

  /**
   * Deletes this theme from disk
   * 
   * This is private on purpose. 
   * One theme should always be present. 
   * This method is only used to remove the current theme 
   * while switching to another one.
   */
  private async delete(): Promise<void> {
    await Fs.emptyDir(Util.pathTo.theme(this.project.id));
  }

  /**
   * Looks for elek.io blocks in every layout of the theme and parses their restrictions
   */
  private async parse(): Promise<void> {
    for (let index = 0; index < this.config.layouts.length; index++) {
      const layout = this.config.layouts[index];
      // Check if it contains custom elek.io elements
      const content = await Fs.readFile(Path.join(Util.pathTo.theme(this.project.id), layout.path));
      const $ = Cheerio.load(content, {
        // Needed to parse uppercase / lowercase combinations used in frameworks like Vue.js
        xmlMode: true
      });
      // Get all content blocks
      const block = $('[elek-io][type="block"]');
      for (let index = 0; index < block.length; index++) {
        const element = block[index];
        const partialRestrictions = await this.parseRestrictions(element.attribs);
        const restrictions = Util.assignDefaultIfMissing(partialRestrictions, new BlockRestrictions);
        this._blockPositions.push({
          id: element.attribs['id'],
          layout,
          restrictions
        });
      }
    }
  }

  /**
   * Parses given HTML attributes and returns an partial BlockRestrictions object
   */
  private async parseRestrictions(attributes: CheerioElement['attribs']) {
    const restrictions: Partial<BlockRestrictions> = {};
    
    for (const key in attributes) {
      const attribute = attributes[key];

      // BlockRules
      if (key === 'only' || key === 'not') {
        restrictions[key] = await this.parseBlockRule(attribute);
      }

      // Numbers
      if (key === 'minimum' || key === 'maximum') {
        restrictions[key] = await this.parseNumber(attribute, key);
      }

      // Booleans
      if (key === 'inline' || key === 'breaks' || key === 'html' || key === 'highlightCode' || key === 'repeatable') {
        restrictions[key] = await this.parseBoolean(attribute, key);
      }
    }

    return restrictions;
  }

  private async parseBlockRule(attribute: string) {
    return attribute.split(',').filter((value) => {
      return BlockRuleArray.includes(<BlockRule>value.trim());
    }).map((value) => {
      return <BlockRule>value.trim();
    });
  }

  private async parseNumber(attribute: string, key: string) {
    const value = parseInt(attribute);
    if (value < 0) {
      throw new Error(`Found negative value "${value}" for restriction "${key}"`);
    }
    return value;
  }

  private async parseBoolean(attribute: string, key: string) {
    if (attribute !== 'true' && attribute !== 'false') {
      throw new Error(`Expected boolean value for restriction "${key}", got "${attribute}"`);
    }
    if (attribute === 'true') {
      return true;
    }
    return false;
  }
}