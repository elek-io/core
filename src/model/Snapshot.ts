import { GitSignature } from '../../type/git';
import { ModelType } from '../../type/model';
import AbstractModel from './AbstractModel';

/**
 * Snapshots reference a point in time of given project
 * 
 * Internally they are handled by git via tags
 */
export default class Snapshot extends AbstractModel {
  public readonly name: string;

  /**
   * UTC Unix timestamp in seconds
   */
  public readonly timestamp: number;

  /**
   * The author who created this snapshot
   */
  public readonly author: GitSignature;

  constructor(id: string, name: string, timestamp: number, author: GitSignature) {
    super(id, ModelType.SNAPSHOT);
    
    this.name = name;
    this.timestamp = timestamp;
    this.author = author;
  }
}