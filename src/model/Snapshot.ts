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
   * Timezone difference from UTC in minutes
   */
  public readonly timezoneOffset: number;


  constructor(id: string, name: string, timestamp: number, timezoneOffset: number) {
    super(id, ModelType.SNAPSHOT);
    
    this.name = name;
    this.timestamp = timestamp;
    this.timezoneOffset = timezoneOffset;
  }
}