import JsonFile from './jsonFile';
import { ProjectFileContent } from '../project';
import { pathTo } from '../util/general';

/**
 * Represents a file on disk that contains information about a project
 */
export default class ProjectFile extends JsonFile {
  public readonly defaultContent: ProjectFileContent = new ProjectFileContent();

  constructor(projectId: string) {
    super(pathTo.projectConfig(projectId));
  }

  public async load(): Promise<ProjectFileContent> {
    return this.heal(await super.load(), this.defaultContent, 'loading');
  }

  public async save(content: ProjectFileContent): Promise<void> {
    await super.save(this.heal(content, this.defaultContent, 'saving'));
  }
}