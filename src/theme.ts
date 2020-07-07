import Fs from 'fs-extra';
import Path from 'path';
import Cheerio from 'cheerio';
import * as Util from './util';
import { Repository } from 'nodegit';
import Project from './project';
import { BlockRestrictions, BlockRuleArray, BlockRule } from './block';

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
  public buildDir = '';
}

export class ThemeLayout {
  public id!: string;
  public type!: string;
  public name!: string;
  public description!: string;
  public path!: string;
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
  private _project!: Project;
  private _path!: string;
  private _config!: ThemeConfig;
  private _localRepository!: Repository;
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

  public get localRepository(): Repository {
    return this._localRepository;
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
    await this.parse();
    return this;
  }

  /**
   * Loads the current theme
   */
  public async load(): Promise<Theme> {
    this._localRepository = await Util.git.open(this.path);
    this._config = await Util.read.theme(this.project.id);
    await this.parse();
    return this;
  }

  /**
   * Updates the theme by pulling from it's repository
   */
  public async update(): Promise<void> {
    await Util.git.pull(this._localRepository);
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
   * Looks for custom elek.io elements in every layout of the theme and parses them
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
        restrictions[key] = attribute.split(',').filter((value) => {
          return BlockRuleArray.includes(<BlockRule>value.trim());
        }).map((value) => {
          return <BlockRule>value.trim();
        });
      }

      // Numbers
      if (key === 'minimum' || key === 'maximum') {
        const value = parseInt(attribute);
        if (value < 0) {
          throw new Error(`Found negative value "${value}" for restriction "${key}"`);
        }
        restrictions[key] = value;
      }

      // Booleans
      if (key === 'inline' || key === 'breaks' || key === 'html' || key === 'highlightCode' || key === 'repeatable') {
        if (attribute !== 'true' && attribute !== 'false') {
          throw new Error(`Expected boolean value for restriction "${key}", got "${attribute}"`);
        }
        if (attribute === 'true') {
          restrictions[key] = true;
        }
        restrictions[key] = false;
      }
    }

    return restrictions;
  }
}