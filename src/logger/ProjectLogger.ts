import Path from 'path';
import EventService from '../service/EventService';
import Util from '../util';
import AbstractLogger from './AbstractLogger';

/**
 * Logger for logs that are specific to a project
 */
export default class ProjectLogger extends AbstractLogger {
  public readonly projectId: string;

  constructor(projectId: string, fileName: string, eventService: EventService) {
    super(Path.join(Util.pathTo.projectLogs(projectId), fileName), eventService);

    this.projectId = projectId;
  }
  
}
