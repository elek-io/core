import { ModelType } from '../../type/model';
import { ProjectStatus } from '../../type/project';
import AbstractModel from './AbstractModel';

/**
 * The project represents a projects configuration file on disk
 */
export default class Project extends AbstractModel {
  public name: string;
  public description: string;

  /**
   * The version is handled automatically
   * 
   * Every time before a project is published, all commits will be iterated,
   * the version will be incremented accordingly and a new snapshot is created.
   * 
   * @todo implement this behavior
   * 
   * - `MAJOR` is incremented when the client was updated or the theme was changed or updated
   * - `MINOR` is incremented when new content is added or existing deleted
   * - `PATCH` is increment when existing content is updated
   */
  public version = '0.1.0';
  public status: ProjectStatus = 'todo';

  constructor(id: string, name: string, description: string) {
    super(id, ModelType.PROJECT);
    
    this.name = name;
    this.description = description;
  }
}