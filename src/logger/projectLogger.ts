import Path from 'path';
import * as Util from '../util';
import Logger from './logger';

/**
 * Logger for logs that are specific to a project
 */
export default class ProjectLogger extends Logger {

  constructor(projectId: string, fileName = 'core.log') {
    super(Path.join(Util.pathTo.projectLogs(projectId), fileName));
  }
  
}