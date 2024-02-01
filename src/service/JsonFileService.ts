import {
  serviceTypeSchema,
  type BaseFile,
  type ElekIoCoreOptions,
  type UserFile,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import type { z } from 'zod';
import AbstractCrudService from './AbstractCrudService.js';

/**
 * Service that manages CRUD functionality for JSON files on disk
 */
export default class JsonFileService extends AbstractCrudService {
  private cache: Map<string, any> = new Map();

  constructor(options: ElekIoCoreOptions) {
    super(serviceTypeSchema.Enum.JsonFile, options);
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
    this.cache.set(path, parsedData);

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
    if (this.cache.has(path)) {
      // console.log(`Cache hit for "${path}"`);
      return this.cache.get(path);
    }

    // console.log(`Cache miss for "${path}"`);
    const data = await Fs.readFile(path, {
      flag: 'r',
      encoding: 'utf8',
    });
    const json = this.deserialize(data);
    const parsedData = schema.parse(json);
    this.cache.set(path, parsedData);

    return parsedData;
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
    this.cache.set(path, parsedData);

    return parsedData;
  }

  private serialize(data: unknown): string {
    return JSON.stringify(data, null, this.options.file.json.indentation);
  }

  private deserialize(data: string): unknown {
    return JSON.parse(data);
  }
}
