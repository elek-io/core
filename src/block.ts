import Path from 'path';
import * as Util from './util';
import Project from './project';
import { Signature } from 'nodegit';

export class BlockConfig {
  public type: BlockType = 'text';
  public content = '';
}
export type BlockConfigKey = keyof BlockConfig;

export enum BlockTypeEnum {
  /**
   * Basic text input
   */
  'text',
  /**
   * Enriched text input
   */
  'richtext',
  /**
   * HTML input
   */
  'html'
}
export const BlockTypeArray = <BlockType[]>Object.keys(BlockTypeEnum).filter((key) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof BlockTypeEnum[key as any] === 'number';
});
export type BlockType = keyof typeof BlockTypeEnum;

export default class Block {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _project!: Project;
  private _path!: string;
  private _config!: BlockConfig;

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

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new block on disk
   */
  public async create(signature: Signature, config?: BlockConfig): Promise<Block> {
    this._id = Util.uuid();
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'blocks', `${this.id}.json`);

    // Block can be initialized with a custom config
    // if it's not, default will be used
    if (!config) {
      config = new BlockConfig();
    }
    // Create the block config file
    await Util.config.write.block(this.project.id, this.id, config);

    // Load the file into this object
    this._config = await Util.config.read.block(this.project.id, this.id);

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new block');

    return this;
  }

  /**
   * Loads a block by it's ID
   */
  public async load(id: string): Promise<Block> {
    this._id = id;
    this._config = await Util.config.read.block(this.project.id, this.id);
    this._path = Path.join(Util.pathTo.projects, this.project.id, 'blocks', `${this.id}.json`);
    return this;
  }

  /**
   * Saves the block's files on disk and creates a commit
   */
  public async save(signature: Signature, message: string): Promise<void> {
    // Write config to disk
    Util.config.write.block(this.project.id, this.id, this.config);
    // Commit changes
    await Util.git.commit(this.project.localRepository, signature, this.path, message);
  }
}