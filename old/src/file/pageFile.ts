import JsonFile from './jsonFile';
import { PageFileContent } from '../page';
import * as Util from '../util/general';
import * as Validator from '../util/validator';
import Logger from '../logger/logger';

/**
 * Represents a file on disk that contains information about a page
 */
export default class PageFile extends JsonFile {
  public readonly defaultContent: PageFileContent = new PageFileContent();

  constructor(projectId: string, pageId: string, language: string, logger: Logger) {
    super(Util.pathTo.page(projectId, pageId, language), logger);
    Validator.checkLanguageTag(language);
  }

  public async load(): Promise<PageFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(content: PageFileContent): Promise<void> {
    await super.save(this.heal(content, this.defaultContent, 'saving'));
  }
}