import Fs from 'fs-extra';
import _ from 'lodash';
import * as Util from '../util';
import * as Validate from '../validate';
import Logger from '../logger';

/**
 * Represents a file on disk
 * 
 * @todo check how to use the projects logger here
 * instead of using the console
 */
export default class File {
  private _path: string;
  private _relativePath: string;
  private _name!: string;
  private _extension: string | null = null;
  private _projectId: string | null = null;
  private _logger!: Logger;

  /**
   * Absolute path, potentially including some user information
   */
  public get path(): string {
    return this._path;
  }

  /**
   * Relative path from the elek.io working directory
   */
  public get relativePath(): string {
    return this._relativePath;
  }

  public get name(): string {
    return this._name;
  }

  public get extension(): string | null {
    return this._extension;
  }

  public get projectId(): string | null {
    return this._projectId;
  }

  public get logger(): Logger {
    return this._logger;
  }

  constructor(path: string) {
    this._path = path;
    this._relativePath = this._path.replace(Util.workingDirectory, '');
    
    this.parsePath();
  }

  /**
   * Loads the files content and returns it as string
   */
  protected async read(): Promise<string> {
    return (await Fs.readFile(this._path)).toString();
  }

  /**
   * Writes given content to the file
   * 
   * @param content the content to save
   */
  protected async write(content: string): Promise<void> {
    await Fs.writeFile(this._path, content);
  }

  public async delete(): Promise<void> {
    await Fs.remove(this._path);
  }

  // public async isLocked(): Promise<boolean> {
  //   return false;
  // }

  /**
   * Heals given content by removing excess and adding missing keys
   * 
   * Files can have excess and missing keys for multiple reasons:
   * - an update removes old or introduces new keys (although this should be done by the update prrocess itself)
   * - the user modified it manually and messed up
   * 
   * This method tries to handle these situations without throwing an error.
   * 
   * @todo Check if it behaves correctly / write extensive tests
   * 
   * @param content potentially incompatible content
   * @param reference reference to check the content against
   * @param action context in which this method is used (used to improve logging messages)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  protected heal<T>(content: any, reference: T, action: 'loading' | 'saving'): T {
    const missingKeys = _.difference(_.keys(reference), _.keys(content));
    const excessKeys = _.difference(_.keys(content), _.keys(reference));

    if (excessKeys.length > 0) {
      _.forEach(excessKeys, (key) => {
        delete content[key];
      });
      this.logger.log.info(excessKeys, `Removed excess keys of file "${this._path}" while ${action} it`);
    }

    if (missingKeys.length > 0) {
      _.forEach(missingKeys as Array<keyof Partial<T>>, ((key) => {
        content[key] = reference[key];
      }));
      this.logger.log.warn(_.map(missingKeys as Array<keyof Partial<T>>, (key) => {
        return {
          key,
          value: reference[key]
        };
      }), `Added missing keys of file "${this._path}" while ${action} it`);
    }
    
    return content as T;
  }

  /**
   * Parses the full path and populates this objects properties
   * with additional information
   */
  private parsePath() {
    // Filter out empty strings from parts and reverse the array,
    // so that the file itself is first
    // @example relativePath could be "projects/758359ae-e8d0-49ef-bdc1-8a22f3d4907c/theme/package.json"
    const pathArray = this._relativePath.split('/').filter((part) => {
      if (part.trim() !== '') {
        return true;
      }
      return false;
    }).reverse();

    // Extract the files name and extension if available
    if (pathArray[0].includes('.')) {
      const fileArray = pathArray[0].split('.');
      this._name = fileArray[0];
      this._extension = fileArray[1];
    } else {
      this._name = pathArray[0];
    }
    // Remove this part from the array
    pathArray.shift();

    // Iterate over all parts and check for potential UUIDs
    for (let index = 0; index < pathArray.length; index++) {
      const part = pathArray[index];
      if (Validate.uuid(part)) {
        // First ID should be the project ID
        if (!this._projectId) {
          this._projectId = part;
          // Log to project
          this._logger = new Logger(this._projectId);
        }
      }
    }

    // Log to global if no project ID was found
    if (!this._projectId) {
      this._logger = new Logger();
    }
  }
}