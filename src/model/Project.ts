import { ProjectStatus } from '../../type/project';
import AbstractModel from './AbstractModel';

/**
 * The project represents a projects configuration file on disk
 */
export default class Project extends AbstractModel {
  public name: string;
  public description: string;
  public version = '0.1.0';
  public status: ProjectStatus = 'todo';

  constructor(id: string, name: string, description: string) {
    super(id, 'project');
    
    this.name = name;
    this.description = description;
  }
}