import Fs from 'fs-extra';
import Util from './util';
import Project from './project';

export default {
  init: async (): Promise<void> => {
    // Make sure the basic file structure is given
    await Fs.mkdirp(Util.pathTo.projects);
  },
  project: Project,
  projects: {
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
  },
  util: Util
};