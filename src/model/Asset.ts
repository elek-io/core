import AbstractModelWithLanguage from './AbstractModelWithLanguage';

/**
 * The asset represents an external file like image, PDF or ZIP,
 * that was added to a projects LFS and contains meta information
 * about that file
 */
export default class Asset extends AbstractModelWithLanguage {
  public name: string;
  public description: string;
  /**
   * Relative path from elek.io working directory
   * to the actual asset file inside the projects LFS
   */
  public readonly path: string;

  constructor(id: string, language: string, name: string, description: string, path: string) {
    super(id, language, 'asset');
    
    this.name = name;
    this.description = description;
    this.path = path;
  }
}