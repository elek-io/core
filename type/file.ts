import { JsonOf } from './general';

export interface MdFileContent<T> {
  jsonHeader: JsonOf<T>;
  mdBody: string;
}