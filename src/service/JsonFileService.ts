import Fs from 'fs-extra';
import Path from 'node:path';
import type { z } from '@hono/zod-openapi';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import { serviceTypeSchema } from '../schema/serviceSchema.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';
import type { PathTo } from '../util/node.js';

/**
 * Service that manages CRUD functionality for JSON files on disk
 */
export class JsonFileService extends AbstractService {
  private cache: Map<string, unknown> = new Map();

  constructor(
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService
  ) {
    super(serviceTypeSchema.enum.JsonFile, options, pathTo, logService);
  }

  /**
   * Creates a new file on disk. Fails if path already exists
   *
   * @param data Data to write into the file
   * @param path Path to write the file to
   * @param schema Schema of the file to validate against
   * @returns Validated content of the file from disk
   */
  public async create<T extends z.ZodTypeAny>(
    data: unknown,
    path: string,
    schema: T
  ): Promise<z.output<T>> {
    const parsedData: z.output<T> = schema.parse(data);
    const string = this.serialize(parsedData);
    await Fs.writeFile(path, string, { flag: 'wx', encoding: 'utf8' });
    if (this.options.file.cache === true) {
      this.cache.set(path, parsedData);
    }
    this.logService.info({
      source: 'core',
      message: `Created file "${path}"`,
      meta: { 'file.path': path },
    });
    return parsedData;
  }

  /**
   * Reads the content of a file on disk. Fails if path does not exist
   *
   * @param path Path to read the file from
   * @param schema Schema of the file to validate against
   * @returns Validated content of the file from disk
   */
  public async read<T extends z.ZodTypeAny>(
    path: string,
    schema: T
  ): Promise<z.output<T>> {
    if (this.options.file.cache === true && this.cache.has(path)) {
      this.logService.debug({
        source: 'core',
        message: `Cache hit reading file "${path}"`,
        meta: { 'file.path': path },
      });
      const json = this.cache.get(path);
      return schema.parse(json);
    }

    this.logService.debug({
      source: 'core',
      message: `Cache miss reading file "${path}"`,
      meta: { 'file.path': path },
    });
    const data = await Fs.readFile(path, { flag: 'r', encoding: 'utf8' });
    const json = this.deserialize(data);
    const value: z.output<T> = schema.parse(json);
    if (this.options.file.cache === true) {
      this.cache.set(path, value);
    }
    return value;
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
    const data = await Fs.readFile(path, { flag: 'r', encoding: 'utf8' });
    this.logService.warn({
      source: 'core',
      message: `Unsafe reading of file "${path}"`,
      meta: { 'file.path': path },
    });
    return this.deserialize(data);
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
  public async update<T extends z.ZodTypeAny>(
    data: unknown,
    path: string,
    schema: T
  ): Promise<z.output<T>> {
    const parsedData: z.output<T> = schema.parse(data);
    const string = this.serialize(parsedData);
    await Fs.writeFile(path, string, { flag: 'w', encoding: 'utf8' });
    if (this.options.file.cache === true) {
      this.cache.set(path, parsedData);
    }
    this.logService.info({
      source: 'core',
      message: `Updated file "${path}"`,
      meta: { 'file.path': path },
    });
    return parsedData;
  }

  /**
   * Deletes a file or a folder on disk. Does nothing if the path does not
   * exist, which is what `Fs.remove` does.
   *
   * Every service deletes through this, so a deletion is recorded in one
   * place and cannot serve what it removed: the cache is keyed by path,
   * so a file read before it was deleted would otherwise still be handed
   * out. A folder takes everything below it with it.
   *
   * @param path Path of the file or folder to delete
   */
  public async delete(path: string): Promise<void> {
    await Fs.remove(path);
    this.cache.delete(path);
    const below = path + Path.sep;
    for (const cached of this.cache.keys()) {
      if (cached.startsWith(below)) {
        this.cache.delete(cached);
      }
    }
    this.logService.info({
      source: 'core',
      message: `Deleted "${path}"`,
      meta: { 'file.path': path },
    });
  }

  /**
   * Clears the in-memory file cache.
   *
   * Should be called after operations that modify files outside
   * of JsonFileService (e.g. git pull, merge, branch switch or
   * reset --hard), since the cache may hold stale data that no
   * longer matches disk.
   */
  public clearCache(): void {
    const cleared = this.cache.size;
    this.cache.clear();
    this.logService.debug({
      source: 'core',
      message: `Cleared JSON file cache (${cleared} elements)`,
      meta: { 'elek.cache.cleared_count': cleared },
    });
  }

  private serialize(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  private deserialize(data: string): unknown {
    return JSON.parse(data);
  }
}
