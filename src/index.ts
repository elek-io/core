import * as Util from './util';
import Project from './project';

const projects = {
  /**
   * Returns a list of all local projects
   */
  local: async (): Promise<Project[]> => {
    // Get all subdirectories from the projects folder
    const possibleProjectDirectories = await Util.subdirectories(Util.pathTo.projects);
    // Return all projects we are able to resolve without throwing errors
    // for example if the user created an empty directory 
    return Util.returnResolved(possibleProjectDirectories.map((possibleProjectDirectory) => {
      return new Project().load(possibleProjectDirectory.name);
    }));
  },
  /**
   * Returns a list of all remote projects
   * @todo finish once elek.io API is available
   */
  remote: async (): Promise<Project[]> => {
    const projects: Project[] = [];
    return await Promise.all(projects);
  }
};

export default {
  project: Project,
  projects,
  util: Util
};