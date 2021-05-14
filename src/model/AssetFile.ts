import { SupportedExtension, SupportedMimeType } from '../../type/asset';
import { ModelType } from '../../type/model';
import AbstractModelWithLanguage from './AbstractModelWithLanguage';

/**
 * Represents the JSON file saved inside the projects assets folder
 */
export default class AssetFile extends AbstractModelWithLanguage {
  public name: string;
  public description: string;
  public readonly extension: SupportedExtension;
  public readonly mimeType: SupportedMimeType;

  constructor(id: string, language: string, name: string, description: string, extension: SupportedExtension, mimeType: SupportedMimeType) {
    super(id, language, ModelType.ASSET);
    
    this.name = name;
    this.description = description;
    this.extension = extension;
    this.mimeType = mimeType;
  }
}