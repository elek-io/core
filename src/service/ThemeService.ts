import Fs from 'fs-extra';
import Path from 'path';
import Cheerio from 'cheerio';
import { ElekIoCoreOptions } from '../../type/general';
import { BlockRestrictions, BlockRule, BlockRuleArray } from '../../type/block';
import Project from '../model/Project';
import Theme from '../model/Theme';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import GitService from './GitService';
import JsonFileService from './JsonFileService';
import { ThemeLayoutBlockPosition, ThemeLayout } from '../../type/theme';

/**
 * Service that manages CRUD functionality for the theme in use
 */
export default class ThemeService extends AbstractService {
  private eventService: EventService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  /**
   * Creates a new instance of the ThemeService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param jsonFileService JsonFileService
   * @param gitService GitService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, jsonFileService: JsonFileService, gitService: GitService) {
    super('theme', options);

    this.eventService = eventService;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Changes the theme in use by downloading
   * a new one from a remote repository
   * 
   * @param project Project to add the block to
   * @param repository URL to the repository to clone
   */
  public async use(project: Project, repository: string): Promise<Theme> {
    await this.delete(project);
    // Clone only the main branch with a history depth of 1
    // to save resources and time
    await this.gitService.clone(repository, Util.pathTo.theme(project.id), {
      singleBranch: true,
      depth: 1
    });
    const theme = await this.read(project);
    this.eventService.emit(`${this.type}:use`, {
      project,
      data: {
        theme
      }
    });
    return theme;
  }

  /**
   * Returns the currently used theme of given project
   * 
   * @param project Project of the theme to read
   */
  public async read(project: Project): Promise<Theme> {
    const theme: Theme = await this.jsonFileService.read(Util.pathTo.themeConfig(project.id));
    this.eventService.emit(`${this.type}:read`, {
      project,
      data: {
        theme
      }
    });
    return theme;
  }

  /**
   * Updates the current theme on disk by pulling
   * the latest changes from the remote repository
   * 
   * @todo Implement logic to check for layout ID changes
   * and maybe map between both versions if needed
   * 
   * @param project Project of the theme to update
   */
  public async update(project: Project): Promise<Theme> {
    await this.gitService.pull(Util.pathTo.theme(project.id));
    const theme = await this.read(project);
    this.eventService.emit(`${this.type}:update`, {
      project,
      data: {
        theme
      }
    });
    return theme;
  }

  /**
   * Deletes the current theme from disk
   * 
   * @param project Project of the theme to delete
   */
  public async delete(project: Project): Promise<void> {
    await Fs.emptyDir(Util.pathTo.theme(project.id));
    await Fs.writeFile(Path.join(Util.pathTo.theme(project.id), '.gitkeep'), '');
    this.eventService.emit(`${this.type}:delete`, {
      project
    });
  }

  /**
   * Looks for block positions in given layout of the theme,
   * parses their restrictions and returns the result
   */
  public async getBlockPositions(project: Project, layout: ThemeLayout): Promise<ThemeLayoutBlockPosition[]> {
    const layoutContent = await Fs.readFile(Path.join(Util.pathTo.theme(project.id), layout.path));
    const $ = Cheerio.load(layoutContent, {
      // Needed to parse uppercase / lowercase combinations used in frameworks like Vue.js
      xmlMode: true
    });
    const defaultRestrictions: BlockRestrictions = {
      only: [],
      not: [],
      minimum: 0,
      maximum: 0,
      required: false,
      inline: false,
      breaks: false,
      html: false,
      highlightCode: false,
      repeatable: false
    };
    const blockPositions: ThemeLayoutBlockPosition[] = [];
    $('[elek-io][type="block"]').map( async (index, block) => {
      const partialRestrictions = await this.parseRestrictions(block.attribs);
      blockPositions.push({
        id: block.attribs['id'],
        restrictions: Util.assignDefaultIfMissing(partialRestrictions, defaultRestrictions)
      });
    });
    return blockPositions;
  }

  /**
   * Parses given HTML attributes and returns an partial BlockRestrictions object
   */
  private async parseRestrictions(attributes: cheerio.Element['attribs']) {
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