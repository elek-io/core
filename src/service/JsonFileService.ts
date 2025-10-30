import Fs from 'fs-extra';
import type { z } from '@hono/zod-openapi';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import type { BaseFile } from '../schema/fileSchema.js';
import { serviceTypeSchema } from '../schema/serviceSchema.js';
import type { UserFile } from '../schema/userSchema.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import type { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for JSON files on disk
 */
export class JsonFileService extends AbstractCrudService {
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
  public async create<T extends z.ZodType<BaseFile>>(
    data: unknown,
    path: string,
    schema: T
  ): Promise<z.output<T>> {
    const parsedData = schema.parse(data);
    const string = this.serialize(parsedData);
    await Fs.writeFile(path, string, {
      flag: 'wx',
      encoding: 'utf8',
    });
    if (this.options.file.cache === true) {
      this.cache.set(path, parsedData);
    }
    this.logService.debug(`Created file "${path}"`);

    return parsedData;
  }

  /**
   * Reads the content of a file on disk. Fails if path does not exist
   *
   * @param path Path to read the file from
   * @param schema Schema of the file to validate against
   * @returns Validated content of the file from disk
   */
  public async read<T extends z.ZodType<BaseFile | UserFile>>(
    path: string,
    schema: T
  ): Promise<z.output<T>> {
    if (this.options.file.cache === true && this.cache.has(path)) {
      this.logService.debug(`Cache hit reading file "${path}"`);
      const json = this.cache.get(path);
      const parsedData = schema.parse(json);
      return parsedData;
    }

    this.logService.debug(`Cache miss reading file "${path}"`);
    const data = await Fs.readFile(path, {
      flag: 'r',
      encoding: 'utf8',
    });
    const json = this.deserialize(data);
    const parsedData = schema.parse(json);
    if (this.options.file.cache === true) {
      this.cache.set(path, parsedData);
    }

    return parsedData;
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
  public async unsafeRead(path: string): Promise<unknown> {
    this.logService.warn(`Unsafe reading of file "${path}"`);
    const data = await Fs.readFile(path, {
      flag: 'r',
      encoding: 'utf8',
    });
    const json = this.deserialize(data);

    return json;
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
  public async update<T extends z.ZodType<BaseFile | UserFile>>(
    data: unknown,
    path: string,
    schema: T
  ): Promise<z.output<T>> {
    const parsedData = schema.parse(data);
    const string = this.serialize(parsedData);
    await Fs.writeFile(path, string, {
      flag: 'w',
      encoding: 'utf8',
    });
    if (this.options.file.cache === true) {
      this.cache.set(path, parsedData);
    }
    this.logService.debug(`Updated file "${path}"`);

    return parsedData;
  }

  private serialize(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  private deserialize(data: string): unknown {
    return JSON.parse(data);
  }
}
