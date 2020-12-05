import { ModelType } from '../../types';
import InvalidUuidError from '../error/InvalidUuidError';
import Util from '../util';

/**
 * A base model that provides properties for all other models
 * like an ID and type
 */
export default abstract class AbstractModel {
  /**
   * UUID v4 compliant ID
   * 
   * @see https://www.ietf.org/rfc/rfc4122.txt
   */
  public readonly id: string;
  
  /**
   * The type of this model
   */
  public readonly type: ModelType;

  constructor(id: string, type: ModelType) {
    if (Util.validator.isUuid(id) === false) {
      throw new InvalidUuidError(id);
    }
    this.id = id;
    this.type = type;
  }
}