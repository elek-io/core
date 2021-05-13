import { FieldInformation, FieldType } from '../../type/field';
import { ModelType } from '../../type/model';
import AbstractModelWithLanguage from './AbstractModelWithLanguage';


export default class Collection extends AbstractModelWithLanguage {
  /**
   * Name of the collection, visible in the client
   */
  public name: string;

  /**
   * Available fields of this collection
   */
  public fields: FieldInformation[];

  constructor(id: string, language: string, name: string, fields: FieldInformation[]) {
    super(id, language, ModelType.COLLECTION);
    
    this.name = name;
    this.fields = fields;
  }
}