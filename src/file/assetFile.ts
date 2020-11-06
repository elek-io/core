import JsonFile from './jsonFile';
import * as Util from '../util/general';
import * as Validator from '../util/validator';
import Logger from '../logger/logger';

export class AssetFileContent {
  public name = '';
  public description = '';
  /**
   * Relative path to the actual asset file inside LFS
   */
  public path = '';
}
export type AssetFileContentKey = keyof AssetFileContent;

/**
 * Represents a file on disk that contains additional
 * information about an asset like image, video etc.
 */
export default class AssetFile extends JsonFile {
  public readonly defaultContent: AssetFileContent = new AssetFileContent();

  constructor(projectId: string, assetId: string, language: string, logger: Logger) {
    super(Util.pathTo.asset(projectId, assetId, language), logger);
    Validator.checkLanguageTag(language);
  }

  public async load(): Promise<AssetFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(content: AssetFileContent): Promise<void> {
    await super.save(this.heal(content, this.defaultContent, 'saving'));
  }
}