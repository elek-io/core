import type { ZodType } from 'zod';
import type { ElekIoCoreOptions, ServiceType } from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import type { LogService } from './LogService.js';

/**
 * A base service that provides common properties for all services
 */
export abstract class AbstractService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;
  protected readonly pathTo: PathTo;
  protected readonly logService: LogService;

  protected constructor(
    type: ServiceType,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService
  ) {
    this.type = type;
    this.options = options;
    this.pathTo = pathTo;
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
   * Throws a logged `CoreError.preconditionFailed` when Core is in
   * read-only mode. mutating() calls this before validating, methods
   * that read before they can validate call it directly at their
   * entry point.
   */
  protected assertNotReadOnly(context: string): void {
    if (this.options.readOnly !== true) {
      return;
    }
    const error = CoreError.preconditionFailed(
      `Cannot ${context} because Core is in read-only mode`
    );
    this.logService.error({
      source: 'core',
      message: `[${error.type}] (${this.type}.${context}) ${error.message}`,
    });
    throw error;
  }

  /**
   * Like validated(), but for methods that mutate a Project or its remote.
   * Throws a logged `CoreError.preconditionFailed` in read-only mode,
   * before the input is validated, because the operation is forbidden
   * regardless of its input.
   */
  protected async mutating<TSchema, TResult>(
    context: string,
    schema: ZodType<TSchema>,
    data: unknown,
    body: (props: TSchema) => Promise<TResult>
  ): Promise<TResult> {
    this.assertNotReadOnly(context);
    return this.validated(context, schema, data, body);
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
