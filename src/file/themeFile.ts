import JsonFile from './jsonFile';
import { ThemeFileContent } from '../theme';
import * as Util from '../util/general';
import Logger from '../logger/logger';

/**
 * Represents a file on disk that contains information about the used theme
 */
export default class ThemeFile extends JsonFile {
  public readonly defaultContent: ThemeFileContent = new ThemeFileContent();

  constructor(projectId: string, logger: Logger) {
    super(Util.pathTo.themeConfig(projectId), logger);
  }

  public async load(): Promise<ThemeFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(): Promise<void> {
    throw new Error('Cannot modify theme config');
  }
}