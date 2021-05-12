import { Subject } from 'rxjs';
import { CoreEventName } from '../../type/coreEvent';
import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';
import CoreEvent from '../model/CoreEvent';
import Project from '../model/Project';
import AbstractService from './AbstractService';
import LogService from './LogService';
import Util from '../util';

/**
 * Service that manages subscribing and emitting events between
 * different services and outside applications like the elek.io client
 */
export default class EventService extends AbstractService {
  private readonly eventSubject = new Subject<CoreEvent>();
  private readonly logService: LogService;

  /**
   * Creates a new instance of the EventService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param logService LogService
   */
  constructor(options: ElekIoCoreOptions, logService: LogService) {
    super(ServiceType.EVENT, options);

    this.logService = logService;
  }

  /**
   * Subscribes to all events
   * 
   * @todo Should improve is a lot once we know what we need
   */
  public get on() {
    return this.eventSubject.subscribe.bind(this.eventSubject);
  }

  /**
   * Emits a new CoreEvent to all it's subscribers
   * 
   * @param name Colon separated name describing what the event is about. E.g.: "page:create"
   * @param optional Optional object containing the project this event was triggered from and an additional object all subscribers have access to
   */
  public emit(name: CoreEventName, optional?: {project?: Project, data?: Record<string, unknown>}): void {
    const id = Util.uuid();
    const event = new CoreEvent(id, name, optional);

    // Logging
    // @todo probably only relevant for debugging / not for default production
    if (event.project) {
      this.logService.project(event.project.id).log.info(event);
    } else {
      this.logService.generic.log.info(event);
    }

    this.eventSubject.next(event);
  }
}
