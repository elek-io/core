import * as General from './general';
import * as Git from './git';
import * as Validate from './validate';

export default {
  ...General,
  git: {
    ...Git
  },
  validate: {
    ...Validate
  }
};