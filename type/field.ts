export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  IMAGE = 'image',
  DATETIME = 'datetime',
  BOOLEAN = 'boolean',
  MARKDOWN = 'markdown'
}

export interface FieldInformation {
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
}