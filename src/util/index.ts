import * as General from './general';
import * as Validator from './validator';

export default {
  ...General,
  validator: {
    ...Validator
  }
};