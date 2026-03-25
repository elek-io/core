import type { ElekIoCoreOptions, ServiceType } from '../schema/index.js';
import type { LogService } from './LogService.js';

/**
 * A base service that provides common properties for all services
 */
export abstract class AbstractService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;
  protected readonly logService: LogService;

  protected constructor(
    type: ServiceType,
    options: ElekIoCoreOptions,
    logService: LogService
  ) {
    this.type = type;
    this.options = options;
    this.logService = logService;
  }
}
