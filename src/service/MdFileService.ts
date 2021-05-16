import { MdFileContent } from '../../type/file';
import { ElekIoCoreOptions } from '../../type/general';
import { CrudService, ServiceType } from '../../type/service';
import AbstractFileService from './AbstractFileService';
import EventService from './EventService';

/**
 * Service that manages CRUD functionality for Markdown files on disk
 */
export default class MdFileService extends AbstractFileService implements CrudService {

  constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super(ServiceType.MD_FILE, options, eventService);
  }

  public async create<T>(data: MdFileContent<T>, path: string): Promise<void> {
    await super.create(this.serialize<T>(data), path);
  }

  public async read<T>(path: string): Promise<MdFileContent<T>> {
    const source = await super.read(path);
    return this.deserialize<T>(source);
  }

  public async update<T>(data: MdFileContent<T>, path: string): Promise<void> {
    await super.update(this.serialize<T>(data), path);
  }

  private serialize<T>(data: MdFileContent<T>): string {
    return `${this.options.file.md.delimiter}\n${JSON.stringify(data.jsonHeader, null, 2)}\n${this.options.file.md.delimiter}\n${data.mdBody}`;
  }

  private deserialize<T>(data: string): MdFileContent<T> {
    if (data.startsWith(this.options.file.md.delimiter) === false) {
      throw new Error(`Could not deserialize data from Markdown file because it is missing a delimiter "${this.options.file.md.delimiter}"`);
    }
    const stringHeader = data.substring(data.indexOf(this.options.file.md.delimiter) + this.options.file.md.delimiter.length, data.lastIndexOf(this.options.file.md.delimiter));
    const mdFileContent: MdFileContent<T> = {
      jsonHeader: JSON.parse(stringHeader),
      mdBody: data.substring(data.lastIndexOf(this.options.file.md.delimiter) + this.options.file.md.delimiter.length).trim()
    };
    return mdFileContent;
  }
}
