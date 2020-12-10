import { PageContentReference, PageStatus } from '../../type/page';
import AbstractModelWithLanguage from './AbstractModelWithLanguage';

/**
 * The page represents a uniquely identifiable site of a website
 * that is available via an URL
 */
export default class Page extends AbstractModelWithLanguage {
  public name: string;
  public status: PageStatus = 'private';
  public uriPath = '';
  public content: PageContentReference[] = [];

  constructor(id: string, language: string, name: string) {
    super(id, language, 'page');
    
    this.name = name;
  }
}