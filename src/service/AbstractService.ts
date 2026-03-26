import type { ElekIoCoreOptions, ServiceType } from '../schema/index.js';
import type { CoreResult } from '../util/shared.js';
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

  /**
   * Logs errors at the service boundary and passes them through.
   * Should wrap the return of every public service method.
   */
  protected logged<T>(context: string, result: CoreResult<T>): CoreResult<T> {
    return result.mapErr((e) => {
      this.logService.error({
        source: 'core',
        message: `[${e.type}] (${this.type}.${context}) ${e.message}`,
        meta: e,
      });
      return e;
    });
  }
}
