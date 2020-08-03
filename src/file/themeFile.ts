import JsonFile from './jsonFile';
import { ThemeFileContent } from '../theme';
import * as Util from '../util';

/**
 * Represents a file on disk that contains information about the used theme
 */
export default class ThemeFile extends JsonFile {
  public readonly defaultContent: ThemeFileContent = new ThemeFileContent();

  constructor(projectId: string) {
    super(Util.pathTo.themeConfig(projectId));
  }

  public async load(): Promise<ThemeFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(): Promise<void> {
    throw new Error('Cannot modify theme config');
  }
}