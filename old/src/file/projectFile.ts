import JsonFile from './jsonFile';
import { ProjectFileContent } from '../project';
import * as Util from '../util/general';
import Logger from '../logger/logger';

/**
 * Represents a file on disk that contains information about a project
 */
export default class ProjectFile extends JsonFile {
  public readonly defaultContent: ProjectFileContent = new ProjectFileContent();

  constructor(projectId: string, logger: Logger) {
    super(Util.pathTo.projectConfig(projectId), logger);
  }

  public async load(): Promise<ProjectFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(content: ProjectFileContent): Promise<void> {
    await super.save(this.heal(content, this.defaultContent, 'saving'));
  }
}