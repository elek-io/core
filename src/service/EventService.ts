import { Subject } from 'rxjs';
import ElekIoCoreEvent from '../model/ElekIoCoreEvent';
import Project from '../model/Project';
import AbstractService from './AbstractService';
import LogService from './LogService';

/**
 * Service that manages subscribing and emitting events between
 * different services and outside applications like the elek.io client
 */
export default class EventService extends AbstractService {
  private readonly eventSubject = new Subject<ElekIoCoreEvent>();
  private readonly logService: LogService;

  /**
   * Creates a new instance of the EventService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param logService LogService
   */
  constructor(options: ElekIoCoreOptions, logService: LogService) {
    super('event', options);

    this.logService = logService;
  }

  /**
   * Subscribes to all events
   * 
   * @todo Should improve is alot once we know what we need
   */
  public get on() {
    return this.eventSubject.subscribe.bind(this.eventSubject);
  }

  /**
   * Emits a new ElekIoCoreEvent to all it's subscribers
   * 
   * @param id ID describing the event divided by colons. E.g.: "page:create"
   * @param optional Optional object containing the project this event was triggered from and an additional object all subscribers have access to
   */
  public emit(id: string, optional?: {project?: Project, data?: Record<string, unknown>}): void {
    const event = new ElekIoCoreEvent(id, optional);

    // Logging
    if (event.project) {
      this.logService.project(event.project.id).log.info(event);
    } else {
      this.logService.generic.log.info(event);
    }

    this.eventSubject.next(event);
  }
}
