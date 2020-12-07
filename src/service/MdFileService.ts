import AbstractFileService from './AbstractFileService';
import EventService from './EventService';

export default class MdFileService extends AbstractFileService {

  constructor(options: ElekIoCoreOptions ,eventService: EventService) {
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
      mdFileContent.mdBody = data.substring(data.lastIndexOf('---'));
    }
    return mdFileContent;
  }
}
