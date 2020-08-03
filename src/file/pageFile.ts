import JsonFile from './jsonFile';
import { PageFileContent } from '../page';
import * as Util from '../util';
import * as Validate from '../validate';

/**
 * Represents a file on disk that contains information about a page
 */
export default class PageFile extends JsonFile {
  public readonly defaultContent: PageFileContent = new PageFileContent();

  constructor(projectId: string, pageId: string, language: string) {
    super(Util.pathTo.page(projectId, pageId, language));
    if (Validate.locale(language) !== true) {
      throw new Error(`Provided language tag "${language}" is not BCP 47 compliant`);
    }
  }

  public async load(): Promise<PageFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(content: PageFileContent): Promise<void> {
    await super.save(this.heal(content, this.defaultContent, 'saving'));
  }
}