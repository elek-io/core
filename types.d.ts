import Project from './src2/model/Project';


interface CrudMethods<T> {
  create(model: T): Promise<T>;
  read(model: Partial<T>): Promise<T>;
  update(model: T): Promise<void>;
  delete(model: T): Promise<void>;
}

type ElekIoCoreEvent = {
  /**
   * ID describing the event divided by colons
   * 
   * E.g.: "page:create"
   */
  id: string;
  /**
   * Translatable string divided by dots
   * 
   * E.g.: page.created.title
   */
  title: string;
  /**
   * The project this event was triggered from
   */
  project?: Project;
  /**
   * Additional object all subscribers have access to
   */
  data?: Record<string, unknown>;
}

type MdFileContent = {
  jsonHeader: any;
  mdBody: string;
}

/**
 * Defines that one or more keys (K) of type (T) are optional
 */
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

type ProjectStatus = 'todo' | 'foo' | 'bar';
type ServiceType = 'log' | 'project' | 'asset' | 'event' | 'file' | 'jsonFile' | 'mdFile';
type ModelType = 'project' | 'asset';

type GitSignature = {
  name: string;
  email: string;
}

type ElekIoCoreOptions = {
  signature: GitSignature;
}