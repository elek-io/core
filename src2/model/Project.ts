import AbstractModel from './AbstractModel';

/**
 * The project represents a projects configuration file on disk
 */
export default class Project extends AbstractModel {
  public name: string;
  public description: string;
  public version: string;
  public status: ProjectStatus;

  constructor(id: string, name: string, description: string, version = '0.1.0', status: ProjectStatus = 'foo') {
    super(id, 'project');
    
    this.name = name;
    this.description = description;
    this.version = version;
    this.status = status;
  }
}