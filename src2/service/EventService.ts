import { Subject } from 'rxjs';
import AbstractService from './AbstractService';

export default class EventService extends AbstractService {
  public readonly events = new Subject<ElekIoCoreEvent>();

  constructor() {
    super('event');

    this.events.subscribe(this.onEvent);
  }

  /**
   * Executed every time an event is fired,
   * this method allows for general logging and more
   * 
   * @param event The event that was triggered
   */
  private onEvent(event: ElekIoCoreEvent) {
    console.log(`Event "${event.id}":`, event.data);
  }
}