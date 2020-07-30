import * as General from './general';
import * as Git from './git';
import * as Validate from './validate';
import Log from './log';

export default {
  ...General,
  git: Git,
  validate: Validate,
  log: Log
};