import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';

/**
 * A base service that provides properties for all other services
 */
export default abstract class AbstractService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;

  /**
   * Do not instantiate directly as this is an abstract class
   * 
   * @param type Type of the service that inherits from this class
   * @param options ElekIoCoreOptions
   */
  protected constructor(type: ServiceType, options: ElekIoCoreOptions) {
    this.type = type;
    this.options = options;
  }
}
