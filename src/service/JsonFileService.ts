import Fs from 'fs-extra';
import Path from 'node:path';
import type { z } from '@hono/zod-openapi';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import { serviceTypeSchema } from '../schema/serviceSchema.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';
import { isFileNotFound, type PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';

/**
 * The one chokepoint every JSON file write and delete in Core goes through,
 * which is what lets a mutation be logged in a single place.
 *
 * It holds a path-keyed in-memory cache shared by every service, correct only
 * while nothing outside it touches the files. Anything that moves the working
 * tree from underneath it, a pull or a rebase, has to `clearCache()`.
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
    const data = await this.readFile(path);
    const json = this.deserialize(data, path);
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
   * @returns Unvalidated content of the file from disk
   */
  public async unsafeRead(path: string): Promise<unknown> {
    const data = await this.readFile(path);
    this.logService.warn({
      source: 'core',
      message: `Unsafe reading of file "${path}"`,
      meta: { 'file.path': path },
    });
    return this.deserialize(data, path);
  }

  /**
   * Overwrites an existing file on disk
   *
   * Creates the file when it does not exist, which is what the slug index
   * write in `AbstractSlugIndexedEntityService` relies on.
   *
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

  /**
   * Reads a file, answering a missing one with `CoreError.notFound`.
   *
   * This is the one place that knows a file is not there, and every entity
   * read reaches it, so it is where the `NotFound` in the error table comes
   * from. Without it Node's raw `ENOENT` travelled up to `fromUnknown`,
   * which types everything it does not recognise as `Internal`, and a
   * missing Entry answered 500.
   *
   * @see ../../docs/error-handling.md
   */
  private async readFile(path: string): Promise<string> {
    try {
      return await Fs.readFile(path, { flag: 'r', encoding: 'utf8' });
    } catch (error) {
      if (isFileNotFound(error)) {
        throw CoreError.notFound(`File "${path}" does not exist`);
      }
      throw error;
    }
  }

  private serialize(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Parses a file's content, naming the file rather than quoting it.
   *
   * V8 quotes a window of the input back in its own parse failure, and for
   * an entity file that window is authored content. The path says which
   * file broke, the cause keeps what V8 said for whoever debugs it.
   *
   * @see ../../contributing/logging.md
   */
  private deserialize(data: string, path: string): unknown {
    try {
      return JSON.parse(data);
    } catch (error) {
      throw CoreError.internal(
        `File "${path}" does not hold valid JSON`,
        error
      );
    }
  }
}
