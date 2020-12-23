import Path from 'path';
import Util from '../util';
import AbstractLogger from './AbstractLogger';

/**
 * Logger for logs that are specific to a project
 */
export default class ProjectLogger extends AbstractLogger {
  public readonly projectId: string;

  constructor(projectId: string, fileName = 'core.log') {
    super(Path.join(Util.pathTo.projectLogs(projectId), fileName));

    this.projectId = projectId;
  }
  
}