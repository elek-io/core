import Markdown from 'markdown-it';
import Code from 'highlight.js';
import { BlockRestrictions } from '../../type/block';
import { ElekIoCoreOptions } from '../../type/general';
import AbstractModel from '../model/AbstractModel';
import Block from '../model/Block';
import Project from '../model/Project';
import Util from '../util';
import EventService from './EventService';
import GitService from './GitService';
import MdFileService from './MdFileService';
import { ExtendedCrudService, PaginatedList, ServiceType, Sort } from '../../type/service';
import { ModelType } from '../../type/model';
import { CoreEventName } from '../../type/coreEvent';
import AbstractService from './AbstractService';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError';

/**
 * Service that manages CRUD functionality for block files on disk
 */
export default class BlockService extends AbstractService implements ExtendedCrudService<Block> {
  private eventService: EventService;
  private mdFileService: MdFileService;
  private readonly gitService: GitService;

  constructor(options: ElekIoCoreOptions, eventService: EventService, mdFileService: MdFileService, gitService: GitService) {
    super(ServiceType.BLOCK, options);

    this.eventService = eventService;
    this.mdFileService = mdFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new block on disk and commits it
   * 
   * @todo how to add json header dynamically?
   * 
   * @param project Project to add the block to
   * @param language Language of the new block
   * @param body Markdown body of the block
   */
  public async create(project: Project, language: string, name: string, body: string): Promise<Block> {
    const id = Util.uuid();
    const projectPath = Util.pathTo.project(project.id);
    const block = new Block(id, language, name, body);
    const blockPath = Util.pathTo.block(project.id, block.id, language);
    await this.mdFileService.create({
      jsonHeader: {
        id: block.id,
        language: block.language,
        name: block.name,
        type: block.type
      },
      mdBody: block.body
    }, blockPath);
    await this.gitService.add(projectPath, [blockPath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);
    this.eventService.emit(CoreEventName.BLOCK_CREATE, {
      project,
      data: {
        block
      }
    });
    return block;
  }

  /**
   * Finds and returns a block on disk by ID
   * 
   * @param project Project of the block to read
   * @param id ID of the block to read
   * @param language Language of the block to read
   */
  public async read(project: Project, id: string, language: string): Promise<Block> {
    const mdFile = await this.mdFileService.read<Block>(Util.pathTo.block(project.id, id, language));
    const block = new Block(id, language, mdFile.jsonHeader.name, mdFile.mdBody);
    this.eventService.emit(CoreEventName.BLOCK_READ, {
      project,
      data: {
        block
      }
    });
    return block;
  }

  /**
   * Updates the block file on disk and creates a commit
   * 
   * @todo how to add json header dynamically?
   * 
   * @param project Project of the block to update
   * @param block Block to write to disk
   * @param message Optional overwrite for the git message
   */
  public async update(project: Project, block: Block, message = this.gitMessage.update): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const blockPath = Util.pathTo.block(project.id, block.id, block.language);
    await this.mdFileService.update({
      jsonHeader: {
        id: block.id,
        language: block.language,
        name: block.name,
        type: block.type
      },
      mdBody: block.body
    }, blockPath);
    await this.gitService.add(projectPath, [blockPath]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.BLOCK_UPDATE, {
      project,
      data: {
        block
      }
    });
  }

  /**
   * Deletes the block file from disk and creates a commit
   * 
   * @param project Project of the block to delete
   * @param block Block to delete from disk
   * @param message Optional overwrite for the git message
   */
  public async delete(project: Project, block: Block, message = this.gitMessage.delete): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    const blockPath = Util.pathTo.block(project.id, block.id, block.language);
    await this.mdFileService.delete(blockPath);
    await this.gitService.add(projectPath, [blockPath]);
    await this.gitService.commit(projectPath, message);
    this.eventService.emit(CoreEventName.BLOCK_DELETE, {
      project,
      data: {
        block
      }
    });
  }

  public async list(project: Project, sort: Sort<Block>[] = [], filter = '', limit = 15, offset = 0): Promise<PaginatedList<Block>> {
    const modelReferences = await this.listReferences(ModelType.BLOCK, project);
    const list = await Util.returnResolved(modelReferences.map((modelReference) => {
      if (!modelReference.language) { throw new RequiredParameterMissingError('language'); }
      return this.read(project, modelReference.id, modelReference.language);
    }));

    return this.paginate(list, sort, filter, limit, offset);
  }

  public async count(project: Project): Promise<number> {
    return (await this.listReferences(ModelType.BLOCK, project)).length;
  }

  /**
   * Checks if given model is of type block
   * 
   * @param model The model to check
   */
  public isBlock(model: AbstractModel): boolean {
    return model.type === ModelType.BLOCK;
  }

  /**
   * Returns HTML of the rendered block content
   * 
   * @param block The block to render content from
   * @param restrictions restrictions object of the theme in use
   */
  public render(block: Block, restrictions: BlockRestrictions): string {
    // Configure the Markdown renderer based on the block's restriction
    const md = new Markdown({
      /**
       * Enable HTML tags in source
       */
      html: restrictions.html,
      /**
       * Use '/' to close single tags (<br />).
       * This is only for full CommonMark compatibility.
       */
      xhtmlOut: false,
      /**
       * Convert '\n' in paragraphs into <br>
       */
      breaks: restrictions.breaks,
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
        if (restrictions.highlightCode === true && language && Code.getLanguage(language)) {
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
      .enable(restrictions.only)
      // Disable specific rules
      .disable(restrictions.not);

    // Return rendered HTML as string
    return md.render(block.body);
  }
}