import { Subject } from 'rxjs';
import ElekIoCoreEvent from '../model/ElekIoCoreEvent';
import Project from '../model/Project';
import AbstractService from './AbstractService';
import LogService from './LogService';

export default class EventService extends AbstractService {
  public readonly events = new Subject<ElekIoCoreEvent>();
  private logService: LogService;

  constructor(logService: LogService) {
    super('event');

    this.logService = logService;
    this.events.subscribe(this.onEvent);
  }

  /**
   * Emits a new ElekIoCoreEvent to all it's subscribers
   * 
   * @param id ID describing the event divided by colons. E.g.: "page:create"
   * @param project Optional project this event was triggered from
   * @param data Optional additional object all subscribers have access to
   */
  public emit(id: string, optional?: {project?: Project, data?: Record<string, unknown>}): void {
    this.events.next(new ElekIoCoreEvent(id, optional));
  }

  /**
   * Executed every time an event is fired,
   * this method allows for general logging and more
   * 
   * @todo check why logService is undefined here after the constructor was clearly called
   * 
   * @param event The event that was triggered
   */
  private onEvent(event: ElekIoCoreEvent) {
    // if (event.project) {
    //   this.logService.project(event.project.id).log.info(event);
    // } else {
    //   this.logService.global.log.info(event);
    // }
  }
}