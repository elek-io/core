import { Subject } from 'rxjs';
import { ElekIoCoreEvent } from '../../types';
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
   * Executed every time an event is fired,
   * this method allows for general logging and more
   * 
   * @param event The event that was triggered
   */
  private onEvent(event: ElekIoCoreEvent) {
    if (event.project) {
      this.logService.project(event.project.id).log.info(event);
    } else {
      this.logService.global.log.info(event);
    }
  }
}