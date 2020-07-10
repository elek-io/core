import * as General from './general';
import * as File from './file';
import * as Git from './git';

export default {
  ...General,
  ...File,
  git: Git
};