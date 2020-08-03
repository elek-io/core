import ClassNotInitializedError from './error/classNotInitialized';
import ClassReinitializedError from './error/classReinitialized';

/**
 * Base class that that can be extended on
 */
export default class Base {
  protected _id: string | null = null;

  public get id(): string {
    return this.checkInitialization(this._id);
  }

  /**
   * Checks if value is undefined or null and throws an error if true.
   * Otherwise returns the value.
   * 
   * @param value value to check
   */
  protected checkInitialization<T>(value: T): NonNullable<T> {
    if (value === undefined || value === null) {
      throw new ClassNotInitializedError('Tried accessing class member before using create() or load() methods');
    }
    return value as NonNullable<T>;
  }

  /**
   * Checks if the ID is already set and throws an error if true.
   */
  protected checkReinitialization(): void {
    if (this._id) {
      throw new ClassReinitializedError('Already initialized. Reinitialization is not allowed. Please delete() the old and then create() a new one instead.');
    }
  }
}