import Base from './base';
import Project from './project';
import Asset from './asset';
import Snapshot from './snapshot';
import Block from './block';
import Page from './page';
import Theme from './theme';

export type ProjectItemType = Asset | Block | Page | Snapshot | Theme;
export type ProjectItemTypeAsString = 'asset' | 'block' | 'page' | 'snapshot' | 'theme';

export default abstract class ProjectItem extends Base {
  private _project: Project;
  private _type: ProjectItemTypeAsString;
  protected _language: string | null = null;

  public get project(): Project {
    return this._project;
  }

  public get type(): ProjectItemTypeAsString {
    return this._type;
  }

  public get language(): string {
    return this.checkInitialization(this._language);
  }

  constructor(project: Project, type: ProjectItemTypeAsString) {
    super();
    this._project = project;
    this._type = type;
  }

  /**
   * Adds the current project item object (this) to the project
   * if it does not exist there yet
   * 
   * @todo find a typescript valid solution for this functionality
   */
  protected addToProject(): void {
    const list = this.getListOfType();
    const listIndex = this.findIndexOfItemObject();
    if (listIndex === -1) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      list.push(this);
    }
  }
  
  /**
   * Removes the current project item object (this) from the project
   * and throws an error if it does not exist
   */
  protected removeFromProject(): void {
    const list = this.getListOfType();
    const listIndex = this.findIndexOfItemObject();
    if (listIndex === -1) {
      throw new Error(`Tried removing an non existing ${this._type} from the project`);
    }
    list.splice(listIndex, 1);
  }

  private findIndexOfItemObject(): number {
    const list = this.getListOfType();
    return list.findIndex((listItem: Asset | Block | Page | Snapshot) => {
      // If language is available, the object is only uniquely identifiable
      // when the language is checked too
      if (this._language) {
        return listItem.id === this.id && listItem.language === this._language;
      }
      return listItem.id === this.id;
    });
  }

  private getListOfType() {
    switch (this._type) {
    case 'asset':
      return this.project.assets;
    case 'block':
      return this.project.blocks;
    case 'page':
      return this.project.pages;
    case 'snapshot':
      return this.project.snapshots;
    default:
      throw new Error(`Unable to get list of type "${this._type}" from project`);
    }
  }
}