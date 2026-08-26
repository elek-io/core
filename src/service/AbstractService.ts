import Fs from 'fs-extra';
import { ZodError, type ZodType } from 'zod';
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
   * Logs a `CoreError` at a service boundary.
   *
   * The type and the method are attributes rather than a `[Type]
   * (Service.method)` prefix on the message: both ends were parsing that
   * string back apart. See contributing/logging.md.
   */
  private logBoundaryError(context: string, error: CoreError): void {
    this.logService.error({
      source: 'core',
      message: boundaryMessage(error),
      meta: {
        'error.type': error.type,
        'code.function.name': `${this.type}.${context}`,
        'elek.error.status_code': error.statusCode,
      },
    });
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
      this.logBoundaryError(context, error);
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
    if (this.options.isReadOnly !== true) {
      return;
    }
    const error = CoreError.preconditionFailed(
      `Cannot ${context} because Core is in read-only mode`
    );
    this.logBoundaryError(context, error);
    throw error;
  }

  /**
   * Throws a logged `CoreError.preconditionFailed` when the Project is
   * a provisioned copy, which the next provision run would overwrite.
   * Called by every method that mutates Project content, at the point
   * where the Project ID is first known. Project deletion is exempt,
   * it is the escape hatch that removes a provisioned copy.
   */
  protected async assertNotProvisioned(
    context: string,
    projectId: string
  ): Promise<void> {
    const isProvisioned = await Fs.pathExists(
      this.pathTo.projectProvisionedMarker(projectId)
    );
    if (!isProvisioned) {
      return;
    }
    const error = CoreError.preconditionFailed(
      `Cannot ${context} because Project "${projectId}" is a provisioned copy. The next provision run overwrites it. Delete it and clone the Project to work on it.`
    );
    this.logBoundaryError(context, error);
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
      this.logBoundaryError(context, coreError);
      throw coreError;
    }
  }
}

/**
 * What a boundary error says in a log file, which is not always what it says
 * to the caller.
 *
 * A Zod failure is logged as its shape, the path and code of each issue, never
 * the issue messages, which a refinement authors and which can hold the Value
 * that was rejected. The thrown error keeps the full message.
 *
 * @see ../../contributing/logging.md
 */
function boundaryMessage(error: CoreError): string {
  if (!(error.cause instanceof ZodError)) {
    return error.message;
  }
  const issues = error.cause.issues.map(
    (issue) => `${issue.path.join('.') || '<root>'} (${issue.code})`
  );
  return `Validation failed at ${issues.join(', ')}`;
}
