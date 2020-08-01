import Fs from 'fs-extra';
import _ from 'lodash';
import Log from '../util/log';

/**
 * Represents a file on disk
 */
export default class File {
  protected readonly _path: string;
  // private _id!: string;

  public get path(): string {
    return this._path;
  }

  constructor(path: string) {
    this._path = path;
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
      Log.info({
        removed: excessKeys
      }, `Removed excess keys of file "${this._path}" while ${action} it`);
    }

    if (missingKeys.length > 0) {
      _.forEach(missingKeys as Array<keyof Partial<T>>, ((key) => {
        content[key] = reference[key];
      }));
      Log.warn({
        added: _.map(missingKeys as Array<keyof Partial<T>>, (key) => {
          return {
            key,
            value: reference[key]
          };
        })
      }, `Added missing keys of file "${this._path}" while ${action} it`);
    }
    
    return content as T;
  }
}