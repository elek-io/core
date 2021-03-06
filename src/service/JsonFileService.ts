import { ElekIoCoreOptions, JsonOf } from '../../type/general';
import { CrudService, ServiceType } from '../../type/service';
import AbstractFileService from './AbstractFileService';
import EventService from './EventService';

/**
 * Service that manages CRUD functionality for JSON files on disk
 */
export default class JsonFileService extends AbstractFileService implements CrudService {

  constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super(ServiceType.JSON_FILE, options, eventService);
  }

  public async create<T>(data: T, path: string): Promise<void> {
    await super.create(this.serialize<T>(data), path);
  }

  public async read<T>(path: string): Promise<JsonOf<T>> {
    return this.deserialize<T>(await super.read(path));
  }

  public async update<T>(data: T, path: string): Promise<void> {
    await super.update(this.serialize<T>(data), path);
  }

  private serialize<T>(data: T): string {
    return JSON.stringify(data, null, 2);
  }

  private deserialize<T>(data: string): JsonOf<T> {
    return JSON.parse(data);
  }
}