import { ModelType } from '../../type/model';

/**
 * A theme is the websites structure and design
 * in which content will be injected into
 */
export default class Theme {
  /**
   * The type of this model
   */
  public readonly type: ModelType = 'theme';
  public readonly name: string;
  public readonly description: string;
  public readonly version: string;
  public readonly homepage: string;
  public readonly repository: string;
  public readonly author: string;
  public readonly license: string;
  // public readonly navigations = [];
  // public readonly layouts = [];
  // public readonly scripts: {
  //   serve: string;
  //   build: string;
  // };
  public readonly exportFile = '.elek.io/project.json';
  public readonly buildDir = 'dist';

  constructor(id: string, language: string, name: string, description: string) {
    this.name = name;
    this.description = description;
  }
}