export enum ModelType {
  PROJECT = 'project',
  EVENT = 'event',
  ASSET = 'asset',
  PAGE = 'page',
  BLOCK = 'block',
  SNAPSHOT = 'snapshot',
  THEME = 'theme'
}

/**
 * Unique reference to a file of a model on disk
 */
export interface ModelReference {
  id: string;
  language: string | null;
  extension: string | null;
}