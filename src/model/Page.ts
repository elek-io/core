import { ModelType } from '../../type/model';
import { PageContentReference, PageStatus } from '../../type/page';
import AbstractModelWithLanguage from './AbstractModelWithLanguage';

/**
 * The page represents a uniquely identifiable site of a website
 * that is available via an URL
 */
export default class Page extends AbstractModelWithLanguage {
  public name: string;

  public status: PageStatus = PageStatus.PRIVATE;

  /**
   * URI path this page will be available from when deployed
   * 
   * @see https://en.wikipedia.org/wiki/Uniform_Resource_Identifier#Syntax
   */
  public uriPath: string | null = null;

  /**
   * Layout ID of the theme the project uses
   */
  public layoutId: string | null = null;

  public content: PageContentReference[] = [];

  constructor(id: string, language: string, name: string) {
    super(id, language, ModelType.PAGE);
    
    this.name = name;
  }
}