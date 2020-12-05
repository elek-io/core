/**
 * A base service that provides properties for all other services
 */
export default abstract class AbstractService {
  public readonly type: ServiceType;

  constructor(type: ServiceType) {
    this.type = type;
  }
}