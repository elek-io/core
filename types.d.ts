interface CrudMethods<T> {
  create(model: T): Promise<T>;
  read(model: Partial<T>): Promise<T>;
  update(model: T): Promise<void>;
  delete(model: T): Promise<void>;
}

type MdFileContent = {
  jsonHeader: any;
  mdBody: string;
}

/**
 * Every status a page can have
 * 
 * Progressing through it is mostly linear
 */
declare enum PageStatusEnum {
  /**
   * Only visible to the author(s) himself / themselfes
   * 
   * Cannot be deployed
   */
  'private',
  /**
   * Work in progress
   * 
   * Visible to all editors but cannot be deployed
   */
  'wip',
  /**
   * Done but awaiting someone to review and approve 
   * or comment and set it back to wip
   * 
   * Highlighted to anyone who can approve but cannot be deployed
   */
  'pending',
  /**
   * Done and approved for publishing
   * 
   * Can be published manually or scheduled
   */
  'approved',
  /**
   * Scheduled to be published on a specific date and time
   * 
   * Only available via elek.io cloud
   */
  'scheduled',
  /**
   * Already available to the public
   * 
   * If edited, will be set back to wip
   * @todo check how this affects the published HTML site,
   * as we do not want to delete it. Maybe a new "revision" service would make sense
   */
  'published'
}

/**
 * Defines that one or more keys (K) of type (T) are optional
 */
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

type ProjectStatus = 'todo' | 'foo' | 'bar';
type PageStatus = keyof typeof PageStatusEnum;
type ServiceType = 'log' | 'project' | 'asset' | 'event' | 'file' | 'jsonFile' | 'mdFile';
type ModelType = 'project' | 'asset';

type GitSignature = {
  name: string;
  email: string;
}

type ElekIoCoreOptions = {
  signature: GitSignature;
}