import { ModelType } from '../../type/model';
import AbstractModelWithLanguage from './AbstractModelWithLanguage';

/**
 * The asset represents an external file like image, PDF or ZIP,
 * that was added to a projects LFS and contains meta information
 * about that file
 */
export default class Asset extends AbstractModelWithLanguage {
  public name: string;
  public description: string;
  public extension: string;

  constructor(id: string, language: string, name: string, description: string, extension: string) {
    super(id, language, ModelType.ASSET);
    
    this.name = name;
    this.description = description;
    this.extension = extension;
  }
}