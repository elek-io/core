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
  }

  /**
   * Emits a new ElekIoCoreEvent to all it's subscribers
   * 
   * @param id ID describing the event divided by colons. E.g.: "page:create"
   * @param project Optional project this event was triggered from
   * @param data Optional additional object all subscribers have access to
   */
  public emit(id: string, optional?: {project?: Project, data?: Record<string, unknown>}): void {
    const event = new ElekIoCoreEvent(id, optional);

    // Logging
    if (event.project) {
      this.logService.project(event.project.id).log.info(event);
    } else {
      this.logService.global.log.info(event);
    }

    this.events.next(event);
  }
}