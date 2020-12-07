/**
 * A base service that provides properties for all other services
 */
export default abstract class AbstractService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;

  protected constructor(type: ServiceType, options: ElekIoCoreOptions) {
    this.type = type;
    this.options = options;
  }
}
