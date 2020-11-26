interface CrudMethods<T> {
  create(model: T): Promise<T>;
  read(model: Partial<T>): Promise<T>;
  update(model: T): Promise<void>;
  delete(model: T): Promise<void>;
}

interface ElekIoCoreEvent {
  /**
   * ID describing the event divided by colons
   * 
   * E.g.: "project:create"
   */
  id: string;
  /**
   * Translatable string divided by dots
   * 
   * E.g.: project.created.title
   */
  title: string;
  /**
   * Additional object all subscribers have access to
   */
  data?: Record<string, unknown>;
}

interface MdFileContent {
  jsonHeader: any;
  mdBody: string;
}

/**
 * Defines that one or more keys (K) of type (T) are optional
 */
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

type ProjectStatus = 'todo' | 'foo' | 'bar';
type ServiceType = 'project' | 'asset' | 'event' | 'file' | 'jsonFile' | 'mdFile';
type ModelType = 'project' | 'asset';