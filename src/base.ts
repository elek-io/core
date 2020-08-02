import Project from './project';
import ClassNotInitializedError from './error/classNotInitialized';
import ClassReinitializedError from './error/classReinitialized';

export default class Base {
  protected _id: string | null = null;
  private _project: Project;

  public get id(): string {
    return this.checkInitialization(this._id);
  }

  public get project(): Project {
    return this._project;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Checks if value is undefined or null and throws an error if true.
   * Otherwise returns the value.
   * 
   * @param value value to check
   */
  protected checkInitialization<T>(value: T): NonNullable<T> {
    if (value === undefined || value === null) {
      throw new ClassNotInitializedError('Tried accessing class member before using create or load methods');
    }
    return value as NonNullable<T>;
  }

  /**
   * Checks if the ID is already set and throws an error if true.
   */
  protected checkReinitialization(): void {
    if (this._id) {
      throw new ClassReinitializedError('Already initialized. Reinitialization is not allowed. Please delete the old and then initialize a new one instead.');
    }
  }
}