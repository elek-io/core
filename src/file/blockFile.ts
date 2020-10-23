import MdFile, { MarkdownFileContent } from './mdFile';
import { BlockFileHeader } from '../block';
import * as Util from '../util/general';
import * as Validator from '../util/validator';
import Logger from '../logger/logger';

export interface BlockFileContent extends MarkdownFileContent {
  header: BlockFileHeader,
  body: string
}

export default class BlockFile extends MdFile {
  public readonly defaultHeader: BlockFileHeader = new BlockFileHeader();

  constructor(projectId: string, blockId: string, language: string, logger: Logger) {
    super(Util.pathTo.block(projectId, blockId, language), logger);
    Validator.checkLanguageTag(language);
  }

  public async load(): Promise<BlockFileContent> {
    const content = await super.load();
    return {
      header: this.heal(content.header, this.defaultHeader, 'loading'),
      body: content.body
    };
  }

  public async save(content: BlockFileContent): Promise<void> {
    await super.save({
      header: this.heal(content.header, this.defaultHeader, 'saving'),
      body: content.body
    });
  }
}