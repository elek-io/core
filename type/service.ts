export enum ServiceType {
  LOG = 'log',
  GIT = 'git',
  PROJECT = 'project',
  ASSET = 'asset',
  PAGE = 'page',
  BLOCK = 'block',
  SNAPSHOT = 'snapshot',
  THEME = 'theme',
  EVENT = 'event',
  FILE = 'file',
  JSON_FILE = 'jsonFile',
  MD_FILE = 'mdFile'
}

/**
 * Implements create, read, update and delete methods
 */
export interface CrudService {
  create: (...args: any) => any;
  read: (...args: any) => any;
  update: (...args: any) => any;
  delete: (...args: any) => any;
}

/**
 * Implements listReferences, list and count methods
 * additionally to create, read, update and delete
 */
export interface ExtendedCrudService extends CrudService {
  listReferences: (...args: any) => any;
  list: (...args: any) => any;
  count: (...args: any) => any;
}