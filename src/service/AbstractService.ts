import type { ZodType } from 'zod';
import type { ElekIoCoreOptions, ServiceType } from '../schema/index.js';
import { CoreError } from '../util/shared.js';
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
   * Parses `data` against `schema` or throws a logged `CoreError.badRequest`.
   * Used at service boundaries before `validated()` when a small pre-parse is
   * needed (e.g. to extract an ID required to build the full strict schema).
   */
  protected parseOrThrow<T>(
    context: string,
    schema: ZodType<T>,
    data: unknown
  ): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const error = CoreError.badRequest(parsed.error.message, parsed.error);
      this.logService.error({
        source: 'core',
        message: `[${error.type}] (${this.type}.${context}) ${error.message}`,
      });
      throw error;
    }
    return parsed.data;
  }

  /**
   * Validates input with a Zod schema and runs the body if valid.
   * Logs errors at the service boundary and re-throws.
   * Should be used at the entry point of every public service method that needs schema validation.
   */
  protected async validated<TSchema, TResult>(
    context: string,
    schema: ZodType<TSchema>,
    data: unknown,
    body: (props: TSchema) => Promise<TResult>
  ): Promise<TResult> {
    const parsed = this.parseOrThrow(context, schema, data);
    try {
      return await body(parsed);
    } catch (error) {
      const coreError =
        error instanceof CoreError ? error : CoreError.fromUnknown(error);
      this.logService.error({
        source: 'core',
        message: `[${coreError.type}] (${this.type}.${context}) ${coreError.message}`,
        meta: { type: coreError.type, statusCode: coreError.statusCode },
      });
      throw coreError;
    }
  }
}
