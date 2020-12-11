import { MdFileContent } from '../../type/file';
import { ElekIoCoreOptions } from '../../type/general';
import AbstractFileService from './AbstractFileService';
import EventService from './EventService';

/**
 * Service that manages CRUD functionality for Markdown files on disk
 * 
 * @todo The serialize and deserialize methods use tripple dashes for
 * seperating the JSON header from it's Mardown body. But Markdown uses
 * tripple dashes for horizontal lines. So we should use something else.
 */
export default class MdFileService extends AbstractFileService {

  /**
   * Creates a new instance of the MdFileService which
   * inherits the type and options properties from AbstractService
   * as well as CRUD methods for basic file access from AbstractFileService
   * 
   * @param options 
   * @param eventService 
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super('mdFile', options, eventService);
  }

  public async create(data: MdFileContent, path: string): Promise<void> {
    await super.create(this.serialize(data), path);
  }

  public async read(path: string): Promise<MdFileContent> {
    const source = await super.read(path);
    return this.deserialize(source);
  }

  public async update(data: MdFileContent, path: string): Promise<void> {
    await super.update(this.serialize(data), path);
  }

  private serialize(data: MdFileContent): string {
    return `---
${JSON.stringify(data.jsonHeader, null, 2)}
---
${data.mdBody}`;
  }

  private deserialize(data: string): MdFileContent {
    const mdFileContent: MdFileContent = {
      jsonHeader: {},
      mdBody: data
    };
    if (data.startsWith('---')) {
      const stringHeader = data.substring(data.indexOf('---') + 3, data.lastIndexOf('---'));
      mdFileContent.jsonHeader = JSON.parse(stringHeader);
      mdFileContent.mdBody = data.substring(data.lastIndexOf('---') + 3).trim();
    }
    return mdFileContent;
  }
}
