import Path from 'path';
import Util from '../util';
import AbstractLogger from './AbstractLogger';

/**
 * Logger for logs that are not specific to a project
 */
export default class GlobalLogger extends AbstractLogger {

  constructor(fileName = 'core.log') {
    super(Path.join(Util.pathTo.logs, fileName));
  }
  
}