import Fs from 'fs-extra';
import Path from 'path';
import Cheerio from 'cheerio';
import Util from './util';
import Project from './project';
import { BlockRestrictions, BlockRuleArray, BlockRule } from './block';
import { PageTaxonomy } from './page';

export class ThemeConfig {
  public name = '';
  public description = '';
  public version = '1.0.0';
  public homepage = '';
  public repository = '';
  public author = '';
  public license = '';
  public layouts: ThemeLayout[] = [];
  public scripts!: {
    serve: string;
    build: string;
  };
  public exportFile = '.elek.io/project.json';
  public buildDir = 'dist';
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

export default class Theme {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _project: Project;
  private _path!: string;
  private _config!: ThemeConfig;
  private _blockPositions: ThemeBlockPosition[] = [];

  public get project(): Project {
    return this._project;
  }
  
  public get path(): string {
    return this._path;
  }

  public get config(): ThemeConfig {
    return this._config;
  }

  public get blockPositions(): ThemeBlockPosition[] {
    return this._blockPositions;
  }

  constructor(project: Project) {
    this._project = project;
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'theme');
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
    await Util.git.clone(repository, this.path, {
      singleBranch: true,
      depth: 1
    });
    this._config = await Util.read.theme(this.project.id);
    await this.parse();

    // Implement logic to map the layouts of all current pages
    // to the layouts of the new theme here

    return this;
  }

  /**
   * Loads the current theme
   */
  public async load(): Promise<Theme> {
    this._config = await Util.read.theme(this.project.id);
    await this.parse();
    return this;
  }

  /**
   * Updates the theme by pulling from it's repository
   * 
   * @todo implement logic to check for layout ID changes and maybe map between both versions if needed
   */
  public async update(): Promise<void> {
    await Util.git.pull(this.path);
  }

  public async export(): Promise<{
    path: string;
    config: ThemeConfig;
    blockPositions: ThemeBlockPosition[];
  }> {
    return {
      path: this.path,
      config: this.config,
      blockPositions: this.blockPositions
    };
  }

  /**
   * Deletes this theme from disk
   */
  private async delete(): Promise<void> {
    await Fs.emptyDir(this.path);
  }

  /**
   * Looks for elek.io blocks in every layout of the theme and parses their restrictions
   */
  private async parse(): Promise<void> {
    for (let index = 0; index < this.config.layouts.length; index++) {
      const layout = this.config.layouts[index];
      // Check if it contains custom elek.io elements
      const content = await Fs.readFile(Path.join(this.path, layout.path));
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