import File from './file';

/**
 * Represents a file on disk that contains JSON
 */
export default class JsonFile extends File {

  constructor(path: string) {
    super(path);
  }

  /**
   * Reads the files content and returns it as JSON
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async load(): Promise<any> {
    return JSON.parse(await super.read());
  }

  /**
   * Writes given JSON content to the file
   * 
   * @param content the JSON content to save
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public async save(content: any): Promise<void> {
    await super.write(JSON.stringify(content, null, 2));
  }
}