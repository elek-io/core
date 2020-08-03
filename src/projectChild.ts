import Base from './base';
import Project from './project';
import Asset from './asset';
import Snapshot from './snapshot';
import Block from './block';
import Page from './page';

export type ProjectChildType = 'asset' | 'block' | 'page' | 'snapshot' | 'theme';

export default class ProjectChild extends Base {
  private _project: Project;
  private _type: ProjectChildType;
  protected _language: string | null = null;

  public get project(): Project {
    return this._project;
  }

  public get type(): ProjectChildType {
    return this._type;
  }

  public get language(): string {
    return this.checkInitialization(this._language);
  }

  constructor(project: Project, type: ProjectChildType) {
    super();
    this._project = project;
    this._type = type;
  }
  
  protected removeFromProject(): void {
    const list = this.getListOfType();
    const listIndex = list.findIndex((listItem: Asset | Block | Page | Snapshot) => {
      // If language is available, the object is only uniquely identifiable
      // when the language is checked too
      if (this._language) {
        return listItem.id === this.id && listItem.language === this._language;
      }
      return listItem.id === this.id;
    });
    if (listIndex === -1) {
      throw new Error(`Tried removing an non existing ${this._type} from the project`);
    }
    list.splice(listIndex, 1);
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