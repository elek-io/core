import Fs from 'fs-extra';
import AbstractService from './AbstractService';
import EventService from './EventService';

export default abstract class AbstractFileService extends AbstractService {
  private eventService: EventService;

  protected constructor(type: ServiceType, options: ElekIoCoreOptions, eventService: EventService) {
    super(type, options);

    this.eventService = eventService;
  }

  /**
   * Creates a new file on disk. Fails if path already exists
   * 
   * @param data Data to write
   * @param path Path to write to
   */
  protected async create(data: any, path: string): Promise<void> {
    await Fs.writeFile(path, data, {
      flag: 'wx'
    });
    this.eventService.emit(`${this.type}:create`, {
      data: {
        path,
        data
      }
    });
  }

  /**
   * Reads the content of a file on disk. Fails if path does not exist
   * 
   * @param path Path to read from
   */
  protected async read(path: string): Promise<any> {
    const data = await Fs.readFile(path, {
      flag: 'r'
    });
    this.eventService.emit(`${this.type}:read`, {
      data: {
        path,
        data
      }
    });
    return data;
  }

  /**
   * Overwrites an existing file on disk
   * 
   * @todo Check how to error out if the file does not exist
   * 
   * @param data Data to write
   * @param path Path to write to
   */
  protected async update(data: any, path: string): Promise<void> {
    await Fs.writeFile(path, data, {
      flag: 'w'
    });
    this.eventService.emit(`${this.type}:update`, {
      data: {
        path,
        data
      }
    });
  }

  /**
   * Deletes a file from disk. Fails if path does not exist
   * 
   * @param path Path to delete
   */
  public async delete(path: string): Promise<void> {
    await Fs.remove(path);
    this.eventService.emit(`${this.type}:delete`, {
      data: {
        path
      }
    });
  }
}
