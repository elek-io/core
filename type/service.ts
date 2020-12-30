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

export interface CrudService {
  create: (...args: any) => any;
  read: (...args: any) => any;
  update: (...args: any) => any;
  delete: (...args: any) => any;
}