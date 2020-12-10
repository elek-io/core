import { ElekIoCoreOptions } from '../../type/general';
import AbstractModel from '../model/AbstractModel';
import Block from '../model/Block';
import Project from '../model/Project';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import MdFileService from './MdFileService';

/**
 * Service that manages CRUD functionality for block files on disk
 */
export default class BlockService extends AbstractService {
  private eventService: EventService;
  private mdFileService: MdFileService;

  /**
   * Creates a new instance of the BlockService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param mdFileService MdFileService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, mdFileService: MdFileService) {
    super('block', options);

    this.eventService = eventService;
    this.mdFileService = mdFileService;
  }

  /**
   * Creates a new block on disk and commits it
   * 
   * @param project Project to add the block to
   * @param language Language of the new block
   * @param body Markdown body of the block
   */
  public async create(project: Project, language: string, body: string): Promise<Block> {
    const id = Util.uuid();
    const block = new Block(id, language, body);
    const blockWithoutBody = Object.assign({}, block);
    delete blockWithoutBody.body;
    const blockPath = Util.pathTo.block(project.id, block.id, language);
    await this.mdFileService.create({
      jsonHeader: blockWithoutBody,
      mdBody: block.body
    }, blockPath);
    await Util.git.commit(Util.pathTo.project(project.id), this.options.signature, blockPath, `:heavy_plus_sign: Created new ${this.type}`);
    this.eventService.emit(`${this.type}:create`, {
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
   * @todo Current implementation does not account for custom
   * jsonHeader in file. This will be hard to bring into the 
   * Block object dynamically. Maybe we define them explicitly?
   * 
   * @param project Project of the block to read
   * @param id ID of the block to read
   * @param language Language of the block to read
   */
  public async read(project: Project, id: string, language: string): Promise<Block> {
    const mdFile = await this.mdFileService.read(Util.pathTo.block(project.id, id, language));
    const block = new Block(id, language, mdFile.mdBody);
    this.eventService.emit(`${this.type}:read`, {
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
   * @todo Same question as in read() method
   * 
   * @param project Project of the block to update
   * @param block Block to write to disk
   * @param message Optional overwrite for the git message
   */
  public async update(project: Project, block: Block, message = `Updated ${this.type}`): Promise<void> {
    const blockPath = Util.pathTo.block(project.id, block.id, block.language);
    const blockWithoutBody = Object.assign({}, block);
    delete blockWithoutBody.body;
    await this.mdFileService.update({
      jsonHeader: blockWithoutBody,
      mdBody: block.body
    }, blockPath);
    await Util.git.commit(Util.pathTo.project(project.id), this.options.signature, blockPath, `:wrench: ${message}`);
    this.eventService.emit(`${this.type}:update`, {
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
  public async delete(project: Project, block: Block, message = `Deleted ${this.type}`): Promise<void> {
    const blockPath = Util.pathTo.block(project.id, block.id, block.language);
    await this.mdFileService.delete(blockPath);
    await Util.git.commit(Util.pathTo.project(project.id), this.options.signature, blockPath, `:fire: ${message}`);
    this.eventService.emit(`${this.type}:delete`, {
      project,
      data: {
        block
      }
    });
  }

  /**
   * Checks if given model is of type block
   * 
   * @param model The model to check
   */
  public isBlock(model: AbstractModel): boolean {
    return model.type === 'block';
  }
}