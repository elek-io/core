import * as General from './general';
import * as Git from './git';
import * as Validator from './validator';

export default {
  ...General,
  git: {
    ...Git
  },
  validator: {
    ...Validator
  }
};