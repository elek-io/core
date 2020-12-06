import AbstractFileService from './AbstractFileService';
import EventService from './EventService';

export default class JsonFileService extends AbstractFileService {

  constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super('jsonFile', options, eventService);
  }

  public async create(data: any, path: string): Promise<void> {
    await super.create(this.serialize(data), path);
  }

  public async read(path: string): Promise<any> {
    return this.deserialize(await super.read(path));
  }

  public async update(data: any, path: string): Promise<void> {
    await super.update(this.serialize(data), path);
  }

  private serialize(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  private deserialize(data: string): any {
    return JSON.parse(data);
  }
}