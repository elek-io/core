import Path from 'path';
import * as Util from '../util/general';
import Logger from './logger';

/**
 * Logger for logs that are not specific to a project
 */
export default class GlobalLogger extends Logger {

  constructor(fileName = 'core.log') {
    super(Path.join(Util.pathTo.logs, fileName));
  }
  
}