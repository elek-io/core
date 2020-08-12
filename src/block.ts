import * as Util from './util/general';
import * as Git from './util/git';
import Project from './project';
import BlockFile from './file/blockFile';
import Markdown from 'markdown-it';
import Code from 'highlight.js';
import ProjectChild from './projectChild';

export class BlockFileHeader {}
export type BlockFileHeaderKey = keyof BlockFileHeader;

export class BlockRestrictions {
  public only: BlockRule[] = [];
  public not: BlockRule[] = [];
  public minimum = 0;
  public maximum = 0;
  public required = false;
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

export default class Block extends ProjectChild {
  private _file: BlockFile | null = null;
  private _config: BlockFileHeader | null = null;
  private _content: string | null = null;

  public get language(): string {
    return this.checkInitialization(this._language);
  }

  private get file(): BlockFile {
    return this.checkInitialization(this._file);
  }

  public get config(): BlockFileHeader {
    return this.checkInitialization(this._config);
  }

  public set config(value: BlockFileHeader) {
    this._config = value;
  }

  public get content(): string {
    return this.checkInitialization(this._content);
  }

  public set content(value: string) {
    this._content = value;
  }

  constructor(project: Project) {
    super(project, 'block');
  }

  /**
   * Creates a new block on disk
   */
  public async create(signature: Git.GitSignature, language: string, partialConfig?: Partial<BlockFileHeader>, content?: string): Promise<Block> {
    this.checkReinitialization();
    
    this._id = Util.uuid();
    this._language = language;
    this._file = new BlockFile(this.project.id, this._id, this._language, this.project.logger);

    // Block can be initialized with a custom config and content
    // if it's not, default will be used
    this._config = Util.assignDefaultIfMissing(partialConfig || {}, new BlockFileHeader());
    this._content = content || '';

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new block');

    // Add this block to the project
    this.addToProject();

    return this;
  }

  /**
   * Loads a block by it's ID and language
   */
  public async load(id: string, language: string): Promise<Block> {
    this.checkReinitialization();
    
    this._id = id;
    this._language = language;
    this._file = new BlockFile(this.project.id, this._id, this._language, this.project.logger);

    const block = await this._file.load();

    this._config = block.header;
    this._content = block.body;

    this.addToProject();

    return this;
  }

  /**
   * Saves the block's files on disk and creates a commit
   */
  public async save(signature: Git.GitSignature, message = ':wrench: Updated block'): Promise<void> {
    // Write block to disk
    await this.file.save({
      header: this.config,
      body: this.content
    });
    // Commit changes
    await Git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
  }

  /**
   * Deletes the block's files from disk, creates a commit and removes it's reference from the project
   */
  public async delete(signature: Git.GitSignature, message = ':fire: Deleted block'): Promise<void> {
    // Remove block from disk
    await this.file.delete();
    // Commit changes
    await Git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
    // Remove it from the project
    this.removeFromProject();
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
            throw new Error(error);
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

  public async export(partialRestriction: Partial<BlockRestrictions>): Promise<{
    id: string;
    config: BlockFileHeader;
    content: string;
  }> {
    return {
      id: this.id,
      config: this.config,
      content: await this.render(partialRestriction)
    };
  }
}