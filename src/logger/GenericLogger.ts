import Path from 'path';
import EventService from '../service/EventService';
import Util from '../util';
import AbstractLogger from './AbstractLogger';

/**
 * Logger for logs that are not specific to a project
 */
export default class GenericLogger extends AbstractLogger {

  constructor(fileName: string, eventService: EventService) {
    super(Path.join(Util.pathTo.logs, fileName), eventService);
  }
  
}