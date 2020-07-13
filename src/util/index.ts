import * as General from './general';
import * as File from './file';
import * as Git from './git';
import * as Validate from './validate';

export default {
  ...General,
  ...File,
  git: Git,
  validate: Validate
};