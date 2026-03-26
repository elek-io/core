import Fs from 'fs-extra';
import type { z } from '@hono/zod-openapi';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import { serviceTypeSchema } from '../schema/serviceSchema.js';
import { CoreErrors, parseSchema, type CoreResult } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for JSON files on disk
 */
export class JsonFileService extends AbstractService {
  private cache: Map<string, unknown> = new Map();

  constructor(options: ElekIoCoreOptions, logService: LogService) {
    super(serviceTypeSchema.enum.JsonFile, options, logService);
  }

  /**
   * Creates a new file on disk. Fails if path already exists
   *
   * @param data Data to write into the file
   * @param path Path to write the file to
   * @param schema Schema of the file to validate against
   * @returns Validated content of the file from disk
   */
  public create<T extends z.ZodTypeAny>(
    data: unknown,
    path: string,
    schema: T
  ): CoreResult<z.output<T>> {
    const parsed = parseSchema(schema, data);
    if (parsed.isErr()) {
      return this.logged('create', errAsync(parsed.error));
    }
    const parsedData = parsed.value as z.output<T>;
    const string = this.serialize(parsedData);
    return this.logged(
      'create',
      ResultAsync.fromPromise(
        Fs.writeFile(path, string, { flag: 'wx', encoding: 'utf8' }),
        CoreErrors.fromUnknown
      ).map(() => {
        if (this.options.file.cache === true) {
          this.cache.set(path, parsedData);
        }
        this.logService.debug({
          source: 'core',
          message: `Created file "${path}"`,
        });
        return parsedData;
      })
    );
  }

  /**
   * Reads the content of a file on disk. Fails if path does not exist
   *
   * @param path Path to read the file from
   * @param schema Schema of the file to validate against
   * @returns Validated content of the file from disk
   */
  public read<T extends z.ZodTypeAny>(
    path: string,
    schema: T
  ): CoreResult<z.output<T>> {
    if (this.options.file.cache === true && this.cache.has(path)) {
      this.logService.debug({
        source: 'core',
        message: `Cache hit reading file "${path}"`,
      });
      const json = this.cache.get(path);
      const parsed = parseSchema(schema, json);
      if (parsed.isErr()) return this.logged('read', errAsync(parsed.error));
      return this.logged('read', okAsync(parsed.value as z.output<T>));
    }

    this.logService.debug({
      source: 'core',
      message: `Cache miss reading file "${path}"`,
    });
    return this.logged(
      'read',
      ResultAsync.fromPromise(
        Fs.readFile(path, { flag: 'r', encoding: 'utf8' }),
        CoreErrors.fromUnknown
      ).andThen((data) => {
        const json = this.deserialize(data);
        const parsed = parseSchema(schema, json);
        if (parsed.isErr()) return errAsync(parsed.error);
        const value = parsed.value as z.output<T>;
        if (this.options.file.cache === true) {
          this.cache.set(path, value);
        }
        return okAsync(value);
      })
    );
  }

  /**
   * Reads the content of a file on disk. Fails if path does not exist.
   * Does not validate the content of the file against a schema and
   * therefore is only to be used when retrieving data we do not have
   * a current schema for. E.g. reading from history or while upgrading
   * the old schema of a file to a new, current schema.
   *
   * Does not read from or write to cache.
   *
   * @param path Path to read the file from
   * @returns Unvalidated content of the file from disk
   */
  public unsafeRead(path: string): CoreResult<unknown> {
    return this.logged(
      'unsafeRead',
      ResultAsync.fromPromise(
        Fs.readFile(path, { flag: 'r', encoding: 'utf8' }),
        CoreErrors.fromUnknown
      ).map((data) => {
        this.logService.warn({
          source: 'core',
          message: `Unsafe reading of file "${path}"`,
        });
        return this.deserialize(data);
      })
    );
  }

  /**
   * Overwrites an existing file on disk
   *
   * @todo Check how to error out if the file does not exist already
   *
   * @param data Data to write into the file
   * @param path Path to the file to overwrite
   * @param schema Schema of the file to validate against
   * @returns Validated content of the file from disk
   */
  public update<T extends z.ZodTypeAny>(
    data: unknown,
    path: string,
    schema: T
  ): CoreResult<z.output<T>> {
    const parsed = parseSchema(schema, data);
    if (parsed.isErr()) {
      return this.logged('update', errAsync(parsed.error));
    }
    const parsedData = parsed.value as z.output<T>;
    const string = this.serialize(parsedData);
    return this.logged(
      'update',
      ResultAsync.fromPromise(
        Fs.writeFile(path, string, { flag: 'w', encoding: 'utf8' }),
        CoreErrors.fromUnknown
      ).map(() => {
        if (this.options.file.cache === true) {
          this.cache.set(path, parsedData);
        }
        this.logService.debug({
          source: 'core',
          message: `Updated file "${path}"`,
        });
        return parsedData;
      })
    );
  }

  /**
   * Clears the in-memory file cache.
   *
   * Should be called after operations that modify files outside
   * of JsonFileService (e.g. git reset --hard HEAD), since the
   * cache may hold stale data that no longer matches disk.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  private serialize(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  private deserialize(data: string): unknown {
    return JSON.parse(data);
  }
}
