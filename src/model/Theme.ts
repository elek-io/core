import { ModelType } from '../../type/model';
import { ThemeLayout } from '../../type/theme';

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
  public readonly layouts: ThemeLayout[];
  // public readonly scripts: {
  //   serve: string;
  //   build: string;
  // };
  public readonly exportFile = '.elek.io/project.json';
  public readonly buildDir = 'dist';

  constructor(name: string, description: string, version: string, homepage: string, repository: string, author: string, license: string, layouts: ThemeLayout[]) {
    this.name = name;
    this.description = description;
    this.version = version;
    this.homepage = homepage;
    this.repository = repository;
    this.author = author;
    this.license = license;
    this.layouts = layouts;
  }
}