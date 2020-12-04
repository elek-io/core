import File from './file';
import Logger from '../logger/logger';

export interface MarkdownFileContent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  header: any;
  body: string;
}

/**
 * Represents a file on disk that contains Markdown and an optional JSON header
 */
export default abstract class MdFile extends File {

  constructor(path: string, logger: Logger) {
    super(path, logger);
  }

  /**
   * Loads the files content, parses the JSON header if present and returns an object
   */
  public async load(): Promise<MarkdownFileContent>{
    let body = await super.read();
    let header = '';
    if (body.startsWith('---')) {
      header = JSON.parse(body.substring(
        body.indexOf('---') + 3, 
        body.lastIndexOf('---')
      ));
      body = body.substring(body.lastIndexOf('---') + 3);
    }
    return {
      header,
      body
    };
  }

  /**
   * Saves given JSON content by writing it to the file
   * 
   * @param content the JSON content to save
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public async save(content: MarkdownFileContent): Promise<void> {
    await super.write(`---
${JSON.stringify(content.header, null, 2)}
---
${content.body}`);
  }
}