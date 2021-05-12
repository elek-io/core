import { CoreEventName } from '../../type/coreEvent';
import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';

/**
 * A base service that provides properties for all other services
 */
export default abstract class AbstractService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;

  /**
   * Dynamically generated git messages for operations
   */
  public readonly gitMessage: {
    create: string;
    update: string;
    delete: string;
  };

  /**
   * Do not instantiate directly as this is an abstract class
   * 
   * @param type Type of the service that inherits from this class
   * @param options ElekIoCoreOptions
   */
  protected constructor(type: ServiceType, options: ElekIoCoreOptions) {
    this.type = type;
    this.options = options;
    this.gitMessage = {
      create: `:heavy_plus_sign: Created new ${this.type}`,
      update: `:wrench: Updated ${this.type}`,
      delete: `:fire: Deleted ${this.type}`
    };
  }
}
