import Fs from 'fs-extra';
import { ServiceType } from '../../types';
import AbstractService from './AbstractService';
import EventService from './EventService';

export default abstract class AbstractFileService extends AbstractService {
  public readonly eventService: EventService;

  constructor(type: ServiceType, eventService: EventService) {
    super(type);

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
    this.eventService.events.next({ id: `${this.type}:create`, title: 'some.translatable.string', data: {
      path,
      data
    }});
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
    this.eventService.events.next({ id: `${this.type}:read`, title: 'some.translatable.string', data: {
      path,
      data
    }});
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
    this.eventService.events.next({ id: `${this.type}:update`, title: 'some.translatable.string', data: {
      path,
      data
    }});
  }

  /**
   * Deletes a file from disk. Fails if path does not exist
   * 
   * @param path Path to delete
   */
  public async delete(path: string): Promise<void> {
    await Fs.remove(path);
    this.eventService.events.next({ id: `${this.type}:delete`, title: 'some.translatable.string', data: {
      path
    }});
  }
}