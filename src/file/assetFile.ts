import JsonFile from './jsonFile';
import * as Util from '../util/general';
import { locale } from '../util/validate';
import Logger from '../logger/logger';

export class AssetFileConfig {
  public name = '';
  public description = '';
  public mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
}
export type AssetFileConfigKey = keyof AssetFileConfig;

export class AssetFileContent extends AssetFileConfig {
  public data = '';
}

/**
 * Represents a file on disk that contains information about 
 * an asset like image, video etc. and the actual data of the file too.
 * 
 * @todo check how bigger files like videos are handled. 
 * Do they clog the clients memory?
 */
export default class AssetFile extends JsonFile {
  public readonly defaultContent: AssetFileContent = new AssetFileContent();

  constructor(projectId: string, assetId: string, language: string, logger: Logger) {
    super(Util.pathTo.asset(projectId, assetId, language), logger);
    if (locale(language) !== true) {
      throw new Error(`Provided language tag "${language}" is not BCP 47 compliant`);
    }
  }

  public async load(): Promise<AssetFileContent> {
    const content = this.heal(await super.load(), this.defaultContent, 'loading');
    // Decode the Base64 encoded string
    content.data = Buffer.from(content.data, 'base64').toString();
    return content;
  }

  public async save(content: AssetFileContent): Promise<void> {
    // Base64 encode the data to be able to save it to JSON
    content.data = Buffer.from(content.data).toString('base64');
    await super.save(this.heal(content, this.defaultContent, 'saving'));
  }
}