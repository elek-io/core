import Path from 'path';
import * as Util from './util';
import Project from './project';
import { Signature } from 'nodegit';
import Markdown from 'markdown-it';
import Code from 'highlight.js';

export class BlockConfig {
  public language = 'en';
}
export type BlockConfigKey = keyof BlockConfig;

export class BlockRestrictions {
  public only: BlockRule[] = [];
  public not: BlockRule[] = [];
  public minimum = 0;
  public maximum = 0;
  public inline = false;
  public breaks = false;
  public html = false;
  public highlightCode = false;
  public repeatable = false;
}
export type BlockRestrictionsKey = keyof BlockRestrictions;

/**
 * Represents some supported markdown-it rules
 * @see https://github.com/markdown-it/markdown-it#manage-rules
 */
export enum BlockRuleEnum {
  'heading',
  'table',
  'code',
  'blockquote',
  'hr',
  'list',
  'paragraph',
  'strikethrough',
  'emphasis',
  'link',
  'image'
}
export const BlockRuleArray = <BlockRule[]>Object.keys(BlockRuleEnum).filter((key) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof BlockRuleEnum[key as any] === 'number';
});
export type BlockRule = keyof typeof BlockRuleEnum;

export default class Block {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _project!: Project;
  private _path!: string;
  private _config!: BlockConfig;
  private _content!: string;

  public get id(): string {
    return this._id;
  }

  public get project(): Project {
    return this._project;
  }

  public get path(): string {
    return this._path;
  }

  public get config(): BlockConfig {
    return this._config;
  }

  public set config(value: BlockConfig) {
    this._config = value;
  }

  public get content(): string {
    return this._content;
  }

  public set content(value: string) {
    this._content = value;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new block on disk
   */
  public async create(signature: Signature, config: BlockConfig, content?: string): Promise<Block> {
    this._id = Util.uuid();
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'blocks', `${this.id}.md`);

    // Block can be initialized with a custom config
    // if it's not, default will be used
    if (!config) {
      config = new BlockConfig();
    }
    // Create the block file
    await Util.write.block(this.project.id, this.id, config, content);

    // Load the file into this object
    const block = await Util.read.block(this.project.id, this.id);
    this._config = block.config;
    this._content = block.content;

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new block');

    return this;
  }

  /**
   * Loads a block by it's ID
   */
  public async load(id: string): Promise<Block> {
    this._id = id;
    const block = await Util.read.block(this.project.id, this.id);
    this._config = block.config;
    this._content = block.content;
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'blocks', `${this.id}.md`);
    return this;
  }

  /**
   * Saves the block's files on disk and creates a commit
   */
  public async save(signature: Signature, message = ':wrench: Updated block'): Promise<void> {
    // Write block to disk
    await Util.write.block(this.project.id, this.id, this.config, this.content);
    // Commit changes
    await Util.git.commit(this.project.localRepository, signature, this.path, message);
  }

  /**
   * Returns HTML of the rendered block content
   * 
   * @param restriction restriction object of the theme in use
   */
  public async render(partialRestriction: Partial<BlockRestrictions>): Promise<string> {
    const restriction = Util.assignDefaultIfMissing(partialRestriction, new BlockRestrictions());

    // Configure the Markdown renderer based on the block's restriction
    const md = new Markdown({
      /**
       * Enable HTML tags in source
       */
      html: restriction.html,
      /**
       * Use '/' to close single tags (<br />).
       * This is only for full CommonMark compatibility.
       */
      xhtmlOut: false,
      /**
       * Convert '\n' in paragraphs into <br>
       */
      breaks: restriction.breaks,
      /**
       * CSS language prefix for fenced blocks. Can be
       * useful for external highlighters.
       */
      langPrefix: 'language-',
      /**
       * Autoconvert URL-like text to links
       */
      linkify: false,
      /**
       * Enable some language-neutral replacement + quotes beautification
       */
      typographer: false,
      /**
       * Double + single quotes replacement pairs, when typographer enabled,
       * and smartquotes on. Could be either a String or an Array.
       *
       * For example, you can use '«»„“' for Russian, '„“‚‘' for German,
       * and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
       */
      quotes: '“”‘’',
      /**
       * Highlighter function. Should return escaped HTML,
       * or '' if the source string is not changed and should be escaped externally.
       * If result starts with <pre... internal wrapper is skipped.
       */
      highlight: (code, language) => {
        if (restriction.highlightCode === true && language && Code.getLanguage(language)) {
          try {
            return Code.highlight(language, code).value;
          } catch (error) {
            console.log(error);
          }
        }
        return '';
      }
    })
      // Enable specific rules
      .enable(restriction.only)
      // Disable specific rules
      .disable(restriction.not);

    // Return rendered HTML as string
    return md.render(this.content);
  }
}