import Project from './project';
import Asset from './asset';
import Snapshot from './snapshot';
import Block from './block';
import Page from './page';
import Theme from './theme';
import { ProjectItemType, ProjectItemTypeAsString } from './projectItem';

export default class ProjectItemFactory {
  private _project: Project;

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Instantiates a new project item by given type in string representation
   * 
   * @todo can we return a specific type by overloading?
   * 
   * @param type string representation of the project items type
   */
  public create(type: ProjectItemTypeAsString): ProjectItemType {
    switch (type) {
    case 'asset':
      return new Asset(this._project);
    case 'block':
      return new Block(this._project);
    case 'page':
      return new Page(this._project);
    case 'snapshot':
      return new Snapshot(this._project);
    case 'theme':
      return new Theme(this._project);
    default:
      throw new Error(`Unable to create project item of type "${type}"`);
    }
  }
}