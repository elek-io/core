import Fs from 'fs-extra';
import { CoreEventName } from '../../type/coreEvent';
import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';
import AbstractService from './AbstractService';
import EventService from './EventService';

/**
 * A base service for all file services that provides methods to handle them
 * in a unified way
 */
export default abstract class AbstractFileService extends AbstractService {
  private eventService: EventService;

  /**
   * Do not instantiate directly as this is an abstract class
   * 
   * @param type Type of the service that inherits from this class
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   */
  protected constructor(type: ServiceType, options: ElekIoCoreOptions, eventService: EventService) {
    super(type, options);

    this.eventService = eventService;
  }

  /**
   * Creates a new file on disk. Fails if path already exists
   * 
   * @param data Data to write into the file
   * @param path Path to write the file to
   */
  protected async create(data: any, path: string): Promise<void> {
    await Fs.writeFile(path, data, {
      flag: 'wx',
      encoding: 'utf8'
    });
    this.eventService.emit(CoreEventName.FILE_CREATE, {
      data: {
        path,
        data
      }
    });
  }

  /**
   * Reads the content of a file on disk. Fails if path does not exist
   * 
   * @param path Path to read the file from
   * @returns A string containing the file content
   */
  protected async read(path: string): Promise<any> {
    const data = await Fs.readFile(path, {
      flag: 'r',
      encoding: 'utf8'
    });
    this.eventService.emit(CoreEventName.FILE_READ, {
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
   * @todo Check how to error out if the file does not exist already
   * 
   * @param data Data to write into the file
   * @param path Path to the file to overwrite
   */
  protected async update(data: any, path: string): Promise<void> {
    await Fs.writeFile(path, data, {
      flag: 'w',
      encoding: 'utf8'
    });
    this.eventService.emit(CoreEventName.FILE_UPDATE, {
      data: {
        path,
        data
      }
    });
  }

  /**
   * Deletes a file from disk. Fails if path does not exist
   * 
   * @param path Path to the file to delete
   */
  public async delete(path: string): Promise<void> {
    await Fs.remove(path);
    this.eventService.emit(CoreEventName.FILE_DELETE, {
      data: {
        path
      }
    });
  }
}
