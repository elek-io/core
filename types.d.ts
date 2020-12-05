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