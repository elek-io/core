import Fs from 'fs-extra';
import _ from 'lodash';
import * as Util from '../util/general';
import Logger from '../logger/logger';

/**
 * Represents a file on disk
 */
export default abstract class File {
  private _path: string;
  private _relativePath: string;
  private _name: string;
  private _extension: string | null = null;
  private _logger: Logger;

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

  protected get logger(): Logger {
    return this._logger;
  }

  constructor(path: string, logger: Logger) {
    this._path = path;
    this._logger = logger;

    this._relativePath = this.getRelativePath();
    const pathArray = this._relativePath.split('/');
    const lastPart = pathArray[pathArray.length - 1];
    
    // Extract the files name and extension if available
    if (lastPart.includes('.')) {
      const fileArray = lastPart.split('.');
      switch (fileArray.length) {
      case 1:
        this._name = fileArray[0];
        break;
      case 2:
        this._name = fileArray[0];
        this._extension = fileArray[1];
        break;
      case 3:
        this._name = fileArray[0];
        this._extension = fileArray[2];
        break;
      default:
        throw new Error();
      }
    } else {
      this._name = lastPart;
    }
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

  private getRelativePath(): string {
    let relativePath = this._path.replace(Util.workingDirectory, '');
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substr(1);
    }
    return relativePath;
  }
}